/*jslint node: true */
"use strict";

var util = require("util");
var EventEmitter = require("events").EventEmitter;

function DiscordClient(options) {
	var self = this;
	EventEmitter.call(self);
	self.connected = false;
	
	if (typeof (options) !== "object") {
		console.log("The options should be an object");
		return;
	}

	/*Variables*/
	var websocket = require('ws'),
		request = require('request'),
		udp = require('dgram'),
		fs = require('fs'),
		zlib = require('zlib'),
		dns = require('dns'),
		ws,
		vChannels = {},
		request = request.defaults({'headers': messageHeaders(), 'gzip': true}),
		KAi;
	/*Version check*/
	try {
		request("https://registry.npmjs.org/discord.io", function(err, res, body) {
			if (!err) {
				var cv;
				var uv;
				try {
					cv = require('../package.json').version;
					uv = JSON.parse(body)['dist-tags'].latest;
				} catch(e) {}
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

		var loginJSON = JSON.stringify({email: options.email, password: options.password});
		request.post({ //This is where the magic happens, if you're looking through it.
			url: "https://discordapp.com/api/auth/login",
			body: loginJSON
		}, function (err, res, body) {
			if (!err && checkStatus(res)) {
				body = JSON.parse(body);
				self.internals.token = body.token;
				request = request.defaults({'headers': messageHeaders(), 'gzip': true});

				request.get({
					url: "https://discordapp.com/api/gateway"
				}, function (err, res, gatewayBody) {
					if (!err && checkStatus(res)) {
						gatewayBody = JSON.parse(gatewayBody);
						ws = new websocket(gatewayBody.url);
						
						self.internals.gatewayUrl = gatewayBody.url;
						self.presenceStatus = 'online';
						self.connected = true;

						ws.on('message', function(data, flags) {
							var message = flags.binary ? JSON.parse(zlib.inflateSync(data).toString()) : JSON.parse(data);
							
							try {
								self.internals.sequence = message.s;
							} catch(e) {}

							//Events
							if (message.t) {
								switch (message.t) {
									case "READY":
										for (var userItem in message.d.user) {
											self[userItem] = message.d.user[userItem];
										}
										
										getServerInfo(message.d.guilds, function() {
											getDirectMessages(message.d.private_channels);
											self.emit('ready', message);
										});
								
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
										self.emit('presence', self.servers[server].members[message.d.user.id].user.username, message.d.user.id, message.d.status, message);
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
									case "GUILD_CREATE":
										if (message.d) {
											self.servers[message.d.id] = {};
											for (var item in message.d) {
												self.servers[message.d.id][item] = message.d[item];
											}
										}
										break;
									case "GUILD_UPDATE":
										if (message.d) {
											if (!self.servers[message.d.id]) {
												self.servers[message.d.id] = {};
											}
											
											for (var item in message.d) {
												self.servers[message.d.id][item] = message.d[item];
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
									case "GUILD_MEMBER_REMOVE":
										if (message.d && self.servers[message.d.guild_id]) {
											delete self.servers[message.d.guild_id].members[message.d.user.id];
										}
										break;
									case "GUILD_ROLE_CREATE":
										if (message.d) {
											self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.guild_id, message.d.role);
										}
										break;
									case "GUILD_ROLE_UPDATE":
										if (message.d) {
											self.servers[message.d.guild_id].roles[message.d.role.id] = new Role(message.d.guild_id, message.d.role);
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
												self.directMessages[message.d.recipient.id] = {};
												for (var DMItem in message.d) {
													self.directMessages[message.d.recipient.id][DMItem] = message.d[DMItem];
												}
											} else {
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
							self.emit('debug', message);
						});
						ws.once('close', function() {
							clearInterval(KAi);
							self.connected = false;
							self.emit("disconnected");
						});
						ws.once('error', function(err) {
							self.connected = false;
							//self.emit('err', err);
							console.log(err);
							self.emit("disconnected");
						});
						ws.once('open', function() {
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
									"compress": !!zlib.inflateSync
								}
							}
							ws.send(JSON.stringify(initObj));
						});
						
						self.internals.settings = {};
						request.get({
							url: "https://discordapp.com/api/users/@me/settings",
						}, function(err, res, body) {
							if (!err && checkStatus(res)) {
								body = JSON.parse(body);
								for (var sItem in body) {
									self.internals.settings[sItem] = body[sItem];
								}
							} else {
								//self.emit("err", "Couldn't GET client settings: " + err);
								console.log("Error GETing client settings: " + err);
							}
						});
						
					} else {
						//self.emit("err", "Couldn't GET Gateway list: " + err);
						console.log("Error GETing gateway list: " + err);
						self.emit("disconnected");
						return false;
					}
				});			
			} else {
				//self.emit("err", "Could not POST login information.");
				console.log("Error POSTing login information: " + err);
				self.emit("disconnected");
				return false;
			}
		});
	}
	function getServerInfo(servArr, callback) {
		self.servers = {};
		for (var server=0; server<servArr.length; server++) {
			var serverID = servArr[server].id;
			
			var channelArr = servArr[server].channels;
			var memberArr = servArr[server].members;
			var presenceArr = servArr[server].presences;
			var roleArr = servArr[server].roles;
			var voiceArr = servArr[server].voice_states;
			
			self.servers[serverID] = {};
			
			for (var key in servArr[server]) {
				self.servers[serverID][key] = servArr[server][key];
			}
			
			self.servers[serverID].channels = {}; //Turning these three into objects for easy search, instead of their original arrays
			self.servers[serverID].members = {};
			self.servers[serverID].roles = {};
			
			channelArr.forEach(function(channel) {
				channel.members = {};
				self.servers[serverID].channels[channel.id] = channel;
			});
			
			memberArr.forEach(function(member) {
				self.servers[serverID].members[member.user.id] = member;
			});
			
			presenceArr.forEach(function(presence) {
				var uID = presence.user.id;
				for (var pkey in presence) {
					if (pkey !== "user") {
						try {
							self.servers[serverID].members[uID][pkey] = presence[pkey];
						} catch (e) {}
					}
				}
			});
			
			roleArr.forEach(function(role) {
				self.servers[serverID].roles[role.id] = role;
			});
			
			voiceArr.forEach(function(vs) {
				var channelID = vs.channel_id;
				var userID = vs.user_id;
				if (self.servers[serverID].channels[channelID]) {
					self.servers[serverID].channels[channelID].members[userID] = vs;
					self.servers[serverID].members[userID].voice_channel_id = channelID;
				}
			});
		}
		callback();
	}
	function getDirectMessages(DMArray) {
		for (var DM=0; DM<DMArray.length; DM++) {
			self.directMessages[DMArray[DM].recipient.id] = DMArray[DM];
		}		
	}
	function checkRS(callback) {
		if (ws) {
			if (ws.readyState && ws.readyState == 1) {
				callback();
			} else {
				console.log("The bot is not connected yet");
				return false;
			}
		}
	}
	function messageHeaders() {
		var headers = {
			"accept": "*/*",
			"accept-encoding": "gzip, deflate",
			"accept-language": "en-US;q=0.8",
			"authorization": self.internals ? self.internals.token : undefined,
			"content-type": "application/json",
			"dnt": "1",
			"origin": "https://discordapp.com",
			"user-agent": "Nodebot (node-discord)"
		};
		return headers;
	}
	function checkStatus(response) {
		return (response.statusCode / 100 | 0) === 2
	}
	function serverFromChannel(channel) {
		for (var server in self.servers) {
			if (self.servers[server].channels[channel]) {
				return server;
			}
		}
		return;
	}
	function generateMessage(channelID, message) {
		var foundIDs = [];
		var serverID = serverFromChannel(channelID);
		if (serverID !== undefined) {
			for (var i=0; i<message.length; i++) {
				if (message[i] === "@") {
					var username = message.substring(i + 1, message.indexOf(" ", i) > -1 ? message.indexOf(" ", i) : message.length);
					for (var userID in self.servers[serverID].members) {
						if (self.servers[serverID].members[userID].user.username === username) { //Holy Bob
							if (foundIDs.indexOf(userID) === -1) {
								foundIDs.push(userID);
								break;
							}
						}
					}
					
				}
			}
		}
		
		return {
			content: message,
			mentions: foundIDs,
			tts: false,
			nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
		}
	}
	function _joinVoiceChannel(server, channel, token, session, endpoint, callback) {
		endpoint = endpoint.split(":")[0];
		dns.lookup(endpoint, function(err, address, family) {
			endpoint = address;
			vChannels[channel].endpoint = endpoint;
			vChannels[channel].ws = {};
			vChannels[channel].udp = {};
			vChannels[channel].ready = false;
			var vWS = vChannels[channel].ws.connection = new websocket("wss://" + endpoint, null, {rejectUnauthorized: false});
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
						udpClient.send(udpDiscPacket, 0, udpDiscPacket.length, vData.d.port, endpoint, function(err) { if (err) console.log(err); });
						break;
					case 4:
						vChannels[channel].ready = true;
						vChannels[channel].selectedMode = vData.d.mode;
						if (callback && typeof(callback) === 'function') {
							callback();
						}
						break;
				}
			});
			vWS.once('close', function() {
				clearInterval(vKAI);
			});
		});
	}
	function VoicePacket(packet, sequence, timestamp, ssrc) {
		var audioBuffer = packet;
		var retBuff = new Buffer(audioBuffer.length + 12);
		retBuff.fill(0);
		retBuff[0] = 0x80;
		retBuff[1] = 0x78;
		retBuff.writeUIntBE(sequence, 2, 2);
		retBuff.writeUIntBE(timestamp, 4, 4);
		retBuff.writeUIntBE(ssrc, 8, 4);
		
		for (var i=0; i<audioBuffer.length; i++) {
			retBuff[i + 12] = audioBuffer[i];
		}
		
		return retBuff;
	}
	/*Prototypes*/
	function Role(server, options) {
		var self = this;
		this.position = options.position;
		this.permissions = options.permissions;
		this.name = options.name;
		this.id = options.id;
		this.hoist = options.hoist;
		this.color = options.color;
	
		this.permission_values = {
			get GENERAL_CREATE_INSTANT_INVITE() {
				return getPerm(0);
			},
			set GENERAL_CREATE_INSTANT_INVITE(v) {
				return setPerm(0, v);
			},
			get GENERAL_KICK_MEMBERS() {
				return getPerm(1);
			},
			set GENERAL_KICK_MEMBERS(v) {
				return setPerm(1, v);
			},
			get GENERAL_BAN_MEMBERS() {
				return getPerm(2);
			},
			set GENERAL_BAN_MEMBERS(v) {
				return setPerm(2, v);
			},
			get GENERAL_MANAGE_ROLES() {
				return getPerm(3);
			},
			set GENERAL_MANAGE_ROLES(v) {
				return setPerm(3, v);
			},
			get GENERAL_MANAGE_CHANNELS() {
				return getPerm(4);
			},
			set GENERAL_MANAGE_CHANNELS(v) {
				return setPerm(4, v);
			},
			get GENERAL_MANAGE_GUILD() {
				return getPerm(5);
			},
			set GENERAL_MANAGE_GUILD(v) {
				return setPerm(5, v);
			},
			
			get TEXT_READ_MESSAGES() {
				return getPerm(10);
			},
			set TEXT_READ_MESSAGES(v) {
				return setPerm(10, v);
			},
			get TEXT_SEND_MESSAGES() {
				return getPerm(11);
			},
			set TEXT_SEND_MESSAGES(v) {
				return setPerm(11, v);
			},
			get TEXT_SEND_TTS_MESSAGE() {
				return getPerm(12);
			},
			set TEXT_SEND_TTS_MESSAGE(v) {
				return setPerm(12, v);
			},
			get TEXT_MANAGE_MESSAGES() {
				return getPerm(13);
			},
			set TEXT_MANAGE_MESSAGES(v) {
				return setPerm(13, v);
			},
			get TEXT_EMBED_LINKS() {
				return getPerm(14);
			},
			set TEXT_EMBED_LINKS(v) {
				return setPerm(14, v);
			},
			get TEXT_ATTACH_FILES() {
				return getPerm(15);
			},
			set TEXT_ATTACH_FILES(v) {
				return setPerm(15, v);
			},
			get TEXT_READ_MESSAGE_HISTORY() {
				return getPerm(16);
			},
			set TEXT_READ_MESSAGE_HISTORY(v) {
				return setPerm(16, v);
			},
			get TEXT_MENTION_EVERYONE() {
				return getPerm(17);
			},
			set TEXT_MENTION_EVERYONE(v) {
				return setPerm(17, v);
			},
			
			get VOICE_CONNECT() {
				return getPerm(20);
			},
			set VOICE_CONNECT(v) {
				return setPerm(20, v);
			},
			get VOICE_SPEAK() {
				return getPerm(21);
			},
			set VOICE_SPEAK(v) {
				return setPerm(21, v);
			},
			get VOICE_MUTE_MEMBERS() {
				return getPerm(22);
			},
			set VOICE_MUTE_MEMBERS(v) {
				return setPerm(22, v);
			},
			get VOICE_DEAFEN_MEMBERS() {
				return getPerm(23);
			},
			set VOICE_DEAFEN_MEMBERS(v) {
				return setPerm(23, v);
			},
			get VOICE_MOVE_MEMBERS() {
				return getPerm(24);
			},
			set VOICE_MOVE_MEMBERS(v) {
				return setPerm(24, v);
			},
			get VOICE_USE_VAD() {
				return getPerm(25);
			},
			set VOICE_USE_VAD(v) {
				return setPerm(25, v);
			}
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
			if (bl === true) {
				self.permissions |= (1 << (bit));
			} else if (bl === false) {
				self.permissions &= ~(1 << bit);
			}
		}
	}
	
	/*Methods*/
	/*Connection*/
	self.connect = function() {
		if (self.connected === false) {
			init();
		}
	};
	self.disconnect = function() {
		ws.close();
		ws = undefined;
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
			var plArr = Object.keys(payload);
			
			for (var key in input) {
				if (plArr.indexOf(key) > -1) {
					payload[key] = input[key];
				} else {
					console.log(key + ' is not a valid key. Valid keys are: ');
					console.log(plArr);
					return false;
				}
			}
			
			request.patch({
				url: "https://discordapp.com/api/users/@me",
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);					
					if (typeof(callback) === 'function') {
						callback(body);
					}
				} else {
					//self.emit('err', err);
					console.log("Error editing user info: " + err);
				}
			});
		});
	};
	self.setPresence = function(input) {
		checkRS(function() {
			var payload = {
				op: 3,
				d: {
					idle_since: null,
					game_id: null
				}
			}
			var plArr = Object.keys(payload.d);
			
			for (var key in input) {
				if (plArr.indexOf(key) > -1) {
					payload.d[key] = input[key];
				} else {
					console.log(key + ' is not a valid key. Valid keys are: ');
					console.log(plArr);
					return false;
				}
			}
			
			ws.send(JSON.stringify(payload));
			
			if (payload.d.idle_since === null) {
				self.presenceStatus = 'online'
			} else {
				self.presenceStatus = 'idle'
			}
		});
	};
	/*Bot content actions*/
	self.uploadFile = function(input, callback) { /* After like 15 minutes of fighting with Request, turns out Discord doesn't allow multiple files in one message... despite having an attachments array.*/
		checkRS(function() {
			var channel = input.channel;
			var file = input.file;
			var formData = {
				file: fs.createReadStream(file)
			};
			request.post({
				url: "https://discordapp.com/api/channels/" + channel + "/messages",
				formData: formData
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					console.log("Unable to upload file: " + err);
					//self.emit('err', 'Unable to upload file: ' + err);
				}
			});
		});
	};
	self.sendMessage = function(input, callback) {
		checkRS(function() {
			var target = input.to;
			var message = generateMessage(input.to, input.message);
			var typingTime;
			if (input.tts === true) message.tts = true;
			if (input.nonce) message.nonce = input.nonce;
			var messageJSON = JSON.stringify(message);
			
			if (input.typing && input.typing === true) {
				typingTime = (input.message.length * 0.12) * 1000;
				(function emulateTyping(time) {
					if (time <= 0) {
						_sendMessage(message, target, messageJSON);
					} else {
						if (time > 5000) {
							time = time - 5000;
						} else {
							time = time - time;
						}
						request.post({
							url: "https://discordapp.com/api/channels/" + target + "/typing",
						}, function(err, res, body) {
							if (!err && checkStatus(res)) {
								setTimeout(function() {
									emulateTyping(time);
								}, time);
							}
						});
					}
				})(typingTime);
				return;
			}
			function _sendMessage(message, target, messageJSON) {
				if (self.directMessages[target]) {
					request.post({
						url: "https://discordapp.com/api/channels/" + self.directMessages[target].id + "/messages",
						body: messageJSON
					}, function(err, res, mbody) {
						if (!err && checkStatus(res)) {
							if (typeof(callback) === 'function') {
								callback(JSON.parse(mbody));
							}
						} else {
							console.log("Unable to send message: " + err);
							//self.emit('err', "Unable to send message: " + err);
						}
					});
					return;
				} else {
					for (var server in self.servers) {
						if (self.servers[server].members[target]) {
							var initMessage = {
								recipient_id: target
							};
							request.post({
								url: "https://discordapp.com/api/users/" + self.id + "/channels",
								body: JSON.stringify(initMessage)
							}, function(err, res, body) {
								if (!err && checkStatus(res)) {
									body = JSON.parse(body);
									request.post({
										url: "https://discordapp.com/api/channels/" + body.id + "/messages",
										body: messageJSON
									}, function(err, res, mbody) {
										if (!err && checkStatus(res)) {
											if (typeof(callback) === 'function') {
												callback(JSON.parse(mbody));
											}
										} else {
											//self.emit('err', "Unable to send message: " + err);
											console.log("Unable to send message. " + err);
										}
									});

									self.directMessages[body.recipient.id] = body;
								}
							});

							return;
						}
					}
				}

				request.post({
					url: "https://discordapp.com/api/channels/" + target + "/messages",
					body: messageJSON
				}, function(err, res, mbody) {
					if (!err && checkStatus(res)) {
						if (typeof(callback) === 'function') {
							callback(JSON.parse(mbody));
						}
					} else {
						//self.emit('err', "Unable to send message: " + err);
						console.log("Unable to send message. " + err);
					}
				});
			return;
			}
			_sendMessage(message, target, messageJSON);
		});
	};
	self.getMessages = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			var qs = {};
			typeof(input.limit) !== 'number' ? qs.limit = 50 : qs.limit = input.limit
			if (input.before) qs.before = input.before;
			if (input.after) qs.after = input.after;
			
			request.get({
				url: "https://discordapp.com/api/channels/" + channelID + "/messages",
				qs: qs
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					//self.emit('err', "Unable to get recent messages: " + err);
					console.log("Unable to get recent messages. " + err);
				}
			});
		});
	};
	self.editMessage = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			var messageID = input.messageID;
			var message = generateMessage(channelID, input.message);
			var messageJSON = JSON.stringify(message);
		
			request.patch({
				url: "https://discordapp.com/api/channels/" + channelID + "/messages/" + messageID,
				body: messageJSON
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					//self.emit('err', "Unable to edit message: " + err);
					console.log("Unable to edit message. " + err);
				}
			});
		});
	};
	self.simulateTyping = function(channelID, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/channels/" + channelID + "/typing",
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback();
					}
				}
			});
		});
	}
	self.deleteMessage = function(input) {
		checkRS(function() {
			var channelID = input.channel;
			var messageID = input.messageID;
		
			request.del({
				url: "https://discordapp.com/api/channels/" + channelID + "/messages/" + messageID
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
	self.kick = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The kick method requires an object argument");
				return false;
			}
			
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
			});
		});
	};
	self.ban = function(input) {
		checkRS(function() {
			var channel = input.channel;
			var target = input.target;
			var lastDays = "";
			
			if (typeof(input) !== "object") {
				console.log("The ban method requires an object argument");
				return false;
			}
			
			if (input.lastDays) {
				if ([1,7].indexOf(input.lastDays) > -1) {
					lastDays = "?delete-message-days=" + input.lastDays;
				} else {
					console.log("For now, the duration can only be 1 or 7 days");
					return false;
				}
			}
			
			request.put({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target + lastDays,
			});
		});
	};
	self.unban = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The unban method requires an object argument");
				return false;
			}
			
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target,
			});
		});
	};
	self.mute = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The mute method requires an object argument");
				return false;
			}
			
			var messJSON = JSON.stringify({mute: true});
			
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: messJSON
			});
		});
	};
	self.unmute = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The unmute method requires an object argument");
				return false;
			}
			
			var messJSON = JSON.stringify({mute: false});
			
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: messJSON
			});
		});
	};
	self.deafen = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The defean method requires an object argument");
				return false;
			}
			
			var messJSON = JSON.stringify({deaf: true});
			
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: messJSON
			});
		});
	};
	self.undeafen = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The undefean method requires an object argument");
				return false;
			}
			
			var messJSON = JSON.stringify({deaf: false});
			
			request.patch({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				body: messJSON
			});
		});
	};
	/*Bot server management actions*/
	self.createServer = function(input, callback) {
		checkRS(function() {
			var icon;
			var name = input.name;
			var region;
		
			input.icon === undefined ? icon = null : icon =  "data:image/png;base64," + input.icon;
		
			request.get({
				url: "https://discordapp.com/api/voice/regions",
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					var regions = body.map(function(region) {
						return region.id;
					});
					if (regions.indexOf(input.region) > -1) {
						region = input.region;
						var newServer = {
							icon: icon,
							name: name,
							region: region
						};
					
						request.post({
							url: "https://discordapp.com/api/guilds",
							body: JSON.stringify(newServer)
						}, function(err, res, sbody) {
							if (!err && checkStatus(res)) {
								if (typeof(callback) === 'function') {
									sbody = JSON.parse(sbody);
									callback(sbody);
								}
							}
						});
						
					} else {
						console.log("You need to use one of these for regions:" + regions.map(function(rname) { return  " " + rname}));
					}
				}
			});
		});
	};
	self.editServer = function(input, callback) {
		checkRS(function() {
			request.get({
				url: "https://discordapp.com/api/voice/regions",
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					var server, sererCache, plArr, payload, regions = body.map(function(region) { return region.id;	});
					try {
						server = serverFromChannel(server);
					} catch(e) { console.log("Server " + serverFromChannel(server) + " not found in cache. Is the client a member of the server?"); return false;}
					serverCache = bot.servers[server];
					
					payload = {
						name: serverCache.name,
						icon: serverCache.null,
						region: serverCache.region,
						afk_channel_id: serverCache.afk_channel_id,
						afk_timeout: serverCache.afk_timeout
					}
					plArr = Object.keys(payload);
					
					for (var key in input) {
						if (plArr.indexOf(key) > -1) {
							if (key === 'region') {
								if (regions.indexOf(input[key]) > -1) {
									payload[key] = input[key];
								} else {
									console.log(input[key] + " is not a correct value. You need to use one of these for regions:" + regions.map(function(rname) { return  " " + rname}) + ". Using current setting: " + payload[key]);
								}
							}
							if (key === 'afk_channel_id') {
								if (input[key] in self.servers[server].channels) {
									payload[key] = input[key];
								} else {
									console.log(input[key] + " not in server " + server + ". Using current setting: " + payload[key]);
								}
							}
							if (key === 'afk_timeout') {
								if ([60, 300, 900, 1800, 3600].indexOf(input[key]) > -1) {
									payload[key] = input[key];
								} else {
									console.log(input[key] + " is not a correct value. Correct values are: 60, 300, 900, 1800, 3600 (as numbers). Using current setting: " + payload[key]);
								}
							}
						}
					}
					
					request.patch({
						url: "https://discordapp.com/api/guilds/" + server
					}, function(err, res, pbody) {
						if (!err && checkStatus(res)) {
							//Going to need to fix this
							if (typeof(callback) === 'function') {
								callback(pbody);
							}
						}
					});
				}
			});
		});
	}
	self.deleteServer = function(serverID, callback) {
		checkRS(function() {
			if (self.servers[serverID]) {
				request.del({
					url: "https://discordapp.com/api/guilds/" + serverID
				}, function(err, res, body) {
					if (!err && checkStatus(res)) {
						body = JSON.parse(body);
						if (typeof(callback) === 'function') {
							callback(body);
						}
					}
				});
			} else {
				//self.emit("err", "You are not a part of server: " + serverID);
				console.log("You are not a part of server: " + serverID);
			}
		});
	};

	self.acceptInvite = function(inviteCode, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/invite/" + inviteCode,
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					if (typeof(callback) === "function") {
						callback(body);
					}
				} else {
					//self.emit("err", "The invite code provided is incorrect.");
					console.log("The invite code provided (%s) is incorrect.", inviteCode);
				}
			});
		});
	};
	self.createInvite = function(input, callback) {
		checkRS(function() {
			var payload;
			var plArr;
			if (Object.keys(input).length === 1) {
				if (Object.keys(input)[0] === "channel") {
					payload = {
						validate: self.internals.lastInviteCode
					};
				}
			} else {
				payload = {
					max_age: 0,
					max_users: 0,
					temporary: false,
					xkcdpass: false
				};
				plArr = Object.keys(payload);
				
				for (var key in input) {
					if (key !== "channel") {
						if (plArr.indexOf(key) > -1) {
							payload[key] = input[key];
						} else {
							console.log(key + ' is not a valid key. Valid keys are: ');
							console.log(plArr);
						}
					}
				}
			}
			
			request.post({
				url: "https://discordapp.com/api/channels/"+ input.channel + "/invites",
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					self.internals.lastInviteCode = body.code;
					
					if (typeof(callback) === "function") {
						callback(body);
					}
				} else {
					//self.emit("err", "Could not create invite.");
					console.log("Could not create invite.");
				}
			});
		});
	};
	self.deleteInvite = function(inviteCode, callback) {
		checkRS(function() {
			reqest.del({
				url: "https://discordapp.com/api/invite/" + inviteCode
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback(body);
					}
				}
			});
		});
	}
	
	self.createChannel = function(input, callback) {
		checkRS(function() {
			var serverID = input.server;
			var type;
			var name = input.name;
			(['text', 'voice'].indexOf(input.type) == -1) ? console.log("The type must be 'text' or 'voice'") : type = input.type;
			var newChannel = {
				name: name,
				type: type
			}
			
			request.post({
				url: "https://discordapp.com/api/guilds/" + serverID + "/channels",
				body: JSON.stringify(newChannel)
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					if (typeof(callback) === 'function') {
						callback(body);
					}
				}
			});
		});
	};
	self.deleteChannel = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			
			request.del({
				url: "https://discordapp.com/api/channels/" + channelID,
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					if (typeof(callback) === 'function') {
						callback(body);
					}
				}
			});
		});
	};
	self.editChannelInfo = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			
			var payload;
			var plArr;
			
			try {
				payload = {
					"name":self.servers[self.serverFromChannel(channelID)].channels[channelID].name,
					"position":self.servers[self.serverFromChannel(channelID)].channels[channelID].position,
					"topic":self.servers[self.serverFromChannel(channelID)].channels[channelID].topic
				};
				plArr = Object.keys(payload);
			} catch (e) {
				request.get({
					url: "https://discordapp.com/api/channels/" + channelID
				}, function(err, res, body) {
					if (!err && checkStatus(res)) {
						body = JSON.parse(body);
						payload = {
							"name": body.name,
							"position": body.position,
							"topic": body.topic
						};
						plArr = Object.keys(payload);
					} else {
						//self.emit('err', err);
						console.log(err);
					}
				});
			}
			
			for (var key in input) {
				if (key !== 'channel') {
					if (plArr.indexOf(key) > -1) {
						payload[key] = input[key];
					} else {
						console.log(key + ' is not a valid key. Valid keys are: ');
						console.log(plArr);
					}
				}
			}
			
			request.patch({
				url: "https://discordapp.com/api/channels/" + channelID,
				body: JSON.stringify(payload)
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					if (typeof(callback) === 'function') {
						callback(body);
					}
				} else {
					//self.emit('err', err);
					console.log(err);
				}
			});
		});
	};
	
	self.createRole = function(serverID, callback) {
		checkRS(function() {
			request.post({
				url: "https://discordapp.com/api/guilds/" + serverID + "/roles"
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback(body);
					}
				} else {
					//self.emit('err', err);
					console.log(err);
				}
			});
		});
	};
	self.editRole = function(input, callback) {
		checkRS(function() {
			try {
				var _tempRole = new Role(input.server, self.servers[input.server].roles[input.role]); //Copy role to a temporary role
				var acceptedKeys = ["server", "role", "name", "permissions", "color", "hoist"]; //I really need to use one system
				for (var key in input) { //Looping over the input and applying it to the temporary role
					if (acceptedKeys.indexOf(key) > -1) {
						if (["server", "role"].indexOf(key) === -1) {
							if (key === "permissions") {
								for (var perm in input[key]) {
									_tempRole.permission_values[perm] = input[key][perm];
								}
							} else if (key === "color") {
								if (input[key][0] === "#") {
									_tempRole.color = parseInt(input[key].replace("#", "0x"), 16);
								} else if (_tempRole.color_values[input[key]]) {
									_tempRole.color = _tempRole.color_values[input[key]];
								}
							} else {
								_tempRole[key] = input[key];
							}
						}
					} else {
						console.log(key + ' is not a valid key. Valid keys are: ');
						console.log(acceptedKeys);
					}
				}
				
				var payload = {
					name: _tempRole.name,
					permissions: _tempRole.permissions,
					color: _tempRole.color,
					hoist: _tempRole.hoist
				};
				
				request.patch({
					url: "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role,
					body: JSON.stringify(payload)
				}, function(err, res, body) {
					if (!err && checkStatus(res)) {
						if (typeof(callback) === 'function') {
							callback(body);
						}
					}
				});
				
			} catch (e) {
				//self.emit('err', e);
				console.log(e);
			}
		});
	};
	self.deleteRole = function(input, callback) {
		checkRS(function() {
			request.del({
				url: "https://discordapp.com/api/guilds/" + input.server + "/roles/" + input.role
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					if (typeof(callback) === 'function') {
						callback();
					}
				}
			});
		});
	};

	self.addToRole = function(input, callback) {
		checkRS(function() {
			console.log("This method ('addToRole') may change in the future.");
			var serverID = input.server;
			var userID = input.user;
			var roleID = input.role;
			
			request.get({
				url: "https://discordapp.com/api/guilds/" + serverID + "/members",
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					for (var user=0; user<body.length; user++) {
						if (body[user].user.id === userID) {
							var uroles = body[user].roles;
							
							if (self.servers[serverID].roles[roleID]) {
								if (uroles.indexOf(roleID) === -1) {
									uroles.push(roleID);
									
									request.patch({
										url: "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID,
										body: JSON.stringify({roles: uroles})
									}, function(err, res, pbody) { //Hehe pbody
										if (!err && checkStatus(res)) {
											try {
												pbody = JSON.parse(pbody);
												if (pbody.message) {
													//self.emit('err', "Could not set role: " + pbody.message);
													console.log("Could not set role: " + roleID + ", " + err);
												}
											} catch(e) {}
											if (typeof(callback) === 'function') {
												callback();
											}
										} else {
											//self.emit('err', "Could not set role: " + err);
											console.log("Could not set role: " + roleID + ", " + err);
										}
									});
								} else {
									//self.emit("err", "The role ID " + roleID + " is already applied to the user " + userID);
									console.log("The role ID " + roleID + " is already applied to the user " + userID);
								}
							} else {
								//self.emit("err", "The role ID " + roleID + " is not in the server " + serverID);
								console.log("The role ID " + roleID + " is not in the server " + serverID);
							}
						}
					}
				} else {
					//self.emit("err", "Couldn't get user list to edit roles. Does the client have permissions?");
					console.log("Couldn't get user list to edit roles. Does the client have permissions?");
				}
			});
		});
	};
	self.removeFromRole = function(input, callback) {
		checkRS(function() {
			console.log("This method ('removeFromRole') may change in the future.");
			var serverID = input.server;
			var userID = input.user;
			var roleID = input.role;
			
			request.get({
				url: "https://discordapp.com/api/guilds/" + serverID + "/members",
			}, function(err, res, body) {
				if (!err && checkStatus(res)) {
					body = JSON.parse(body);
					for (var user=0; user<body.length; user++) {
						if (body[user].user.id === userID) {
							var uroles = body[user].roles;
							
							if (uroles.indexOf(roleID) > -1) {
								uroles.splice(uroles.indexOf(roleID), 1);
								request.patch({
									url: "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID,
									body: JSON.stringify({roles: uroles})
								}, function(err, res, pbody) {
									if (!err && checkStatus(res)) {
										try {
											pbody = JSON.parse(pbody);
											if (pbody.message) {
												//self.emit('err', "Could not remove role: " + pbody.message);
												console.log("Could not remove role: " + roleID + ", " + err);
											}
										} catch(e) {}
										if (typeof(callback) === 'function') {
											callback();
										}
									} else {
										//self.emit('err', "Could not remove role: " + err);
										console.log("Could not remove role: " + roleID + ", " + err);
									}
								});
							} else {
								//self.emit("err", "The user " + userID + " does not have the role " + roleID);
								console.log("The user " + userID + " does not have the role " + roleID);
							}
						}
					}
				} else {
					//self.emit("err", "Couldn't get user list to edit roles. Does the client have permissions?");
					console.log("Couldn't get the user list to edit roles. Does the client have permissions?");
				}
			});
		});
	};
	
	/*Misc*/
	self.serverFromChannel = function(channel) {
		return serverFromChannel(channel);
	};
	
	/*Voice, will relocate and possibly change. ALL OF THIS IS EXPERIMENTAL.*/
	self.joinVoiceChannel = function(channel, callback) {
		checkRS(function() {
			function handleVoice(message) {
				var data = JSON.parse(message);
				
				if (data.t === "VOICE_STATE_UPDATE") {
					if (data.d.user_id === self.id && data.d.channel_id !== null) {
						session = data.d.session_id;
					}
				} else if (data.t === "VOICE_SERVER_UPDATE") {
					token = data.d.token;
					server = data.d.guild_id;
					endpoint = data.d.endpoint;
					
					_joinVoiceChannel(server, channel, token, session, endpoint, callback);
					ws.removeListener('message', handleVoice);
				}
			}
			
			var server,
				token,
				session,
				endpoint;
				
			try {
				server = serverFromChannel(channel);
				if (self.servers[server].channels[channel].type === "voice") {
					if (!vChannels[channel]) {
						vChannels[channel] = {};
						var init = {
							"op": 4,
							"d": {
								"guild_id": server,
								"channel_id": channel,
								"self_mute": false,
								"self_deaf": false
							}
						};
						
						ws.on('message', handleVoice);
						
						ws.send(JSON.stringify(init));
					} else {
						console.log("Voice channel already active: " + channel);
					}
				 } else {
					 //self.emit("err", "Selected channel is not a voice channel: " + channel);
					 console.log("Selected channel is not a voice channel: " + channel);
				 }
			} catch(e) {/*self.emit("err", e);*/ console.log(e);}
		});
	};
	self.leaveVoiceChannel = function(channel) {
		checkRS(function() {
			if (vChannels[channel]) {
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
			} else {
				console.log("Not in the voice channel: " + channel);
			}
		});
	};
	self.testAudio = function(channelObj, callback) {
		checkRS(function() {
			var channel = typeof(channelObj) === 'object' ? channelObj.channel : channelObj;
			var audioChannels = channelObj.stereo && channelObj.stereo === true ? 2 : 1;
			
			function AudioCB(audioChannels, opusEncoder, udpClient, vWS) {
				require('events').EventEmitter.call(this);
				var self = this;
				var playingAF = false;
				var streamRef;
				var startTime;
				var sequence = 0;
				var timestamp = 0;
				
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
						
						udpClient.send(audioPacket, 0, audioPacket.length, vChannels[channel].ws.port, vChannels[channel].endpoint, function(err) {
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
						if (players.length > 0) {
							var n = players.shift();
							var s = spawnSync(n);
							if (s.error) {
								return choosePlayer(players);
							} else {
								console.log("Using " + n);
								return n;
							}
						} else {
							console.log("You need either 'ffmpeg' or 'avconv' and they need to be added to PATH");
							return undefined;
						}
					}
					if (!playingAF) {
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
								self.emit('fileEnd');
								self.stopAudioFile();
								var speakingEnd = {
									"op":5,
									"d":{
										"speaking":false,
										"delay":0
									}
								}
								vWS.send(JSON.stringify(speakingEnd));
								playingAF = false;
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
					} else {
						console.log("Already playing something.");
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
					if (typeof(callback) === 'function') {
						callback();	
					}
				}
				this.send = function(stream) { //If you're piping a stream, you can handle everything else.
					vWS.send(JSON.stringify(speakingStart));
					startTime = new Date().getTime();
					sendAudio(audioChannels, opusEncoder, stream, udpClient, vWS, 0);
				}
				
				udpClient.on('message', function(msg) {
					self.emit('incoming', msg.slice(12));
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
					util.inherits(AudioCB, require('events').EventEmitter);
					vChannels[channel].udp.audio = vChannels[channel].udp.audio || new AudioCB(audioChannels, opusEncoder, udpClient, vWS);
					callback(vChannels[channel].udp.audio);
				} else { /*self.emit('err', "The connection to the voice channel " + channel + " has not been initialized yet.");*/ console.log("The connection to the voice channel " + channel + " has not been initialized yet."); }
			} else { /*self.emit('err', "You have not joined the voice channel: " + channel);*/ console.log("You have not joined the voice channel: " + channel); }
			
		});
	};
	
	if (options.autorun && options.autorun === true) {
		self.connect();
	}
	return self;
}

util.inherits(DiscordClient, EventEmitter);
module.exports = DiscordClient;
