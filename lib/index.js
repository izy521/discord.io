/*jslint node: true */
"use strict";

var util = require("util");
var EE = require("events").EventEmitter;

function DiscordClient(options) {
	var self = this;
	EE.call(self);
	self.connected = false;
	if (typeof (options) !== "object") return console.log("The options should be an object");

	/*Variables*/
	var websocket = require('ws'),
		request = require('request').defaults({'headers': messageHeaders(), 'gzip': true}),
		udp = require('dgram'),
		fs = require('fs'),
		zlib = require('zlib'),
		dns = require('dns'),
		crypto = require('crypto'),
		ws, KAi, cv, uv, vChannels = {}, uIDToDM = {};
	/*Version check*/
	try {
		cv = require('../package.json').version;
		request("https://registry.npmjs.org/discord.io", function(err, res, body) {
			if (!err) {
				try {
					uv = JSON.parse(body)['dist-tags'].latest;
				} catch(e) {return;}
				if (cv !== uv) {
					console.log("[WARNING]: Your library (" + cv + ") is out of date. Please update discord.io to " + uv + ".")
				}
			}
		});
	} catch(e) {}

	/*Internal Functions*/
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
		request.post({
			url: "https://discordapp.com/api/auth/login",
			body: JSON.stringify({email: options.email, password: options.password})
		}, function (err, res, body) {
			if (err || !checkStatus(res)) {
				console.log("Error POSTing login information: \n" + checkError(res, body));
				return self.emit("disconnected");
			}
			getGateway(JSON.parse(body).token);
		});
	}
	function getGateway(token, explicit) {
		self.internals.token = token;
		request = request.defaults({'headers': messageHeaders(), 'gzip': true});

		request.get("https://discordapp.com/api/gateway", function (err, res, gatewayBody) {
			if (err || !checkStatus(res)) {
				console.log("Error GETing gateway list: " + checkError(res, gatewayBody));
				if (explicit) console.log("Incorrect login token provided.");
				return self.emit("disconnected");
			}
			startConnection(JSON.parse(gatewayBody).url);
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
		request.get({
			url: "https://discordapp.com/api/users/@me/settings",
		}, function(err, res, body) {
			if (err || !checkStatus(res)) return console.log("Error GETing client settings: " + checkError(res, body));

			body = JSON.parse(body);
			for (var sItem in body) {
				self.internals.settings[sItem] = body[sItem];
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

	function messageHeaders() {
		return {
			"accept": "*/*",
			"accept-encoding": "gzip, deflate",
			"accept-language": "en-US;q=0.8",
			"authorization": self.internals ? self.internals.token : undefined,
			"content-type": "application/json",
			"dnt": "1",
			"origin": "https://discordapp.com",
			"user-agent": "DiscordBot (https://github.com/izy521/discord.io, " + cv + ")"
		};
	}
	function resolveID(ID, callback) {
		/*Get channel from ServerID, ChannelID or UserID.
		Only really used for sendMessage and uploadFile.*/
		//Callback used instead of return because requesting seems necessary.

		if (ID in uIDToDM) return callback(uIDToDM[ID]);
		//If it's a UserID, and it's in the UserID : ChannelID cache, use the found ChannelID

		for (var server in self.servers) { //If the ID isn't in the UserID : ChannelID cache, let's try seeing if it belongs to a user.
			if (ID in self.servers[server].members) return request.post({
				url: "https://discordapp.com/api/users/" + self.id + "/channels",
				body: JSON.stringify({recipient_id: ID})
			}, function(err, res, body) {
				if (err || !checkStatus(res)) return console.log("Unable to post recipient request information: " + checkError(res, body));
				body = JSON.parse(body);
				uIDToDM[body.recipient.id] = body.id;
				return callback(body.id);
			});
		}

		return callback(ID); //Finally, the ID must not belong to a User, so send the message directly to it, as it must be a Channel's.
	}

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
			"v": 3,
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

				getServerInfo(message.d.guilds);
				try {
					if (!options.token) fs.writeFileSync('./tenc', encryptToken(self.internals.token, String(options.email + options.password)));
				} catch(e) {}
				getDirectMessages(message.d.private_channels);
				self.emit('ready', message);

				KAi = setInterval(function() {
					var keepAlive = { //Send KA data
						op: 1,
						d: Date.now()
					};
					if (ws.readyState == 1) {
						ws.send(JSON.stringify(keepAlive));
					}
				}, message.d.heartbeat_interval);
				break;
			case "MESSAGE_CREATE":
				self.emit('message', message.d.author.username, message.d.author.id, message.d.channel_id, message.d.content, message);
				break;
			case "PRESENCE_UPDATE":
				var server;
				if (message.d) {
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
				}
				self.emit('presence', self.servers[server].members[message.d.user.id].user.username, message.d.user.id, message.d.status, message.d.game ? message.d.game.name : null , message);
				break;
			case "USER_UPDATE":
				if (message.d) {
					for (var userItem in message.d) {
						self[userItem] = message.d[userItem];
					}
				}
				break;
			case "USER_SETTINGS_UPDATE":
				if (message.d) {
					for (var userItem in message.d) {
						self.internals[userItem] = message.d[userItem];
					}
				}
				break;
			case "GUILD_CREATE":
				if (message.d) {
					//The lib will attempt to create the server using the response from the
					//RESTFUL API, if the user using the lib creates the server. There are missing keys, however.
					//So we still need this GUILD_CREATE event to fill in the blanks.
					//If It's not our created server, then there will be no server with that ID in the cache,
					//So go ahead and create one.
					self.servers[message.d.id] = new Server(message.d);
				}
				break;
			case "GUILD_UPDATE":
				if (message.d) {
					if (!self.servers[message.d.id]) self.servers[message.d.id] = {};
					for (var key in message.d) {
						if (message.d[key] instanceof Array) {
							message.d[key].forEach(function(item) {
								self.servers[message.d.id][key][item.id] = item;
							});
							continue;
						}
					}
				}
				break;
			case "GUILD_DELETE":
				if (message.d) {
					delete self.servers[message.d.id];
				}
				break;
			case "GUILD_MEMBER_ADD":
				if (message.d) {
					self.servers[message.d.guild_id].members[message.d.user.id] = {};
					for (var userItem in message.d) {
						self.servers[message.d.guild_id].members[message.d.user.id][userItem] = message.d[userItem];
					}
				}
				break;
			case "GUILD_MEMBER_UPDATE":
				if (message.d) {
					if (!self.servers[message.d.guild_id].members[message.d.user.id]) {
						self.servers[message.d.guild_id].members[message.d.user.id] = {};
					}
					self.servers[message.d.guild_id].members[message.d.user.id].user = message.d.user;
					self.servers[message.d.guild_id].members[message.d.user.id].roles = message.d.roles;
				}
				break;
			case "GUILD_MEMBER_REMOVE":
				if (message.d && self.servers[message.d.guild_id]) {
					delete self.servers[message.d.guild_id].members[message.d.user.id];
				}
				break;
			case "GUILD_ROLE_CREATE":
				if (message.d) {
					if (self.servers[message.d.guild_id].roles[message.d.role.id]) return;
					self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.role);
				}
				break;
			case "GUILD_ROLE_UPDATE":
				if (message.d) {
					self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.role);
				}
				break;
			case "GUILD_ROLE_DELETE":
				if (message.d) {
					delete self.servers[message.d.guild_id].roles[message.d.role_id];
				}
				break;
			case "CHANNEL_CREATE":
				if (message.d) {
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
				}
				break;
			case "CHANNEL_UPDATE":
				if (message.d) {
					if (!self.servers[message.d.guild_id].channels[message.d.id]) {
						self.servers[message.d.guild_id].channels[message.d.id] = {};
					}
					for (var ChItem in message.d) {
						if (['guild_id', 'is_private'].indexOf(ChItem) === -1) {
							self.servers[message.d.guild_id].channels[message.d.id][ChItem] = message.d[ChItem];
						}
					}
				}
				break;
			case "CHANNEL_DELETE":
				if (message.d) {
					if (message.d.is_private === true) {
						delete self.directMessages[message.d.id];
						return delete uIDToDM[message.d.recipient.id];
					}
					delete self.servers[message.d.guild_id].channels[message.d.id];
				}
				break;
			case "VOICE_STATE_UPDATE":
				if (message.d) {
					try {
						var vcid = self.servers[message.d.guild_id].members[message.d.user_id].voice_channel_id;
						if (vcid)
							delete self.servers[message.d.guild_id].channels[vcid].members[message.d.user_id];
						if (message.d.channel_id)
							self.servers[message.d.guild_id].channels[message.d.channel_id].members[message.d.user_id] = message.d;
							self.servers[message.d.guild_id].members[message.d.user_id].voice_channel_id = message.d.channel_id;
					} catch(e) {}
				}
				break;
			}
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
		return callback(err);
	}
	function handleResCB(errMessage, err, res, body, callback) {
		var e = {
			message: errMessage,
			statusCode: res.statusCode,
			statusMessage: res.statusMessage,
			response: body
		}
		if (typeof(callback) !== 'function') return;
		if (err || !checkStatus(res)) return callback(e);
		try { body = JSON.parse(body) } catch() {}
		return callback(undefined, body);
	}

	function checkRS(callback) {
		if (ws) {
			if (ws.readyState && ws.readyState == 1) return callback();
			return console.log("The bot is not connected yet");
		}
	}
	function checkStatus(response) {
		return (response.statusCode / 100 | 0) === 2
	}
	function checkError(response, body) {
		if (!response) return null;
		return response.statusCode + " " + response.statusMessage + "\n" + body;
	}

	function generateMessage(channelID, message) {
		return {
			content: String(message),
			nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
		}
	}
	function VoicePacket(packet, sequence, timestamp, ssrc) {
		var retBuff = new Buffer(packet.length + 12);
		retBuff.fill(0);
		retBuff[0] = 0x80;
		retBuff[1] = 0x78;
		retBuff.writeUIntBE(sequence, 2, 2);
		retBuff.writeUIntBE(timestamp, 4, 4);
		retBuff.writeUIntBE(ssrc, 8, 4);

		for (var i=0; i<packet.length; i++) {
			retBuff[i + 12] = packet[i];
		}

		return retBuff;
	}

	function _joinVoiceChannel(server, channel, token, session, endpoint, callback) {
		self.internals.voice_endpoint = endpoint;
		endpoint = endpoint.split(":")[0];
		dns.lookup(endpoint, function(err, address, family) {
			self.internals.voice_address = address;
			vChannels[channel].address = address;
			vChannels[channel].ws = {};
			vChannels[channel].udp = {};
			vChannels[channel].ready = false;
			var vWS = vChannels[channel].ws.connection = new websocket("wss://" + endpoint);
			var udpClient = vChannels[channel].udp.connection = udp.createSocket("udp4");
			var vKAPayload = {
				"op": 3,
				"d": null
			}
			var vKAI;
			var vDiscIP = "";
			var vDiscPort;

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
							"mode":vChannels[channel].ws.modes[0] //Plain
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
			vWS.on('message', function(vMessage) {
				var vData = JSON.parse(vMessage);
				switch (vData.op) {
					case 2:
						for (var vKey in vData.d) {
							vChannels[channel].ws[vKey] = vData.d[vKey];
						}

						vKAI = setInterval(function() {
							vWS.send(JSON.stringify(vKAPayload));
						}, vData.d.heartbeat_interval);

						var udpDiscPacket = new Buffer(70);
						udpDiscPacket.writeUIntBE(vData.d.ssrc, 0, 4);
						udpClient.send(udpDiscPacket, 0, udpDiscPacket.length, vData.d.port, address, function(err) { if (err) console.log(err); });
						break;
					case 4:
						vChannels[channel].selectedMode = vData.d.mode;
						vChannels[channel].ready = true;
						if (callback && typeof(callback) === 'function') {
							callback(undefined);
						}
						break;
				}
			});
			vWS.once('close', function() {
				clearInterval(vKAI);
			});
		});
	}

	function serverFromChannel(channel) {
		for (var server in self.servers) {
			if (self.servers[server].channels[channel]) {
				return server;
			}
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
			self.members[member.user.id] = member;
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

			request.patch({
				url: "https://discordapp.com/api/users/@me",
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				handleResCB("Unable to edit user information", err, res, body, callback);
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
	self.uploadFile = function(input, callback) { /* After like 15 minutes of fighting with Request, turns out Discord doesn't allow multiple files in one message... despite having an attachments array.*/
		checkRS(function() {
			var formData = {
				file: input.file
			};

			resolveID(input.to, function(channelID) {
				request.post({
					url: "https://discordapp.com/api/channels/" + channelID + "/messages",
					formData: formData
				}, function(err, res, body) {
					handleResCB("Unable to upload file", err, res, body, callback);
				});
			});
		});
	};
	self.sendMessage = function(input, callback) {
		checkRS(function() {
			var time, message = generateMessage(input.to, input.message);
			if (input.tts === true) message.tts = true;
			if (input.nonce) message.nonce = input.nonce;
			var messageJSON = JSON.stringify(message);

			if (input.typing && input.typing === true) {
				time = (input.message.length * 0.12) * 1000;
				return emulateTyping(time);
			}

			_sendMessage(messageJSON, input.to);

			function emulateTyping(time) {
				if (time <= 0) return _sendMessage(messageJSON, input.to);
				if (time > 5000) time = time - 5000; else time = time - time;

				self.simulateTyping(input.to, function() {
					setTimeout(function() {
						emulateTyping(time);
					}, time);
				});
			}

			function _sendMessage(messageJSON, target) {
				resolveID(target, function(channelID) {
					request.post({ //Finally, the ID must not belong to a User, so send the message directly to it, as it must be a channel.
						url: "https://discordapp.com/api/channels/" + channelID + "/messages",
						body: messageJSON
					}, function(err, res, body) {
						handleResCB("Unable to send messages", err, res, body, callback);
					});
				});
			}
		});
	};
	self.getMessages = function(input, callback) {
		checkRS(function() {
			var qs = {};
			typeof(input.limit) !== 'number' ? qs.limit = 50 : qs.limit = input.limit
			if (input.before) qs.before = input.before;
			if (input.after) qs.after = input.after;

			request.get({
				url: "https://discordapp.com/api/channels/" + input.channel + "/messages",
				qs: qs
			}, function(err, res, body) {
				handleResCB("Unable to get messages", err, res, body, callback);
			});
		});
	};
	self.editMessage = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/channels/" + input.channel + "/messages/" + input.messageID,
				body: JSON.stringify(generateMessage(input.channel, input.message))
			}, function(err, res, body) {
				handleResCB("Unable to edit message", err, res, body, callback);
			});
		});
	};
	self.simulateTyping = function(channelID, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/channels/" + channelID + "/typing",
			}, function(err, res, body) {
				handleResCB("Unable to simlate typing", err, res, body, callback);
			});
		});
	};
	self.deleteMessage = function(input, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/channels/" + input.channel + "/messages/" + input.messageID
			}, function(err, res, body) {
				handleResCB("Unable to delete message", err, res, body, callback);
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
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
			}, function(err, res, body) {
				handleResCB("Could not kick user", err, res, body, callback);
			});
		});
	};
	self.ban = function(input, callback) {
		checkRS(function() {
			if (input.lastDays) {
				try {
					input.lastDays = Number(input.lastDays);
					input.lastDays = Math.min(input.lastDays, 7)
					input.lastDays = Math.max(input.lastDays, 1);
				} catch(e) {}
			}

			request.put({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target + (input.lastDays ? "?delete-message-days=" + input.lastDays : ""),
			}, function(err, res, body) {
				handleResCB("Could not ban user", err, res, body, callback);
			});
		});
	};
	self.unban = function(input, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target,
			}, function(err, res, body) {
				handleResCB("Could not unban user", err, res, body, callback);
			});
		});
	};
	self.moveUserTo = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user,
				body: JSON.stringify({channel_id: input.channel})
			}, function(err, res, body) {
				handleResCB("Could not move the user", err, res, body, callback);
			});
		});
	}
	self.mute = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: JSON.stringify({mute: true})
			}, function(err, res, body) {
				handleResCB("Could not mute user", err, res, body, callback);
			});
		});
	};
	self.unmute = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: JSON.stringify({mute: false})
			}, function(err, res, body) {
				handleResCB("Could not unmute user", err, res, body, callback);
			});
		});
	};
	self.deafen = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: JSON.stringify({deaf: true})
			}, function(err, res, body) {
				handleResCB("Could not deafen user", err, res, body, callback);
			});
		});
	};
	self.undeafen = function(input, callback) {
		checkRS(function() {
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: JSON.stringify({deaf: false})
			}, function(err, res, body) {
				handleResCB("Could not undeafen user", err, res, body, callback);
			});
		});
	};

	/*Bot server management actions*/
	self.createServer = function(input, callback) {
		checkRS(function() {
			var payload, regions;
			if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
			request.get({
				url: "https://discordapp.com/api/voice/regions",
			}, function(err, res, body) {
				if (err || !checkStatus(res)) console.log("Unable to get server regions list");
				try {
					body = JSON.parse(body);
					regions = body.map(function(region) {return region.id});
				} catch(e) {}
				payload = {icon: null, name: null, region: null};
				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					if (regions && regions.indexOf(input.region) === -1) return handleErrCB(("You need to use one of these for regions:" + regions.map(function(rname) { return  " " + rname})), callback);
					payload[key] = input[key];
				}
				request.post({
					url: "https://discordapp.com/api/guilds",
					body: JSON.stringify(payload)
				}, function(err, res, body) {
					try {
						body = JSON.parse(body);
						self.servers[body.id] = {};
						for (var skey in body) self.servers[body.id][skey] = body[skey];
					} catch(e) {};
					handleResCB("Could not create server", err, res, body, callback);
				});
			});
		});
	};
	self.editServer = function(input, callback) {
		checkRS(function() {
			var payload, regions, server;
			if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
			if (!self.servers[input.server]) return handleErrCB(("Server " + input.server + " not found."), callback);
			request.get({
				url: "https://discordapp.com/api/voice/regions",
			}, function(err, res, body) {
				if (err || !checkStatus(res)) console.log("Unable to get server regions list");
				try {
					body = JSON.parse(body);
					regions = body.map(function(region) {return region.id});
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

				request.patch({
					url: "https://discordapp.com/api/guilds/" + server,
					body: JSON.stringify(payload)
				}, function(err, res, body) {
					handleResCB("Unable to edit server", err, res, body, callback);
				});
			});
		});
	}
	self.deleteServer = function(serverID, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverID
			}, function(err, res, body) {
				handleResCB("Could not delete server", err, res, body, callback);
			});
		});
	};

	self.acceptInvite = function(inviteCode, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/invite/" + inviteCode,
			}, function(err, res, body) {
				try {
					//Try to create the server with the small amount of data
					//that Discord provides directly from the HTTP response
					//since the websocket event may take a second to show.
					body = JSON.parse(body);
					if (!self.servers[body.guild.id]) {
						self.servers[body.guild.id] = body.guild;
						self.servers[body.guild.id].channels = {};
						self.servers[body.guild.id].channels[body.channel.id] = body.channel;
					} else {
						throw ("Already joined server: " + body.guild.id);
					}
				} catch(e) {return handleErrCB(e, callback);};
				handleResCB(("The invite code provided " + inviteCode + " is incorrect."), err, res, body, callback);
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

			request.post({
				url: "https://discordapp.com/api/channels/"+ input.channel + "/invites",
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				try {self.internals.lastInviteCode = body.code;} catch(e) {}
				handleResCB('Unable to create invite', err, res, body, callback);
			});
		});
	};
	self.deleteInvite = function(inviteCode, callback) {
		checkRS(function() {
			reqest.del({
				url: "https://discordapp.com/api/invite/" + inviteCode
			}, function(err, res, body) {
				handleResCB('Unable to delete invite', err, res, body, callback);
			});
		});
	}
	self.queryInvite = function(inviteCode, callback) {
		checkRS(function() {
			request.get({
				url: "https://discordapp.com/api/invite/" + inviteCode
			}, function(err, res, body) {
				handleResCB('Unable to get information about invite', err, res, body, callback);
			});
		});
	}
	self.listServerInvites = function(serverID, callback) {
		checkRS(function() {
			request.get({
				url: "https://discordapp.com/api/guilds/" + serverID + "/invites",
			}, function(err, res, body) {
				handleResCB('Unable to get invite list for server' + serverID, err, res, body, callback);
			});
		});
	}
	self.listChannelInvites = function(channelID, callback) {
		checkRS(function() {
			request.get({
				url: "https://discordapp.com/api/channels/" + channelID + "/invites",
			}, function(err, res, body) {
				handleResCB('Unable to get invite list for channel' + channelID, err, res, body, callback);
			});
		});
	}

	self.createChannel = function(input, callback) {
		checkRS(function() {
			var payload = {
				name: input.name,
				type: (['text', 'voice'].indexOf(input.type) === -1) ? 'text' : input.type
			}

			request.post({
				url: "https://discordapp.com/api/guilds/" + serverID + "/channels",
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				try {
					body = JSON.parse(body);
					self.servers[body.guild_id].channels[body.id] = {};
					for (var ckey in body) self.servers[body.guild_id].channels[body.id][ckey] = body[ckey];
				} catch(e) {}
				handleResCB('Unable to create channel', err, res, body, callback);
			});
		});
	};
	self.deleteChannel = function(input, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/channels/" + input.channel,
			}, function(err, res, body) {
				handleResCB("Unable to delete channel", err, res, body, callback);
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
					topic: channel.topic
				}

				for (var key in input) {
					if (Object.keys(payload).indexOf(key) === -1) continue;
					payload[key] = input[key];
				}

				request.patch({
					url: "https://discordapp.com/api/channels/" + input.channel,
					body: JSON.stringify(payload)
				}, function(err, res, body) {
					handleResCB("Unable to edit channel", err, res, body, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};

	self.createRole = function(serverID, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/guilds/" + serverID + "/roles"
			}, function(err, res, body) {
				try {
					body = JSON.parse(body);
					self.servers[serverID].roles[body.id] = new Role(body);
				} catch(e) {}
				handleResCB("Unable to create role", err, res, body, callback);
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
				request.patch({
					url: "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role,
					body: JSON.stringify(payload)
				}, function(err, res, body) {
					handleResCB("Unable to edit role", err, res, body, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};
	self.deleteRole = function(input, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role
			}, function(err, res, body) {
				handleResCB("Could not remove role", err, res, body, callback);
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
				request.patch({
					url: "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user,
					body: JSON.stringify({roles: roles})
				}, function(err, res, body) {
					handleResCB("Could not add role", err, res, body, callback);
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
				request.patch({
					url: "https://discordapp.com/api/guilds/" + input.server + "/members/" + input.user,
					body: JSON.stringify({roles: roles})
				}, function(err, res, body) {
					handleResCB("Could not remove role", err, res, body, callback);
				});
			} catch(e) {return handleErrCB(e, callback);}
		});
	};

	/*Misc*/
	self.serverFromChannel = function(channel) {
		return serverFromChannel(channel);
	};

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

					_joinVoiceChannel(server, channel, token, session, endpoint, callback);
					ws.removeListener('message', handleVoice);
				}
			}
		});
	};
	self.leaveVoiceChannel = function(channel, callback) {
		checkRS(function() {
			if (vChannels[channel]) {
				if (!vChannels[channel].ws || !vChannels[channel].udp) {
					console.log("Currently connecting to voice channel: " + channel + ", unable to leave until finished.");
					return;
				}
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
				if (typeof(callback) === 'function') {
					callback();
				}
			} else {
				console.log("Not in the voice channel: " + channel);
			}
		});
	};
	self.getAudioContext = function(channelObj, callback) { //Thanks #q/qeled.
		checkRS(function() {
			var channel = typeof(channelObj) === 'object' ? channelObj.channel : channelObj;
			var audioChannels = channelObj.stereo && channelObj.stereo === true ? 2 : 1;

			function AudioCB(audioChannels, opusEncoder, udpClient, vWS) {
				EE.call(this);
				var self = this;
				var playingAF = false;
				var streamRef;
				var startTime;
				var sequence = 0;
				var timestamp = 0;
				var speakers = [];

				function sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt) {
					cnt++;
					var buff;
					buff = streamOutput.read( 1920 * audioChannels );
					if (!streamOutput.destroyed && vChannels[channel]) {
						sequence + 1 < 65535 ? sequence += 1 : sequence = 0;
						timestamp + 960 < 4294967295 ? timestamp += 960 : timestamp = 0;

						var encoded = [0xF8, 0xFF, 0xFE];
						if (buff && buff.length === 1920 * audioChannels) {
							encoded = opusEncoder.encode(buff);
						}
						var audioPacket = VoicePacket(encoded, sequence, timestamp, vChannels[channel].ws.ssrc);
						var nextTime = startTime + cnt * 20;

						udpClient.send(audioPacket, 0, audioPacket.length, vChannels[channel].ws.port, vChannels[channel].address, function(err) {
							if (err) { console.log(err) }
						});
						return setTimeout(function() {
							return sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt);
						}, 20 + (nextTime - new Date().getTime()));
					}
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
					if (selection) {
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
							sendAudio(audioChannels, opusEncoder, enc.stdout, udpClient, vWS, 0);
						});
						streamRef = enc;
					}
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
					sendAudio(audioChannels, opusEncoder, stream, udpClient, vWS, 0);
				}

				udpClient.on('message', function(msg) {
					var ssrc, enc, b, d;
					ssrc = msg.readUIntBE(8, 4);
					b = msg.slice(12);

					if (!speakers[ssrc]) {
						enc = new Opus.OpusEncoder( 48000, 1 * audioChannels );
						speakers[ssrc] = enc;
					} else {
						enc = speakers[ssrc];
					}

					try { //Don't really want to assign variables, for speed, but Discord sometimes tosses back corrupted audio data
						d = enc.decode(b);
					} catch(e) {};

					self.emit('incoming', ssrc, d);
				});
			}
			var childProc, spawn, spawnSync, encs = ['ffmpeg', 'avconv'], enc, selection, vWS, udpClient, Opus, opusEncoder, speakingStart;

			if (vChannels[channel]) {
				try { Opus = require('node-opus'); } catch(e) { console.log("You need the Node module: 'node-opus'"); console.log(e); return false; }
				opusEncoder = new Opus.OpusEncoder( 48000, 1 * audioChannels );
				speakingStart = { "op": 5, "d": { "speaking": true, "delay": 0 } };
				vWS = vChannels[channel].ws.connection;
				udpClient = vChannels[channel].udp.connection;

				if (vChannels[channel].ready === true) {
					util.inherits(AudioCB, EE);
					vChannels[channel].udp.audio = vChannels[channel].udp.audio || new AudioCB(audioChannels, opusEncoder, udpClient, vWS);
					callback(vChannels[channel].udp.audio);
				} else { console.log("The connection to the voice channel " + channel + " has not been initialized yet."); }
			} else { console.log("You have not joined the voice channel: " + channel); }

		});
	};

	if (options.autorun && options.autorun === true) {
		self.connect();
	}
	return self;
}

util.inherits(DiscordClient, EE);
module.exports = DiscordClient;
