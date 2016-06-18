/*jslint node: true */
/*jslint white: true */
"use strict";

/*Spaces so these don't look retarded in GitHub*/
var util        = require('util'),
    fs          = require('fs'),
    udp         = require('dgram'),
    zlib        = require('zlib'),
    dns         = require('dns'),
    crypto      = require('crypto'),
    bn          = require('path').basename,
    EE          = require('events').EventEmitter,
	/* NPM Modules */
	Websocket   = require('ws'),
	needle      = require('needle'),
	nacl        = require('tweetnacl');

var CURRENT_VERSION = "1.x.x",
	UPDATED_VERSION,
	GATEWAY_VERSION = 5;

/* ----- Version Check ----- */
try {
	CURRENT_VERSION = require('../package.json').version;
	req('get', "https://registry.npmjs.org/discord.io", function(err, res) {
		if (err) return;
		try { UPDATED_VERSION = res.body['dist-tags'].latest; } catch(e) {return;}
		if (CURRENT_VERSION !== UPDATED_VERSION) console.log("[WARNING]: Your library (" + CURRENT_VERSION + ") is out of date. Please update discord.io to " + UPDATED_VERSION + ".");
	});
} catch(e) {}

/* ----- Classes ----- */
function DiscordClient(options) {
	var self = this;
	EE.call(this);
	if (!options || options.constructor.name !== 'Object') return console.log("An Object is required to create the discord.io client.");
	if (typeof(options.messageCacheLimit) !== 'number') options.messageCacheLimit = 50;

	/*Variables*/
	[
		["_GLOBAL_REQUEST_DELAY", 0],
		["_messageCacheLimit", options.messageCacheLimit],
		["_mainKeepAlive", null],
		["_messageCache", {}],
		["_ws", null],
		["_uIDToDM", {}],
		["_req", req]
	].forEach(function(t) {
		Object.defineProperty(this, t[0], {
			configurable: true,
			writable: true,
			value: t[1]
		});
	}, this);

	var /*GLOBAL_REQUEST_DELAY = this._GLOBAL_REQUEST_DELAY,
		ws                   = this._ws,
		mainKeepAlive        = this._mainKeepAlive,
		uIDToDM              = this._uIDToDM,
		messageCache         = this._messageCache,*/
		vChannels            = {},
		requests             = [];

	this.presenceStatus = "offline";
	this.connected = false;
	this.inviteURL = null;
	/*this._messageCacheLimit = options.messageCacheLimit;
	this._req = req;*/

	/*Voice*/
	self.joinVoiceChannel = function(channel, callback) {
		checkRS(function() {
			var server, token, session, endpoint, init;
			try {server = self.channels[channel].guild_id;} catch(e) {}
			if (!server) return handleErrCB(("Cannot find the server related to the channel provided: " + channel), callback);
			if (self.servers[server].channels[channel].type !== 'voice') return handleErrCB(("Selected channel is not a voice channel: " + channel), callback);
			if (vChannels[channel]) return handleErrCB(("Voice channel already active: " + channel), callback);

			vChannels[channel] = {guild_id: server};
			init = {
				"op": 4,
				"d": {
					"guild_id": server,
					"channel_id": channel,
					"self_mute": false,
					"self_deaf": false
				}
			};

			ws.on('message', handleVoice);
			send(ws, init);

			function handleVoice(message) {
				var data = JSON.parse(message);

				if (data.t === "VOICE_STATE_UPDATE") {
					if (data.d.user_id === self.id && data.d.channel_id !== null) session = data.d.session_id;
				} else if (data.t === "VOICE_SERVER_UPDATE") {
					token = data.d.token;
					server = data.d.guild_id;
					endpoint = data.d.endpoint;

					joinVoiceChannel(server, channel, token, session, endpoint, callback);
					ws.removeListener('message', handleVoice);
				}
			}
		});
	};
	self.leaveVoiceChannel = function(channel, callback) {
		checkRS(function() {
			if (!vChannels[channel]) return console.log("Not in the voice channel: " + channel);
			if (!vChannels[channel].ws || !vChannels[channel].udp) return console.log("Currently connecting to voice channel: " + channel + ", unable to leave until finished.");

			return leaveVoiceChannel(channel, callback);
		});
	};
	self.getAudioContext = function(channelObj, callback) {
		// #q/qeled assisted in getting the right audio encoding settings,
		// and a proper timing solution. Credit where it's due.
		checkRS(function() {
			var channel = typeof(channelObj) === 'object' ? channelObj.channel : channelObj;
			var audioChannels = channelObj.stereo === false ? 1 : 2;
			var client = vChannels[channel];
			var Opus, opusEncoder, speakingStart, speakingEnd;

			if (!client) return console.log("You have not joined the voice channel: " + channel);
			if (client.ready !== true) return console.log("The connection to the voice channel " + channel + " has not been initialized yet.");
			try { Opus = require('node-opus'); } catch(e) { console.log("Error requiring module: 'node-opus'"); console.log(e); return false; }

			opusEncoder = new Opus.OpusEncoder( 48000, 1 * audioChannels );
			speakingStart = { "op":5, "d":{ "speaking": true, "delay": 0 } };
			speakingEnd = { "op":5, "d":{ "speaking": false, "delay":0 } };

			util.inherits(AudioCB, EE);

			client.udp.audio = client.udp.audio || new AudioCB(audioChannels, opusEncoder, client);
			callback(client.udp.audio);

			function AudioCB(audioChannels, opusEncoder, client) {
				EE.call(this);
				var self = this, streamRef,
					playingAF = false, speakers = [],
					startTime, sequence = 0, timestamp = 0,
					port, address, secretKey,
					vWS = client.ws.connection,
					udpClient = client.udp.connection,
					VoicePacket = (function() { //Yay IIFEs :D
						var header = new Buffer(12),
							nonce = new Buffer(24),
							output = new Buffer(2048);

						header[0] = 0x80;
						header[1] = 0x78;
						header.writeUIntBE(client.ws.ssrc, 8, 4);

						nonce.fill(0);

						return function(packet, sequence, timestamp, key) {
							header.writeUIntBE(sequence, 2, 2);
							header.writeUIntBE(timestamp, 4, 4);
							//<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01>
							header.copy(nonce);
							//<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00>

							var encrypted = new Buffer(
								nacl.secretbox(
									new Uint8Array(packet),
									new Uint8Array(nonce),
									new Uint8Array(key)
								)
							);

							header.copy(output);
							encrypted.copy(output, 12);

							return output.slice(0, header.length + encrypted.length);
						};
					})();

				try {
					port = client.ws.port;
					address = client.address;
					secretKey = client.secretKey;
				} catch(e) {return;}

				function sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt) {
					var buff, encoded, audioPacket, nextTime;

					buff = streamOutput.read( 1920 * audioChannels );
					if (streamOutput.destroyed) return;

					sequence = sequence < 0xFFFF ? sequence + 1 : 0;
					timestamp = timestamp < 0xFFFFFFFF ? timestamp + 960 : 0;

					encoded = [0xF8, 0xFF, 0xFE];
					if (buff && buff.length === 1920 * audioChannels) encoded = opusEncoder.encode(buff);

					audioPacket = VoicePacket(encoded, sequence, timestamp, secretKey);
					nextTime = startTime + cnt * 20;

					try {
						//It throws a synchronous error if it fails (someone leaves the audio channel while playing audio)
						udpClient.send(audioPacket, 0, audioPacket.length, port, address, function(err) {});
					} catch(e) { return; }
					return setTimeout(function() {
						return sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt + 1);
					}, 20 + (nextTime - new Date().getTime()));
				}

				this.playAudioFile = function(location) {
					var childProc, spawn, spawnSync, encs = ['ffmpeg', 'avconv'], selection, enc;
					function choosePlayer(players) {
						if (!players[0]) return console.log("You need either 'ffmpeg' or 'avconv' and they need to be added to PATH");
						var n = players.shift();
						var s = spawnSync(n);
						if (s.error) return choosePlayer(players);
						console.log("Using " + n);
						return n;
					}
					if (playingAF) return console.log("Already playing something.");

					playingAF = true;
					childProc = require('child_process');
					spawn = childProc.spawn;
					spawnSync = childProc.spawnSync;
					selection = choosePlayer(encs);

					if (!selection) return;

					enc = spawn(selection , [
						'-i', location,
						'-f', 's16le',
						'-ar', '48000',
						'-ac', audioChannels,
						'pipe:1'
					], {stdio: ['pipe', 'pipe', 'ignore']});
					enc.stdout.once('end', function() {
						enc.kill();
						send(vWS, speakingEnd);
						playingAF = false;
						self.emit('fileEnd');
					});
					enc.stdout.once('error', function(e) {
						enc.stdout.emit('end');
					});
					enc.stdout.once('readable', function() {
						send(vWS, speakingStart);
						startTime = new Date().getTime();
						sendAudio(audioChannels, opusEncoder, enc.stdout, udpClient, vWS, 1);
					});
					streamRef = enc;
				};
				this.stopAudioFile = function(callback) {
					if (playingAF) {
						streamRef.stdout.end();
						streamRef.kill();
						playingAF = false;
					} else {
						console.log("Not playing anything.");
					}
					if (typeof(callback) === 'function') callback();
				};
				this.send = function(stream) { //If you're piping a stream, you can handle everything else.
					send(vWS, speakingStart);
					startTime = new Date().getTime();
					sendAudio(audioChannels, opusEncoder, stream, udpClient, vWS, 1);
				};

				function handleMsgEvent(msg) {
					var header = msg.slice(0, 12),
						nonce = new Buffer(24).fill(0),
						audio = msg.slice(12),
						ssrc = header.readUIntBE(8, 4),
						enc = speakers[ssrc] || new Opus.OpusEncoder( 48000, 1 * audioChannels ),
						decrypted;

					if (!speakers[ssrc]) speakers[ssrc] = enc;
					header.copy(nonce);

					try {
						decrypted = new Buffer(
							nacl.secretbox.open(
								new Uint8Array(audio),
								new Uint8Array(nonce),
								new Uint8Array(secretKey)
							)
						);

						self.emit('incoming', ssrc, enc.decode(decrypted));
					} catch (e) {}
				}

				function isFinalIncomingEvListener(event) {
					return event === 'incoming' && self.listenerCount('incoming') === 0 ? true : false
				}

				self.on('newListener', function(event) {
					if (isFinalIncomingEvListener(event)) {
						udpClient.on('message', handleMsgEvent);
					}
				});

				self.on('removeListener', function(event) {
					if (isFinalIncomingEvListener(event)) {
						udpClient.removeListener('message', handleMsgEvent);
					}
				});
			}
		});
	};

	self.connect = self.connect.bind(this, options);

	if (options.autorun && options.autorun === true) {
		self.connect();
	}

	/*Voice*/
	function joinVoiceChannel(server, channel, token, session, endpoint, callback) {
		var vKAPayload = {
			"op": 3,
			"d": null
		};
		var vKAI, vDiscIP = "", vDiscPort, vWS, udpClient, vEmitter = new EE();
		endpoint = endpoint.split(":")[0];

		dns.lookup(endpoint, function(err, address) {
			if (err) return console.log(err);

			vChannels[channel].address = address;
			vChannels[channel].ws = {};
			vChannels[channel].udp = {};
			vChannels[channel].ready = false;
			vWS = vChannels[channel].ws.connection = new Websocket("wss://" + endpoint);
			udpClient = vChannels[channel].udp.connection = udp.createSocket("udp4");

			udpClient.bind({exclusive: true});
			udpClient.once('message', function(msg, rinfo) {
				var buffArr = JSON.parse(JSON.stringify(msg)).data;
				for (var i=4; i<buffArr.indexOf(0, i); i++) {
					vDiscIP += String.fromCharCode(buffArr[i]);
				}
				vDiscPort = msg.readUIntLE(msg.length - 2, 2).toString(10);

				var wsDiscPayload = {
					"op":1,
					"d":{
						"protocol":"udp",
						"data":{
							"address":vDiscIP,
							"port": Number(vDiscPort),
							"mode":vChannels[channel].ws.modes[1] //'xsalsa20_poly1305'
						}
					}
				};
				send(vWS, wsDiscPayload);
			});

			vWS.once('open', function() {
				var vWSinit = {
					"op": 0,
					"d": {
						"server_id": server,
						"user_id": self.id,
						"session_id": session,
						"token": token
					}
				};
				
				send(vWS, vWSinit);
			});
			vWS.on('message', handleVoiceWS);
			vWS.once('close', function() {
				clearInterval(vKAI);
				vEmitter = undefined;
				return vWS.removeListener('message', handleVoiceWS);
			});
		});

		function handleVoiceWS(vMessage) {
			var vData = JSON.parse(vMessage);
			switch (vData.op) {
				case 2: //Ready (Actually means you're READY to initiate the UDP connection)
					for (var vKey in vData.d) {
						vChannels[channel].ws[vKey] = vData.d[vKey];
					}

					vKAI = setInterval(function() {
						send(vWS, vKAPayload);
					}, vData.d.heartbeat_interval);

					var udpDiscPacket = new Buffer(70);
					udpDiscPacket.writeUIntBE(vData.d.ssrc, 0, 4);
					udpClient.send(udpDiscPacket, 0, udpDiscPacket.length, vData.d.port, vChannels[channel].address, function(err) { if (err) console.log(err); });
					break;
				case 4: //Session Discription (Actually means you're ready to send audio... stupid Discord Devs :I)
					vChannels[channel].selectedMode = vData.d.mode;
					vChannels[channel].secretKey = vData.d.secret_key;
					vChannels[channel].ready = true;
					if (callback && typeof(callback) === 'function') callback(null, vEmitter);
					break;
				case 5: //Speaking (At least this isn't confusing!)
					vEmitter.emit('speaking', vData.d.user_id, vData.d.ssrc, vData.d.speaking);
					break;
			}
		}

		(function changeVoiceChannel(channel, session) {
			/*Listen for any websocket events that say that this audio client
			changed voice channels. The session token will differentiate our
			session from any other audio sessions using the same account*/
			ws.once('message', function(m) {
				m = JSON.parse(m);
				if (
					(m.t !== 'VOICE_STATE_UPDATE') ||
					(m.d.session_id !== session) ||
					((vChannels[channel]) && m.d.guild_id !== vChannels[channel].guild_id)
				) return changeVoiceChannel(channel, session);
				if (m.d.channel_id === null) return leaveVoiceChannel(channel);
				if (m.d.channel_id != channel) {
					vChannels[m.d.channel_id] = vChannels[channel];
					delete vChannels[channel];
					changeVoiceChannel(m.d.channel_id, session);
				}
			});
		})(channel, session);
	}
	function leaveVoiceChannel(channel, callback) {
		if (!vChannels[channel]) return;

		vChannels[channel].ws.connection.close();
		vChannels[channel].udp.connection.close();
		send(ws, {
			op:4,
			d: {
				guild_id: self.channels[channel].guild_id,
				channel_id: null,
				self_mute: false,
				self_deaf: false
			}
		});
		delete vChannels[channel];
		console.log("Voice connection closed for channel: " + channel);

		if (typeof(callback) === 'function') callback(null);
	}
	/*Utils*/
	function req(method, url) {
		setTimeout(apiRequest.bind.apply(apiRequest, [self, arguments[0], arguments[1], arguments[2], arguments[3]]), self.GLOBAL_REQUEST_DELAY);
	}

	function resolveID(ID, callback) {
		/*Get channel from ServerID, ChannelID or UserID.
		Only really used for sendMessage and uploadFile.*/
		//Callback used instead of return because requesting seems necessary.

		if (uIDToDM[ID]) return callback(uIDToDM[ID]);
		//If it's a UserID, and it's in the UserID : ChannelID cache, use the found ChannelID

		//If the ID isn't in the UserID : ChannelID cache, let's try seeing if it belongs to a user.
		if (self.users[ID]) return self.createDMChannel(ID, function(err, res) {
			if (err) return console.log("Internal ID resolver error: " + err);
			callback(res.body.id);
		});

		return callback(ID); //Finally, the ID must not belong to a User, so send the message directly to it, as it must be a Channel's.
	}
}
function DiscordOAuth(opts, cb) {
	if (!opts.token) return
}
util.inherits(DiscordClient, EE);

/* ----- Functions ----- */
function handleErrCB(err, callback) {
	if (typeof(callback) !== 'function') return;
	return callback({message: err});
}
function handleResCB(errMessage, err, res, callback) {
	if (typeof(callback) !== 'function') return;
	if (!res) res = {};
	var e = {
		message: err || errMessage,
		statusCode: res.statusCode,
		statusMessage: res.statusMessage,
		response: res.body
	};
	if (err || !checkStatus(res)) return callback(e);
	return callback(null, res.body);
}
function checkStatus(response) {
	return (response.statusCode / 100 | 0) === 2;
}
function stringifyError(response) {
	if (!response) return null;
	return response.statusCode + " " + response.statusMessage + "\n" + JSON.stringify(response.body);
}

/* - Functions - Messages - */
function cacheMessage(cache, limit, channel, message) {
	if (!cache[channel]) cache[channel] = {};
	if (limit === null) return cache[channel][message.id] = message;
	var k = Object.keys(cache[channel]);
	if (k.length > limit) delete cache[channel][k[0]];
	cache[channel][message.id] = message;
}
function generateMessage(channelID, message) {
	return {
		content: String(message),
		nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
	};
}
function messageHeaders() {
	var r = {
		"accept": "*/*",
		"accept-encoding": "gzip, deflate",
		"accept-language": "en-US;q=0.8",
		"dnt": "1",
		"user-agent": "DiscordBot (https://github.com/izy521/discord.io, " + this.internals.version + ")"
	};
	if (this.internals.token) r.authorization = (this.bot ? "Bot " + this.internals.token : this.internals.token);
	return r;
}

/* - Functions - Utils */
function apiRequest(method, url) {
	var data, callback, isJSON;
	if (typeof(arguments[2]) === 'function') { callback = arguments[2]; } else { data = arguments[2]; callback = arguments[3]; }
	isJSON = (function() {
		if (typeof(data) === 'object') if (data.qs) return (delete data.qs, false); else return true;
		return false;
	})();
	return needle.request(method, url, data, { multipart: (typeof(data) === 'object' && !!data.file), headers: messageHeaders.call(this), json: isJSON }, callback);
}
/* - Functions - Utils - Synchronous */
function send(ws, data) {
	if (ws.readyState == 1) {
		ws.send(JSON.stringify(data));
	}
}
function serverFromChannel(channel) {
	var serverArray = Object.keys(this.servers);
	for (var i=0; i<serverArray.length; i++) {
		if (this.servers[serverArray[i]].channels[channel]) return serverArray[i];
	}
}
function copy(obj) {
	try {
		return JSON.parse( JSON.stringify( obj ) );
	} catch(e) {}
}
function copyKeys(from, to, omit) {
	if (!omit) omit = [];
	for (var key in from) {
		if (omit.indexOf(key) > -1) continue;
		to[key] = from[key];
	}
}
function type(v) {
	return Object.prototype.toString.call(v).match(/ (.*)]/)[1].toLowerCase();
}
function emit(client, message) {
	if (!message.t) return;
	var args = [message.t.toLowerCase().split("_").map(function(e, i) {
		if (i === 0) return e;
		return e.slice(0,1).toUpperCase() + e.slice(1);
	}).join("")];

	for (var i=2; i<arguments.length; i++) {
		args.push(arguments[i]);
	}
	args.push(message);
	client.emit.apply(client, args);
}
function encryptToken(token, unpwd) {
	var cipher = crypto.createCipher('aes-256-cbc', unpwd);
	var crypted = cipher.update(token, 'utf8', 'hex');
	crypted += cipher.final('hex');
	return crypted;
}
function decryptToken(token, unpwd) {
	var decipher = crypto.createDecipher('aes-256-cbc', unpwd);
	var dec = decipher.update(token, 'hex', 'utf8');
	dec += decipher.final('utf8');
	return dec;
}

/*Prototypes*/
function Resource() {}
Object.defineProperty(Resource.prototype, "creation_time", {
	get: function() { return (+this.id / 4194304) + 1420070400000; },
	set: function(v) { return; }
});
[Server, Channel, DMChannel, User, Member, Role].forEach(function(p) {
	p.prototype = Object.create(Resource.prototype);
	Object.defineProperty(p.prototype, 'constructor', {value: p, enumerable: false});
});

function Server(client, data) {
	var server = this;

	//Accept everything now and trim what we don't need, manually. Any data left in is fine, any data left out could lead to a broken lib.
	copyKeys(data, this);
	if (data.unavailable) return;

	//Objects so we can use direct property accessing without for loops
	this.channels = {};
	this.members = {};
	this.roles = {};

	//Copy the data into the objects using IDs as keys
	data.channels.forEach(function(channel) {
		client.channels[channel.id] = new Channel(client, server, channel);
	});
	data.members.forEach(function(member) {
		client.users[member.user.id] = new User(member.user);
		server.members[member.user.id] = new Member(client, member);
	});
	data.presences.forEach(function(presence) {
		var id = presence.user.id;
		delete(presence.user);

		client.users[id].game = presence.game;
		server.members[id].status = presence.status;
	});
	data.roles.forEach(function(role) {
		server.roles[role.id] = new Role(role);
	});
	data.voice_states.forEach(function(vs) {
		var cID = vs.channel_id;
		var uID = vs.user_id;
		if (!server.channels[cID]) return;
		if (!server.members[uID]) return;
		server.channels[cID].members[uID] = vs;
		server.members[uID].voice_channel_id = cID;
	});

	//Now we can get rid of any of the things we don't need anymore
	delete(this.voice_states);
	delete(this.presences);
}
function Channel(client, server, data) {
	var channel = this;
	this.members = {};
	this.guild_id = server.id;
	copyKeys(data, this);
	Object.defineProperty(server.channels, channel.id, {
		get: function() { return client.channels[channel.id]; },
		set: function(v) { client.channels[channel.id] = v },
		enumerable: true,
		configurable: true
	});

	delete(this.is_private);
}
function DMChannel(translator, data) {
	copyKeys(data, this);
	translator[data.recipient.id] = data.id;
	delete(this.is_private);
}
function User(data) {
	copyKeys(data, this);
	this.bot = this.bot || false;
}
function Member(client, data) {
	this.id = data.user.id;
	copyKeys(data, this, ['user']);
	['username', 'discriminator', 'bot', 'avatar', 'game'].forEach(function(k) {
		if (k in Member.prototype) return;

		Object.defineProperty(Member.prototype, k, {
			get: function() { return client.users[this.id][k] },
			set: function(v) { client.users[this.id][k] = v },
			enumerable: true,
		});
	});
}
function Role(data) {
	copyKeys(data, this);
}

Server.update = function(client, data) {
	if (!client.servers[data.id]) client.servers[data.id] = {};
	for (var key in data) {
		if (key === 'roles') {
			data[key].forEach(function(r) {
				client.servers[data.id].roles[r.id] = new Role(r);
			});
			continue;
		}
		client.servers[data.id][key] = data[key];
	}
};
Channel.update = function(client, data) {
	if (!client.channels[data.id]) client.channels[data.id] = {};
	for (var key in data) {
		client.channels[data.id][key] = data[key];
	}
	delete(client.channels[data.id].is_private);
};
Member.update = function(server, data) {
	if (!server.members[data.user.id]) server.members[data.user.id] = {};
	copyKeys(data, server.members[data.user.id], ['user']);
};
Role.update = function(server, data) {
	if (!server.roles[data.role.id]) server.roles[data.role.id] = {};
	var role = server.roles[data.role.id];
	copyKeys(data.role, role);
};

Role.prototype.color_values = {
	DEFAULT: 0,
	AQUA: 1752220,
	GREEN: 3066993,
	BLUE: 3447003,
	PURPLE: 10181046,
	GOLD: 15844367,
	ORANGE: 15105570,
	RED: 15158332,
	GREY: 9807270,
	DARKER_GREY: 8359053,
	NAVY: 3426654,
	DARK_AQUA: 1146986,
	DARK_GREEN: 2067276,
	DARK_BLUE: 2123412,
	DARK_PURPLE: 7419530,
	DARK_GOLD: 12745742,
	DARK_ORANGE: 11027200,
	DARK_RED: 10038562,
	DARK_GREY: 9936031,
	LIGHT_GREY: 12370112,
	DARK_NAVY: 2899536
};

Object.defineProperty(Role.prototype, "permission_values", {
	get: function() { return this },
	set: function(v) {},
	enumerable: true
});
function getPerm(bit) {
	return function() {
		return ((this.permissions >> bit) & 1) == 1;
	};
}
function setPerm(bit) {
	return function(v) {
		if (v === true) return this.permissions |= (1 << (bit));
		if (v === false) return this.permissions &= ~(1 << bit);
	};
}

/*Preparing people for v2*/
DiscordClient.Client = DiscordClient;
DiscordClient.OAuth = DiscordOAuth;
DiscordClient.Codes = {};
DiscordClient.Codes.WebSocket = {
	"4000": "Unknown Error",
	"4001": "Unknown Opcode",
	"4002": "Decode Error",
	"4003": "Not Authenticated",
	"4004": "Authentication Failed",
	"4005": "Already Authenticated",
	"4006": "Session Not Valid",
	"4007": "Invalid Sequence Number",
	"4008": "Rate Limited",
	"4009": "Session Timeout",
	"4010": "Invalid Shard"
};
DiscordClient.Permissions = {
	GENERAL_CREATE_INSTANT_INVITE: 0,
	GENERAL_KICK_MEMBERS: 1,
	GENERAL_BAN_MEMBERS: 2,
	GENERAL_ADMINISTRATOR: 3,
	GENERAL_MANAGE_CHANNELS: 4,
	GENERAL_MANAGE_GUILD: 5,
	GENERAL_MANAGE_ROLES: 28,
	GENERAL_MANAGE_NICKNAMES: 27,
	GENERAL_CHANGE_NICKNAME: 26,
	
	TEXT_READ_MESSAGES: 10,
	TEXT_SEND_MESSAGES: 11,
	TEXT_SEND_TTS_MESSAGE: 12,
	TEXT_MANAGE_MESSAGES: 13,
	TEXT_EMBED_LINKS: 14,
	TEXT_ATTACH_FILES: 15,
	TEXT_READ_MESSAGE_HISTORY: 16,
	TEXT_MENTION_EVERYONE: 17,
	
	VOICE_CONNECT: 20,
	VOICE_SPEAK: 21,
	VOICE_MUTE_MEMBERS: 22,
	VOICE_DEAFEN_MEMBERS: 23,
	VOICE_MOVE_MEMBERS: 24,
	VOICE_USE_VAD: 25
};

Object.keys(DiscordClient.Permissions).forEach(function(pn) {
	Object.defineProperty(Role.prototype, pn, {
		get: getPerm( DiscordClient.Permissions[pn] ),
		set: setPerm( DiscordClient.Permissions[pn] ),
		enumerable: true
	});
});


module.exports = DiscordClient;
