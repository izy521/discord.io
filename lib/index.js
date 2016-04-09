/*jslint node: true */
"use strict";

var util = require("util"),
	EE = require("events").EventEmitter,
	websocket = require('ws'),
	fs = require('fs');

function DiscordClient(options) {
	var self = this;
	EE.call(self);
	self.connected = false;
	if (!options || options.constructor.name !== 'Object') return console.log("An Object is required to create the discord.io client.");
	if (typeof(options.messageCacheLimit) !== 'number') options.messageCacheLimit = 50;

	/*Variables*/
	var needle = require('needle'),
		udp = require('dgram'),
		zlib = require('zlib'),
		dns = require('dns'),
		crypto = require('crypto'),
		nacl = require('tweetnacl'),
		bn = require('path').basename,
		ws, KAi, cv, uv,
		vChannels = {}, uIDToDM = {}, messageCache = {},
		actionQ = [];
	/*Version check*/
	try {
		cv = require('../package.json').version;
		req('get', "https://registry.npmjs.org/discord.io", function(err, res) {
			if (err) return;
			try { uv = res.body['dist-tags'].latest; } catch(e) {return;}
			if (cv !== uv) console.log("[WARNING]: Your library (" + cv + ") is out of date. Please update discord.io to " + uv + ".")
		});
	} catch(e) {}

	/*Internal Functions*/
	/*Initializing*/
	function init() {
		self.servers = {};
		self.internals = {};
		self.directMessages = {};
		self.internals.version = cv || "1.x.x";

		getToken();
	}
	function getToken() {
		if (options.token) return getGateway(options.token, true);

		var et;
		try {
			et = fs.readFileSync('./tenc', 'utf-8');
			fs.unlinkSync('./tenc');
			return getGateway(decryptToken(et, String(options.email + options.password)));
		} catch(e) {}

		console.log("No token provided, and unable to parse 'tenc'. Using login method.");
		req('post', "https://discordapp.com/api/auth/login", {email: options.email, password: options.password}, function (err, res) {
			if (err || !checkStatus(res)) {
				console.log("Error POSTing login information: \n" + checkError(res));
				return self.emit("disconnected");
			}
			getGateway(res.body.token);
		});
	}
	function getGateway(token, explicit) {
		self.internals.token = token;
		//request = request.defaults({'headers': messageHeaders(), 'gzip': true});

		req('get', "https://discordapp.com/api/gateway", function (err, res) {
			if (err || !checkStatus(res)) {
				console.log("Error GETing gateway list: " + checkError(res));
				if (explicit) console.log("Incorrect login token provided.");
				return self.emit("disconnected");
			}
			startConnection(res.body.url);
		});
	}
	function startConnection(gateway) {
		ws = new websocket(gateway);
		self.internals.gatewayUrl = gateway;
		self.presenceStatus = 'online';
		self.connected = true;

		ws.once('open', handleWSOpen);
		ws.once('close', handleWSClose);
		ws.once('error', handleWSClose);
		ws.on('message', handleWSMessage);

		self.internals.settings = {};
		req('get', "https://discordapp.com/api/users/@me/settings", function(err, res) {
			if (err || !checkStatus(res)) return console.log("Error GETing client settings: " + checkError(res));
			for (var sItem in res.body) {
				self.internals.settings[sItem] = res.body[sItem];
			}
		});
	}
	function getServerInfo(servArr) {
		for (var server=0; server<servArr.length; server++) {
			self.servers[servArr[server].id] = new Server(servArr[server]);
		}
	}
	function getDirectMessages(DMArray) {
		for (var DM=0; DM<DMArray.length; DM++) {
			delete(DMArray[DM].is_private);
			self.directMessages[DMArray[DM].id] = DMArray[DM];
			uIDToDM[DMArray[DM].recipient.id] = DMArray[DM].id;
		}
	}
	function getOfflineUsers(servArr) {
		if (!servArr[0]) return;

		ws.send(
			JSON.stringify(
				{
					op: 8,
					d: {
						guild_id: servArr.splice(0, 50).filter(function(s) {
							return self.servers[s].large;
						}),
						query: "",
						limit: 0
					}
				}
			)
		);
		return getOfflineUsers(servArr);
	}

	/*Messages*/
	function messageHeaders() {
		var r = {
			"accept": "*/*",
			"accept-encoding": "gzip, deflate",
			"accept-language": "en-US;q=0.8",
			"dnt": "1",
			"user-agent": "DiscordBot (https://github.com/izy521/discord.io, " + cv + ")"
		};
		if (self.internals.token) r.authorization = (self.bot ? "Bot " + self.internals.token : self.internals.token)
		return r;
	}
	function generateMessage(channelID, message) {
		return {
			content: String(message),
			nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
		}
	}
	function cacheMessage(channel, message) {
		if (!messageCache[channel]) messageCache[channel] = {};
		var k = Object.keys(messageCache[channel]);
		if (k.length > options.messageCacheLimit) delete messageCache[channel][k[0]];
		messageCache[channel][message.id] = message;
	}

	/*Handling*/
	function handleWSOpen() {
		var initObj = {
			"op":2,
			"d": {
				"token": self.internals.token,
				"properties": {
					"$os":require('os').platform(),
					"$browser":"discord.io",
					"$device":"discord.io",
					"$referrer":"",
					"$referring_domain":""
				},
			"v": 4,
			"compress": !!zlib.inflateSync,
			"large_threshold": 250
			}
		}
		ws.send(JSON.stringify(initObj));
	}
	function handleWSMessage(data, flags) {
		var message = flags.binary ? JSON.parse(zlib.inflateSync(data).toString()) : JSON.parse(data);

		try {
			self.internals.sequence = message.s;
		} catch(e) {}

		//Events
		self.emit('debug', message);
		switch (message.t) {
			case "READY":
				for (var userItem in message.d.user) {
					self[userItem] = message.d.user[userItem];
				}
				try {
					if (!options.token) fs.writeFileSync('./tenc', encryptToken(self.internals.token, String(options.email + options.password)));
				} catch(e) {}

				getServerInfo(message.d.guilds);
				getDirectMessages(message.d.private_channels);

				KAi = setInterval(function() {
					//Send Keep Alive Data
					if (ws.readyState == 1) {
						ws.send(JSON.stringify({op: 1, d: self.internals.sequence}));
					}
				}, message.d.heartbeat_interval);

				return (function checkForAllUsers() {
					if (
						Object.keys(self.servers).every(function(s) {
							return !self.servers[s].unavailable
						})
					) return self.emit('ready', message)
					setTimeout(checkForAllUsers, 0);
				})();
			case "MESSAGE_CREATE":
				self.emit('message', message.d.author.username, message.d.author.id, message.d.channel_id, message.d.content, message);
				emit(message, message.d.author.username, message.d.author.id, message.d.channel_id, message.d.content);
				return cacheMessage(message.d.channel_id, message.d);
			case "MESSAGE_UPDATE":
				try {
					emit(message, messageCache[message.d.channel_id][message.d.id], message.d);
				} catch (e) { emit(message, undefined, message.d); }
				return cacheMessage(message.d.channel_id, message.d);
			case "PRESENCE_UPDATE":
				var server;
				if (!message.d['guild_id']) break;
				server = message.d.guild_id;
				if (!self.servers[server].members[message.d.user.id]) {
					self.servers[server].members[message.d.user.id] = { user : {} };
				}

				for (var userItem in message.d) {
					if (userItem != "guild_id") {
						if (userItem === "user") {
							for (var uuItem in message.d[userItem]) {
								self.servers[server].members[message.d.user.id][userItem][uuItem] = message.d[userItem][uuItem];
							}
						} else {
							self.servers[server].members[message.d.user.id][userItem] = message.d[userItem];
						}
					}
				}
				self.emit('presence', self.servers[server].members[message.d.user.id].user.username, message.d.user.id, message.d.status, message.d.game ? message.d.game.name : null , message);
				break;
			case "USER_UPDATE":
				for (var userItem in message.d) {
					self[userItem] = message.d[userItem];
				}
				break;
			case "USER_SETTINGS_UPDATE":
				for (var userItem in message.d) {
					self.internals[userItem] = message.d[userItem];
				}
				break;
			case "GUILD_CREATE":
				/*The lib will attempt to create the server using the response from the
				REST API, if the user using the lib creates the server. There are missing keys, however.
				So we still need this GUILD_CREATE event to fill in the blanks.
				If It's not our created server, then there will be no server with that ID in the cache,
				So go ahead and create one.*/
				self.servers[message.d.id] = new Server(message.d);
				break;
			case "GUILD_UPDATE":
				if (!self.servers[message.d.id]) self.servers[message.d.id] = {};
				var old = self.servers[message.d.id];
				for (var key in message.d) {
					if (message.d[key] instanceof Array) {
						message.d[key].forEach(function(item) {
							self.servers[message.d.id][key][item.id] = item;
						});
						continue;
					}
					self.servers[message.d.id][key] = message.d[key];
				}
				return emit(old, self.servers[message.d.id]);
			case "GUILD_DELETE":
				emit(message, self.servers[message.d.id]);
				return delete self.servers[message.d.id];
			case "GUILD_MEMBER_ADD":
				self.servers[message.d.guild_id].members[message.d.user.id] = {};
				for (var userItem in message.d) {
					self.servers[message.d.guild_id].members[message.d.user.id][userItem] = message.d[userItem];
				}
				self.servers[message.d.guild_id].member_count += 1;
				return emit(message, self.servers[message.d.guild_id].members[message.d.user.id]);
			case "GUILD_MEMBER_UPDATE":
				if (!self.servers[message.d.guild_id].members[message.d.user.id]) {
					self.servers[message.d.guild_id].members[message.d.user.id] = {};
				}
				var old = self.servers[message.d.guild_id].members[message.d.user.id];
				self.servers[message.d.guild_id].members[message.d.user.id].user = message.d.user;
				self.servers[message.d.guild_id].members[message.d.user.id].roles = message.d.roles;
				return emit(message, old, self.servers[message.d.guild_id].members[message.d.user.id]);
			case "GUILD_MEMBER_REMOVE":
				if (!self.servers[message.d.guild_id]) break;
				self.servers[message.d.guild_id].member_count -= 1;
				emit(message, self.servers[message.d.guild_id].members[message.d.user.id]);
				return delete self.servers[message.d.guild_id].members[message.d.user.id];
			case "GUILD_ROLE_CREATE":
				if (self.servers[message.d.guild_id].roles[message.d.role.id]) break;
				self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.role);
				break;
			case "GUILD_ROLE_UPDATE":
				var old = self.servers[message.d.guild_id].roles[message.d.role.id];
				self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.role);
				return emit(message, old, self.servers[message.d.guild_id].roles[message.d.role.id]);
			case "GUILD_ROLE_DELETE":
				emit(message, self.servers[message.d.guild_id].roles[message.d.role_id]);
				return delete self.servers[message.d.guild_id].roles[message.d.role_id];
			case "CHANNEL_CREATE":
				if (message.d.is_private === true) {
					if (self.directMessages[message.d.id]) return;
					self.directMessages[message.d.id] = {};
					uIDToDM[message.d.recipient.id] = message.d.id;
					delete(message.d.is_private);
					for (var DMItem in message.d) {
						self.directMessages[message.d.id][DMItem] = message.d[DMItem];
					}
				} else {
					if (self.servers[message.d.guild_id].channels[message.d.id]) return;
					self.servers[message.d.guild_id].channels[message.d.id] = {};
					for (var ChItem in message.d) {
						if (['guild_id', 'is_private'].indexOf(ChItem) === -1) {
							self.servers[message.d.guild_id].channels[message.d.id][ChItem] = message.d[ChItem];
						}
					}
				}
				break;
			case "CHANNEL_UPDATE":
				if (!self.servers[message.d.guild_id].channels[message.d.id]) {
					self.servers[message.d.guild_id].channels[message.d.id] = {};
				}
				var old = self.servers[message.d.guild_id].channels[message.d.id];
				for (var ChItem in message.d) {
					if (['guild_id', 'is_private'].indexOf(ChItem) === -1) {
						self.servers[message.d.guild_id].channels[message.d.id][ChItem] = message.d[ChItem];
					}
				}
				return emit(message, old, self.servers[message.d.guild_id].channels[message.d.id]);
			case "CHANNEL_DELETE":
				if (message.d.is_private === true) {
					emit(message, self.directMessages[message.d.id]);
					delete self.directMessages[message.d.id];
					return delete uIDToDM[message.d.recipient.id];
				}
				emit(message, self.servers[message.d.guild_id].channels[message.d.id]);
				return delete self.servers[message.d.guild_id].channels[message.d.id];
			case "VOICE_STATE_UPDATE":
				var vcid;
				try {
					vcid = self.servers[message.d.guild_id].members[message.d.user_id].voice_channel_id;
					if (vcid)
						delete self.servers[message.d.guild_id].channels[vcid].members[message.d.user_id];
					if (message.d.channel_id)
						self.servers[message.d.guild_id].channels[message.d.channel_id].members[message.d.user_id] = message.d;
						self.servers[message.d.guild_id].members[message.d.user_id].voice_channel_id = message.d.channel_id;
				} catch(e) {}
				break;
			case "GUILD_MEMBERS_CHUNK":
				var members = message.d.members;
				var serverID = message.d.guild_id;
				if (!self.servers[serverID].members) self.servers[serverID].members = {};

				return members.forEach(function(user) {
					if (self.servers[serverID].members[user.user.id]) return;
					self.servers[serverID].members[user.user.id] = new Member(user);
				});
		}
		return emit(message);
	}
	function handleWSClose(code, data) {
		clearInterval(KAi);
		self.connected = false;
		console.log("Gateway websocket closed: %s %s", code, data);
		ws.removeListener('message', handleWSMessage);
		ws = undefined;
		self.emit("disconnected");
	}
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
		}
		if (err || !checkStatus(res)) return callback(e);
		return callback(undefined, res.body);
	}

	/*Checking*/
	function checkRS(callback) {
		if (ws) {
			if (ws.readyState && ws.readyState == 1) return callback();
			return console.log("The bot is not connected yet");
		}
	}
	function checkStatus(response) {
		return (response.statusCode / 100 | 0) === 2
	}
	function checkError(response) {
		if (!response) return null;
		return response.statusCode + " " + response.statusMessage + "\n" + JSON.stringify(response.body);
	}

	/*Voice*/
	function joinVoiceChannel(server, channel, token, session, endpoint, callback) {
		var vKAPayload = {
			"op": 3,
			"d": null
		}
		var vKAI, vDiscIP = "", vDiscPort, vWS, udpClient, vEmitter = new EE();
		endpoint = endpoint.split(":")[0];

		dns.lookup(endpoint, function(err, address) {
			if (err) return console.log(err);

			vChannels[channel].address = address;
			vChannels[channel].ws = {};
			vChannels[channel].udp = {};
			vChannels[channel].ready = false;
			vWS = vChannels[channel].ws.connection = new websocket("wss://" + endpoint);
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
				}
				vWS.send(JSON.stringify(wsDiscPayload));
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

				vWS.send(JSON.stringify(vWSinit));
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
						vWS.send(JSON.stringify(vKAPayload));
					}, vData.d.heartbeat_interval);

					var udpDiscPacket = new Buffer(70);
					udpDiscPacket.writeUIntBE(vData.d.ssrc, 0, 4);
					udpClient.send(udpDiscPacket, 0, udpDiscPacket.length, vData.d.port, vChannels[channel].address, function(err) { if (err) console.log(err); });
					break;
				case 4: //Session Discription (Actually means you're ready to send audio... stupid Discord Devs :I)
					vChannels[channel].selectedMode = vData.d.mode;
					vChannels[channel].secretKey = vData.d.secret_key;
					vChannels[channel].ready = true;
					if (callback && typeof(callback) === 'function') callback(vEmitter);
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
				if (m.t !== 'VOICE_STATE_UPDATE') return changeVoiceChannel(channel, session);
				if (m.d.session_id !== session) return changeVoiceChannel(channel, session);
				if (m.d.channel_id == null) return leaveVoiceChannel(channel)
				if (m.d.channel_id != channel) {
					vChannels[m.d.channel_id] = vChannels[channel];
					delete vChannels[channel];
					channel = m.d.channel_id;
				}
				changeVoiceChannel(channel, session);
			});
		})(channel, session);
	}
	function leaveVoiceChannel(channel, callback) {
		if (!vChannels[channel]) return;

		vChannels[channel].ws.connection.close();
		vChannels[channel].udp.connection.close();
		ws.send(JSON.stringify({
			op:4,
			d: {
				guild_id: serverFromChannel(channel),
				channel_id: null,
				self_mute: false,
				self_deaf: false
			}
		}));
		delete vChannels[channel];
		console.log("Voice connection closed for channel: " + channel);

		if (typeof(callback) === 'function') callback();
	}
	/*Utils*/
	function emit(message) {
		if (!message.t) return;
		var args = [message.t.toLowerCase().split("_").map(function(e, i) {
			if (i === 0) return e;
			return e.slice(0,1).toUpperCase() + e.slice(1);
		}).join("")];

		for (var i=1; i<arguments.length; i++) {
			args.push(arguments[i]);
		}
		args.push(message);
		self.emit.apply(self, args);
	}
	function req(method, url) {
		var data, callback, isJSON;
		if (typeof(arguments[2]) === 'function') callback = arguments[2]; else (data = arguments[2], callback = arguments[3]);
		isJSON = (function() {
			if (typeof(data) === 'object') if (data.qs) return (delete data.qs, false); else return true;
    		return false;
		})();
		return needle.request(method, url, data, { multipart: (typeof(data) === 'object' && !!data.file), headers: messageHeaders(), json: isJSON }, callback);
	}
	function resolveID(ID, callback) {
		/*Get channel from ServerID, ChannelID or UserID.
		Only really used for sendMessage and uploadFile.*/
		//Callback used instead of return because requesting seems necessary.

		if (ID in uIDToDM) return callback(uIDToDM[ID]);
		//If it's a UserID, and it's in the UserID : ChannelID cache, use the found ChannelID

		for (var server in self.servers) { //If the ID isn't in the UserID : ChannelID cache, let's try seeing if it belongs to a user.
			if ((self.servers[server].members) && ID in self.servers[server].members) return self.createDMChannel(ID, callback);
		}

		return callback(ID); //Finally, the ID must not belong to a User, so send the message directly to it, as it must be a Channel's.
	}
	/*Synchronous*/
	function serverFromChannel(channel) {
		var serverArray = Object.keys(self.servers);
		for (var i=0; i<serverArray.length; i++) {
			if (self.servers[serverArray[i]].channels[channel]) return serverArray[i];
		}
	}
	function encryptToken(token, unpwd) {
		var cipher = crypto.createCipher('aes-256-cbc', unpwd)
		var crypted = cipher.update(token, 'utf8', 'hex')
		crypted += cipher.final('hex');
		return crypted;
	}
	function decryptToken(token, unpwd) {
		var decipher = crypto.createDecipher('aes-256-cbc', unpwd)
		var dec = decipher.update(token, 'hex', 'utf8')
		dec += decipher.final('utf8');
		return dec;
	}

	/*Prototypes*/
	function Server(data) {
		var self = this;

		//Accept everything now and trim what we don't need, manually. Any data left in is fine, any data left out could lead to a broken lib.
		for (var key in data) { this[key] = data[key]; }
		if (data.unavailable) return;

		//Objects so we can use direct property accessing without for loops
		this.channels = {};
		this.members = {};
		this.roles = {};

		//Copy the data into the objects using IDs as keys
		data.channels.forEach(function(channel) {
			channel.members = {};
			self.channels[channel.id] = channel;
		});
		data.members.forEach(function(member) {
			self.members[member.user.id] = new Member(member);
		});
		data.presences.forEach(function(presence) {
			for (var pkey in presence) {
				if (pkey !== 'user') {
					try { self.members[presence.user.id][pkey] = presence[pkey]; } catch(e) {}
				}
			}
		});
		data.roles.forEach(function(role) {
			self.roles[role.id] = new Role(role);
		});
		data.voice_states.forEach(function(vs) {
			var cID = vs.channel_id;
			var uID = vs.user_id;
			if (!self.channels[cID]) return;
			self.channels[cID].members[uID] = vs;
			self.members[uID].voice_channel_id = cID;
		});

		//Now we can get rid of any of the things we don't need anymore
		delete(this.voice_states);
		delete(this.presences);
	}
	function Member(data) {
		var self = this;
		for (var key in data) {
			self[key] = data[key];
			if ( ({}).toString.call(data[key]) === '[object Object]' ) {
				for (var uKey in data[key]) {
					self[uKey] = data[key][uKey];
				}
			}
		}
	}
	function Role(data) {
		var self = this;
		this.position = data.position;
		this.permissions = data.permissions;
		this.name = data.name;
		this.id = data.id;
		this.hoist = data.hoist;
		this.color = data.color;

		this.permission_values = {
			get GENERAL_CREATE_INSTANT_INVITE() { return getPerm(0); }, set GENERAL_CREATE_INSTANT_INVITE(v) { return setPerm(0, v); },
			get GENERAL_KICK_MEMBERS() { return getPerm(1); },set GENERAL_KICK_MEMBERS(v) { return setPerm(1, v); },
			get GENERAL_BAN_MEMBERS() { return getPerm(2); }, set GENERAL_BAN_MEMBERS(v) { return setPerm(2, v); },
			get GENERAL_MANAGE_ROLES() { return getPerm(3); }, set GENERAL_MANAGE_ROLES(v) { return setPerm(3, v); },
			get GENERAL_MANAGE_CHANNELS() { return getPerm(4); }, set GENERAL_MANAGE_CHANNELS(v) { return setPerm(4, v); },
			get GENERAL_MANAGE_GUILD() { return getPerm(5); }, set GENERAL_MANAGE_GUILD(v) { return setPerm(5, v); },

			get TEXT_READ_MESSAGES() { return getPerm(10); }, set TEXT_READ_MESSAGES(v) { return setPerm(10, v); },
			get TEXT_SEND_MESSAGES() { return getPerm(11); }, set TEXT_SEND_MESSAGES(v) { return setPerm(11, v); },
			get TEXT_SEND_TTS_MESSAGE() { return getPerm(12); }, set TEXT_SEND_TTS_MESSAGE(v) { return setPerm(12, v); },
			get TEXT_MANAGE_MESSAGES() { return getPerm(13); }, set TEXT_MANAGE_MESSAGES(v) { return setPerm(13, v); },
			get TEXT_EMBED_LINKS() { return getPerm(14); }, set TEXT_EMBED_LINKS(v) { return setPerm(14, v); },
			get TEXT_ATTACH_FILES() { return getPerm(15); }, set TEXT_ATTACH_FILES(v) { return setPerm(15, v); },
			get TEXT_READ_MESSAGE_HISTORY() { return getPerm(16); }, set TEXT_READ_MESSAGE_HISTORY(v) { return setPerm(16, v); },
			get TEXT_MENTION_EVERYONE() { return getPerm(17); }, set TEXT_MENTION_EVERYONE(v) { return setPerm(17, v); },

			get VOICE_CONNECT() { return getPerm(20); }, set VOICE_CONNECT(v) { return setPerm(20, v); },
			get VOICE_SPEAK() { return getPerm(21); }, set VOICE_SPEAK(v) { return setPerm(21, v); },
			get VOICE_MUTE_MEMBERS() { return getPerm(22); }, set VOICE_MUTE_MEMBERS(v) { return setPerm(22, v); },
			get VOICE_DEAFEN_MEMBERS() { return getPerm(23); }, set VOICE_DEAFEN_MEMBERS(v) { return setPerm(23, v); },
			get VOICE_MOVE_MEMBERS() { return getPerm(24); }, set VOICE_MOVE_MEMBERS(v) { return setPerm(24, v); },
			get VOICE_USE_VAD() { return getPerm(25); }, set VOICE_USE_VAD(v) { return setPerm(25, v); }
		};
		this.color_values = { //Might be temporary due to possible theme support in the future
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
		}
		function getPerm(bit) {
			return ((self.permissions >> bit) & 1) == 1;
		}
		function setPerm(bit, bl) {
			if (bl === true) return self.permissions |= (1 << (bit));
			return self.permissions &= ~(1 << bit);
		}
	}

	/*Methods*/
	/*Connection*/
	self.connect = function() {
		if (self.connected === false) return init();
	};
	self.disconnect = function() {
		ws.close();
	};

	/*Bot status*/
	self.editUserInfo = function(input, callback) {
		checkRS(function() {
			if (input.avatar) input.avatar = "data:image/jpg;base64," + input.avatar;

			var payload = {
				avatar: self.avatar,
				email: self.email,
				new_password: null,
				password: null,
				username: self.username
			};

			for (var key in input) {
				if (Object.keys(payload).indexOf(key) > -1) {
					payload[key] = input[key];
				} else {
					console.log(key + ' is not a valid key. Valid keys are: ');
					return console.log(plArr);
				}
			}
			req('patch', "https://discordapp.com/api/users/@me", payload, function(err, res) {
				handleResCB("Unable to edit user information", err, res, callback);
			});
		});
	};
	self.setPresence = function(input) {
		checkRS(function() {
			var payload = {
				op: 3,
				d: {
					idle_since: input.idle_since ? input.idle_since : null,
					game: {
						name: input.game ? String(input.game) : null
					}
				}
			}

			ws.send(JSON.stringify(payload));

			if (payload.d.idle_since === null) return self.presenceStatus = 'online';
			self.presenceStatus = 'idle'
		});
	};

	/*Bot content actions*/
	self.uploadFile = function(input, callback) {
		/* After like 15 minutes of fighting with Request, turns out Discord doesn't allow multiple files in one message...
		despite having an attachments array.*/
		checkRS(function() {
			var file, formData = {}, isBuffer = (input.file instanceof Buffer), isString = (typeof(input.file) === 'string')
			if (!isBuffer && !isString) return console.log("uploadFile requires a String or Buffer as the 'file' value");
			if (isBuffer) if (input.filename) file = input.file; else return console.log("uploadFile requires a 'filename' value to be set if using a Buffer");
			if (isString) try { file = fs.readFileSync(input.file); } catch(e) { return handleErrCB("File does not exist: " + input.file, callback); }
			if (input.message) formData.content = input.message;

			formData.file = {
				buffer: file,
				content_type: 'application/octet-stream',
				filename: input.filename || bn(input.file)
			}

			resolveID(input.to, function(channelID) {
				req('post', "https://discordapp.com/api/channels/" + channelID + "/messages", formData, function(err, res) {
					handleResCB("Unable to upload file", err, res, callback);
				});
			});
		});
	};
	self.sendMessage = function(input, callback) {
		checkRS(function() {
			var time, message = generateMessage(input.to, input.message);
			if (input.tts === true) message.tts = true;
			if (input.nonce) message.nonce = input.nonce;

			if (input.typing && input.typing === true) {
				time = (input.message.length * 0.12) * 1000;
				return emulateTyping(time);
			}

			_sendMessage(message, input.to);

			function emulateTyping(time) {
				if (time <= 0) return _sendMessage(message, input.to);
				if (time > 5000) time = time - 5000; else time = time - time;

				self.simulateTyping(input.to, function() {
					setTimeout(function() {
						emulateTyping(time);
					}, time);
				});
			}

			function _sendMessage(message, target) {
				resolveID(target, function(channelID) {
					req('post', "https://discordapp.com/api/channels/" + channelID + "/messages", message, function(err, res) {
						handleResCB("Unable to send messages", err, res, callback);
					});
				});
			}
		});
	};
	self.getMessages = function(input, callback) {
		checkRS(function() {
			var qs = {qs:true};
			typeof(input.limit) !== 'number' ? qs.limit = 50 : qs.limit = input.limit
			if (input.before) qs.before = input.before;
			if (input.after) qs.after = input.after;

			req('get', "https://discordapp.com/api/channels/" + input.channel + "/messages", qs, function(err, res) {
				handleResCB("Unable to get messages", err, res, callback);
			});
		});
	};
	self.editMessage = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/channels/" + input.channel + "/messages/" + input.messageID, generateMessage(input.channel, input.message), function(err, res) {
				handleResCB("Unable to edit message", err, res, callback);
			});
		});
	};
	self.simulateTyping = function(channelID, callback) {
		checkRS(function() {
			req('post', "https://discordapp.com/api/channels/" + channelID + "/typing", function(err, res) {
				handleResCB("Unable to simlate typing", err, res, callback);
			});
		});
	};
	self.deleteMessage = function(input, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/channels/" + input.channel + "/messages/" + input.messageID, function(err, res) {
				handleResCB("Unable to delete message", err, res, callback);
			});
		});
	};
	self.fixMessage = function(message) {
		return message.replace(/<@(\S*)>|<#(\S*)>/g, function(match, UID, CID) {
			if (UID) {
				for (var server in self.servers) {
					if (self.servers[server].members[UID]) {
						return "@" + self.servers[server].members[UID].user.username;
					}
				}
			}
			if (CID) {
				for (var server in self.servers) {
					if (self.servers[server].channels[CID]) {
						return "#" + self.servers[server].channels[CID].name
					}
				}
			}
		});
	};

	/*Bot management actions*/
	self.kick = function(input, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target, function(err, res) {
				handleResCB("Could not kick user", err, res, callback);
			});
		});
	};
	self.ban = function(input, callback) {
		checkRS(function() {
			if (input.lastDays) {
				input.lastDays = Number(input.lastDays);
				input.lastDays = Math.min(input.lastDays, 7)
				input.lastDays = Math.max(input.lastDays, 1);
			}

			req('put', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target + (input.lastDays ? "?delete-message-days=" + input.lastDays : ""), function(err, res) {
				handleResCB("Could not ban user", err, res, callback);
			});
		});
	};
	self.unban = function(input, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target, function(err, res) {
				handleResCB("Could not unban user", err, res, callback);
			});
		});
	};
	self.moveUserTo = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user, {channel_id: input.channel}, function(err, res) {
				handleResCB("Could not move the user", err, res, callback);
			});
		});
	}
	self.mute = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target, {mute: true}, function(err, res) {
				handleResCB("Could not mute user", err, res, callback);
			});
		});
	};
	self.unmute = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target, {mute: false}, function(err, res) {
				handleResCB("Could not unmute user", err, res, callback);
			});
		});
	};
	self.deafen = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target, {deaf: true}, function(err, res) {
				handleResCB("Could not deafen user", err, res, callback);
			});
		});
	};
	self.undeafen = function(input, callback) {
		checkRS(function() {
			req('patch', "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target, {deaf: false}, function(err, res) {
				handleResCB("Could not undeafen user", err, res, callback);
			});
		});
	};

	/*Bot server management actions*/
	self.createServer = function(input, callback) {
		checkRS(function() {
			var payload, regions;
			if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
			req('get', "https://discordapp.com/api/voice/regions", function(err, res) {
				if (err || !checkStatus(res)) console.log("Unable to get server regions list");
				try {
					regions = res.body.map(function(region) {return region.id});
				} catch(e) {}
				payload = {icon: null, name: null, region: null};
				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					if (regions && regions.indexOf(input.region) === -1) return handleErrCB(("You need to use one of these for regions:" + regions.map(function(rname) { return  " " + rname})), callback);
					payload[key] = input[key];
				}
				req('post', "https://discordapp.com/api/guilds", payload, function(err, res) {
					try {
						self.servers[res.body.id] = {};
						for (var skey in res.body) self.servers[res.body.id][skey] = res.body[skey];
					} catch(e) {};
					handleResCB("Could not create server", err, res, callback);
				});
			});
		});
	};
	self.editServer = function(input, callback) {
		checkRS(function() {
			var payload, regions, server;
			if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
			if (!self.servers[input.server]) return handleErrCB(("Server " + input.server + " not found."), callback);
			req('get', "https://discordapp.com/api/voice/regions", function(err, res) {
				if (err || !checkStatus(res)) console.log("Unable to get server regions list");
				try {
					regions = res.body.map(function(region) {return region.id});
				} catch(e) {}

				server = self.servers[input.server];
				payload = {
					name: server.name,
					icon: server.icon,
					region: server.region,
					afk_channel_id: server.afk_channel_id,
					afk_timeout: server.afk_timeout
				}

				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					if (key === 'region') {
						if (regions && regions.indexOf(input[key]) > -1) payload[key] = input[key];
						continue;
					}
					if (key === 'afk_channel_id') {
						if (server.channels[input[key]] && server.channels[input[key]].type === 'voice') payload[key] = input[key];
						continue;
					}
					if (key === 'afk_timeout') {
						if ([60, 300, 900, 1800, 3600].indexOf(Number(input[key])) > -1) payload[key] = input[key];
						continue;
					}
					payload[key] = input[key];
				}

				req('patch', "https://discordapp.com/api/guilds/" + server, payload, function(err, res) {
					handleResCB("Unable to edit server", err, res, callback);
				});
			});
		});
	}
	self.leaveServer = function(serverID, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/users/@me/guilds/" + serverID, function(err, res) {
				handleResCB("Could not leave server", err, res, callback);
			});
		});
	}
	self.deleteServer = function(serverID, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/guilds/" + serverID, function(err, res) {
				handleResCB("Could not delete server", err, res, callback);
			});
		});
	};

	self.acceptInvite = function(inviteCode, callback) {
		checkRS(function() {
			var joinedServers = Object.keys(self.servers);
			req('post', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
				try {
					//Try to create the server with the small amount of data
					//that Discord provides directly from the HTTP response
					//since the websocket event may take a second to show.
					if (!self.servers[res.body.guild.id]) {
						self.servers[res.body.guild.id] = res.body.guild;
						self.servers[res.body.guild.id].channels = {};
						self.servers[res.body.guild.id].channels[res.body.channel.id] = res.body.channel;
					} else {
						if (joinedServers.indexOf(res.body.guild.id) > -1) {
							return handleErrCB("Already joined server: " + res.body.guild.id, callback);
						}
					}
				} catch(e) {};
				handleResCB(("The invite code provided " + inviteCode + " is incorrect."), err, res, callback);
			});
		});
	};
	self.createInvite = function(input, callback) {
		checkRS(function() {
			var payload;
			if (Object.keys(input).length === 1 && 'channel' in input) {
				payload = {
					validate: self.internals.lastInviteCode || null
				}
			} else {
				payload = {
					max_age: 0,
					max_users: 0,
					temporary: false,
					xkcdpass: false
				}
			}

			for (var key in input) {
				if (Object.keys(payload).indexOf(key) === -1) continue;
				payload[key] = input[key];
			}

			req('post', "https://discordapp.com/api/channels/"+ input.channel + "/invites", payload, function(err, res) {
				try {self.internals.lastInviteCode = res.body.code;} catch(e) {}
				handleResCB('Unable to create invite', err, res, callback);
			});
		});
	};
	self.deleteInvite = function(inviteCode, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
				handleResCB('Unable to delete invite', err, res, callback);
			});
		});
	}
	self.queryInvite = function(inviteCode, callback) {
		checkRS(function() {
			req('get', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
				handleResCB('Unable to get information about invite', err, res, callback);
			});
		});
	}
	self.listServerInvites = function(serverID, callback) {
		checkRS(function() {
			req('get', "https://discordapp.com/api/guilds/" + serverID + "/invites", function(err, res) {
				handleResCB('Unable to get invite list for server' + serverID, err, res, callback);
			});
		});
	}
	self.listChannelInvites = function(channelID, callback) {
		checkRS(function() {
			req('get', "https://discordapp.com/api/channels/" + channelID + "/invites", function(err, res) {
				handleResCB('Unable to get invite list for channel' + channelID, err, res, callback);
			});
		});
	}

	self.createChannel = function(input, callback) {
		checkRS(function() {
			var payload = {
				name: input.name,
				type: (['text', 'voice'].indexOf(input.type) === -1) ? 'text' : input.type
			}

			req('post', "https://discordapp.com/api/guilds/" + input.server + "/channels", payload, function(err, res) {
				try {
					self.servers[res.body.guild_id].channels[res.body.id] = {};
					for (var ckey in res.body) self.servers[res.body.guild_id].channels[res.body.id][ckey] = res.body[ckey];
				} catch(e) {}
				handleResCB('Unable to create channel', err, res, callback);
			});
		});
	};
	self.createDMChannel = function(userID, callback) {
		req('post', "https://discordapp.com/api/users/" + self.id + "/channels", {recipient_id: userID}, function(err, res) {
			if (err || !checkStatus(res)) return console.log("Unable to post recipient request information: " + checkError(res));
			uIDToDM[res.body.recipient.id] = res.body.id;
			return callback(res.body.id);
		});
	}
	self.deleteChannel = function(channelID, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/channels/" + channelID, function(err, res) {
				handleResCB("Unable to delete channel", err, res, callback);
			});
		});
	};
	self.editChannelInfo = function(input, callback) {
		checkRS(function() {
			var channel, payload

			try {
				channel = self.servers[self.serverFromChannel(input.channel)].channels[input.channel];
				payload = {
					name: channel.name,
					position: channel.position,
					topic: channel.topic,
					bitrate: channel.bitrate
				};

				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					if (key === 'bitrate') {
						input.bitrate = Number(input.bitrate);
						input.bitrate = Math.max(input.bitrate, 8000);
						input.bitrate = Math.min(input.bitrate, 96000);
					}
					payload[key] = input[key];
				}

				req('patch', "https://discordapp.com/api/channels/" + input.channel, payload, function(err, res) {
					handleResCB("Unable to edit channel", err, res, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};

	self.createRole = function(serverID, callback) {
		checkRS(function() {
			req('post', "https://discordapp.com/api/guilds/" + serverID + "/roles", function(err, res) {
				try {
					self.servers[serverID].roles[res.body.id] = new Role(res.body);
				} catch(e) {}
				handleResCB("Unable to create role", err, res, callback);
			});
		});
	};
	self.editRole = function(input, callback) {
		checkRS(function() {
			var role, payload;
			try {
				role = new Role(self.servers[input.server].roles[input.role]);
				payload = {
					name: role.name,
					permissions: role.permissions,
					color: role.color,
					hoist: role.hoist
				};

				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					if (key === 'permissions') {
						for (var perm in input[key]) (role.permission_values[perm] = input[key][perm]), (payload.permissions = role.permissions);
						continue;
					}
					if (key === 'color') {
						if (String(input[key])[0] === '#') payload.color = parseInt(String(input[key]).replace('#', '0x'), 16);
						if (role.color_values[input[key]]) payload.color = role.color_values[input[key]];
						continue;
					}
					payload[key] = input[key];
				}
				req('patch', "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role, payload, function(err, res) {
					handleResCB("Unable to edit role", err, res, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};
	self.deleteRole = function(input, callback) {
		checkRS(function() {
			req('delete', "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role, function(err, res) {
				handleResCB("Could not remove role", err, res, callback);
			});
		});
	};

	self.addToRole = function(input, callback) {
		checkRS(function() {
			var roles;
			try {
				roles = JSON.parse(JSON.stringify(self.servers[input.server].members[input.user].roles));
				if (roles.indexOf(input.role) > -1) return handleErrCB((input.user + " already has the role " + input.role), callback);
				roles.push(input.role);
				req('patch', "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user, {roles: roles}, function(err, res) {
					handleResCB("Could not add role", err, res, callback);
				});
			} catch(e) {return handleErrCB(e, callback)}
		});
	};
	self.removeFromRole = function(input, callback) {
		checkRS(function() {
			var roles;
			try {
				roles = JSON.parse(JSON.stringify(self.servers[input.server].members[input.user].roles));
				if (roles.indexOf(input.role) === -1) return handleErrCB(("Role " + input.role + " not found for user " + input.user), callback)
				roles.splice(roles.indexOf(input.role), 1);
				req('patch', "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user, {roles: roles}, function(err, res) {
					handleResCB("Could not remove role", err, res, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};

	self.listBans = function(serverID, callback) {
		req('get', 'https://discordapp.com/api/guilds/' + serverID + '/bans', function(err, res) {
			handleResCB("Could not get ban list", err, res, callback);
		});
	};

	/*Misc*/
	self.serverFromChannel = function(channel) {
		return serverFromChannel(channel);
	};
	self.getOfflineUsers = function(callback) {
		var servers = Object.keys(self.servers).filter(function(s) {
			s = self.servers[s];
			return s.large && s.member_count !== Object.keys(s.members).length;
		});

		if (!servers[0]) return handleErrCB("All users collected in all servers", callback);
		return getOfflineUsers(servers);
	}
	/*function td(ID) {
    	return (ID / 4194304) + 1420070400000;
	}*/

	/*Voice*/
	self.joinVoiceChannel = function(channel, callback) {
		checkRS(function() {
			var server = serverFromChannel(channel), token, session, endpoint, init;
			if (!server) return handleErrCB(("Cannot find the server related to the channel provided: " + channel), callback);
			if (self.servers[server].channels[channel].type !== 'voice') return handleErrCB(("Selected channel is not a voice channel: " + channel), callback);
			if (vChannels[channel]) return handleErrCB("Voice channel already active: " + channel);

			vChannels[channel] = {};
			init = {
				"op": 4,
				"d": {
					"guild_id": server,
					"channel_id": channel,
					"self_mute": false,
					"self_deaf": false
				}
			}

			ws.on('message', handleVoice);
			ws.send(JSON.stringify(init));
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
			var audioChannels = channelObj.stereo && channelObj.stereo === true ? 2 : 1;
			var client = vChannels[channel];
			var Opus, opusEncoder, speakingStart;

			if (!client) return console.log("You have not joined the voice channel: " + channel);
			if (client.ready !== true) return console.log("The connection to the voice channel " + channel + " has not been initialized yet.");
			try { Opus = require('node-opus'); } catch(e) { console.log("Error requiring module: 'node-opus'"); console.log(e); return false; }

			opusEncoder = new Opus.OpusEncoder( 48000, 1 * audioChannels );
			speakingStart = { "op": 5, "d": { "speaking": true, "delay": 0 } };

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
							)

							header.copy(output);
							encrypted.copy(output, 12);

							return output.slice(0, header.length + encrypted.length);
						}
					})();

				try {
					port = client.ws.port;
					address = client.address;
					secretKey = client.secretKey;
				} catch(e) {return};

				function sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt) {
					var buff, encoded, audioPacket, nextTime;

					buff = streamOutput.read( 1920 * audioChannels );
					if (streamOutput.destroyed) return;

					sequence + 1 < 65535 ? sequence += 1 : sequence = 0;
					timestamp + 960 < 4294967295 ? timestamp += 960 : timestamp = 0;

					encoded = [0xF8, 0xFF, 0xFE];
					if (buff && buff.length === 1920 * audioChannels) encoded = opusEncoder.encode(buff);

					audioPacket = VoicePacket(encoded, sequence, timestamp, secretKey);
					nextTime = startTime + cnt * 20;

					try {
						//It throws a synchronous error if it fails (someone leaves the audio channel while playing audio)
						udpClient.send(audioPacket, 0, audioPacket.length, port, address, function(err) {
							if (err) { console.log(err); }
						});
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
						var speakingEnd = {
							"op":5,
							"d":{
								"speaking":false,
								"delay":0
							}
						}
						vWS.send(JSON.stringify(speakingEnd));
						playingAF = false;
						self.emit('fileEnd');
					});
					enc.stdout.once('error', function(e) {
						console.log(e);
						enc.stdout.emit('end');
					});
					enc.stdout.once('readable', function() {
						vWS.send(JSON.stringify(speakingStart));
						startTime = new Date().getTime();
						sendAudio(audioChannels, opusEncoder, enc.stdout, udpClient, vWS, 1);
					});
					streamRef = enc;
				}
				this.stopAudioFile = function(callback) {
					if (playingAF) {
						streamRef.stdout.end();
						streamRef.kill();
						playingAF = false;
					} else {
						console.log("Not playing anything.");
					}
					if (typeof(callback) === 'function') callback();
				}
				this.send = function(stream) { //If you're piping a stream, you can handle everything else.
					vWS.send(JSON.stringify(speakingStart));
					startTime = new Date().getTime();
					sendAudio(audioChannels, opusEncoder, stream, udpClient, vWS, 1);
				}

				udpClient.on('message', function(msg) {
					var header = msg.slice(0, 12),
						nonce = new Buffer(24).fill(0),
						audio = msg.slice(12),
						ssrc = header.readUIntBE(8, 4),
						enc;

					header.copy(nonce);

					var decrypted = new Buffer(
						nacl.secretbox.open(
							new Uint8Array(audio),
							new Uint8Array(nonce),
							new Uint8Array(secretKey)
						)
					);

					enc = speakers[ssrc] || new Opus.OpusEncoder( 48000, 1 * audioChannels );
					speakers[ssrc] = enc;

					try {
						self.emit('incoming', ssrc, enc.decode(decrypted));
					} catch (e) {}
				});
			}
		});
	};

	if (options.autorun && options.autorun === true) {
		self.connect();
	}
}

util.inherits(DiscordClient, EE);
module.exports = DiscordClient;
