(function(Discord){
	var isNode = typeof(window) !== "undefined" && typeof(navigator) !== "undefined";
	var Endpoints = (function () {
		var BASE = "https://discordapp.com/api";
		return {
			BASE: BASE,
			ME: "/users/@me",
			MESSAGES: function(channelID) {
				return "/channels/" + channelID + "/messages";
			},

		}
	})()

	Discord.Client = function(opts) {
		var self = this;
		self.connected = false;
		if (!opts || opts.constructor.name !== 'Object') return console.log("An Object is required to create the discord.io client.");
		if (!isNode) Emitter().apTo(self); //Oh so dirty T_T

		/*Variables*/
		var needle, udp, zlib, dns, crypto, bn,
			ws, KAi, cv, uv, vChannels = {}, uIDToDM = {};
		if (isNode) {
			needle = require('needle'),
			udp = require('dgram'),
			zlib = require('zlib'),
			dns = require('dns'),
			crypto = require('crypto'),
			bn = require('path').basename
		}

		function init() {
			self.servers = {};
			self.internals = {};
			self.directMessages = {};
			self.internals.version = cv || "1.x.x";

			getToken();
		}
		function getToken() {
			if (options.token) return getGateway(options.token);
			return console.log("No 'token' provided. Exiting.");
		}
		function getGateway(token) {
			self.internals.token = token;

			req('get', "https://discordapp.com/api/gateway", function (err, res) {
				if (err || !checkStatus(res)) {
					console.log("Error GETing gateway list: " + checkError(res));
					return self.emit("disconnected");
				}
				startConnection(res.body.url);
			});
		}
		function startConnection(gateway) {
			ws = new Websocket(gateway);
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
		function getOfflineUsers() {
			return ws.send(
				JSON.stringify(
					{
						op: 8,
						d: {
							guild_id: Object.keys(self.servers).filter(function(serverID) {
								if (self.servers[serverID].large) return serverID;
							}),
							query: "",
							limit: 0
						}
					}
				)
			);
		}

		function handleWSOpen() {
			var initObj = {
				"op":2,
				"d": {
					"token": self.internals.token,
					"properties": {
						"$os":isNode ? require('os').platform() : navigator.platform,
						"$browser":"discord.io",
						"$device":"discord.io",
						"$referrer":"",
						"$referring_domain":""
					},
				"v": 3,
				"compress": isNode ? !!zlib.inflateSync : false,
				"large_threshold": 250
				}
			}
			ws.send(JSON.stringify(initObj));
		}
		function handleWSMessage(data, flags) {
			var message = isNode ?
				flags.binary ? JSON.parse(zlib.inflateSync(data).toString()) : JSON.parse(data) :
				JSON.parse(data);

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
					getOfflineUsers();
					getDirectMessages(message.d.private_channels);

					KAi = setInterval(function() {
						//Send Keep Alive Data
						if (ws.readyState == 1) {
							ws.send(JSON.stringify({op: 1, d: Date.now()}));
						}
					}, message.d.heartbeat_interval);
					return self.emit('ready', message);
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
					if (message.d && message.d['guild_id']) {
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
					}
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
				case "GUILD_MEMBERS_CHUNK":
					var members = message.d.members,
						serverID = message.d.guild_id;

					if (!self.servers[serverID].members) self.servers[serverID].members = {};
					members.map(function(user) {
						self.servers[serverID].members[user.user.id] = user;
					});
					break;
				}
			emit(message);
		}
		function handleWSClose(code, data) {
			clearInterval(KAi);
			self.connected = false;
			console.log("Gateway websocket closed: %s %s", code, data);
			ws.removeListener('message', handleWSMessage);
			ws = undefined;
			self.emit("disconnected");
		}

		function messageHeaders() {
			var r = {
				"accept": "*/*",
				"accept-encoding": "gzip, deflate",
				"accept-language": "en-US;q=0.8",
				"dnt": "1",
				"user-agent": "DiscordBot (https://github.com/izy521/discord.io, " + cv + ")"
			};
			if (self.internals.token) r.authorization = (self.bot === true ? "Bot " + self.internals.token : self.internals.token);
			return r;
		}
		function req(method, url) {
			var data, callback, isJSON, http;
			if (typeof(arguments[2]) === 'function') callback = arguments[2]; else (data = arguments[2], callback = arguments[3]);
			isJSON = (function() {
				if (typeof(data) === 'object') if (data.qs) return (delete data.qs, false); else return true;
				return false;
			})();
			if (isNode) return needle.request(method, url, data, { multipart: (typeof(data) === 'object' && !!data.file), headers: messageHeaders(), json: isJSON }, callback);

			if (data.qs) url = url + "?" + encodeQS(data.qs);
			http = new XMLHttpRequest();
			http.open(method.toUpperCase(), url, true);
			for (var key in messageHeaders()) {
				http.setRequestHeader(key, messageHeaders()[key]);
			}
			http.onreadystatechange = function() {
				if (http.readyState == 4) {
					http.statusCode = http.status;
					http.statusMessage = http.statusText;
					http.body = http.responseText;
					if (http.status === 200) return callback(null, http);
					return callback(true, http); //The error message passed to the library users will be custom, so who cares;
				}
			}
			http.send(data);
		}
	};
	Discord.OAuth = function(opts) {

	};
	Discord.Colors = {
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
	Discord.Types = {};

	if (isNode) Emitter().apTo(Discord.Client); //So so dirty.
	
	/*Functions*/
	function encodeQS(data) {
    		return Object.keys(data).map(function(key) {
        		return [key, data[key]].map(encodeURIComponent).join("=");
    		}).join("&");
	}
	
	/*Prototypes*/
	function Emitter() {
		return {
			apTo: function(trgt) {
				if (isNode) {
					var util = require('util');
					var EE = require('events').EventEmitter;
					EE.call(trgt);
					util.inherits(trgt, EE);
				} else {
					//Thank you, http://stackoverflow.com/a/24216547
					function _Emitter() {
						var eventTarget = document.createDocumentFragment();
						function delegate(method) {
							this[method] = eventTarget[method].bind(eventTarget);
						}
						["addEventListener", "dispatchEvent", "removeEventListener"].forEach(delegate, this);
					}
					//But I did the rest myself! D:<
					_Emitter.call(trgt);
					trgt.on = function(eName, cb) {
						trgt.addEventListener(eName, function(e) {
							if (e.detail) {
								var _args = [];
								for (var i=0; i<e.detail.length; i++) {
									if (i > 0) {
										_args.push(e.detail[i]);
									}
								}
								cb.apply(null, _args);
							}
						});
					};

					trgt.once = function(eName, cb) {
						trgt.addEventListener(eName, function(e) {
							if (e.detail) {
								var _args = [];
								for (var i=0; i<e.detail.length; i++) {
									if (i > 0) {
										_args.push(e.detail[i]);
									}
								}
								cb.apply(null, _args);
							}
							trgt.removeEventListener(eName, arguments.callee);
						});
					};

					trgt.removeListener = function(eName, fName) {
						return trgt.removeEventListener(eName, fName);
					};

					trgt.emit = function(eName) {
						var _args = [];
						for (var i=0; i<arguments.length; i++) {
							if (i > 0) {
								_args[i] = arguments[i];
							}
						}
						var evt = new CustomEvent(eName, {'detail': _args});
						trgt.dispatchEvent(evt);
					};
				}
			}
		}
	}
	function Websocket(url, opts) {
		var bc;
		if (isNode) return new (require('ws'))(url, opts);

		bc = new WebSocket(url);
		bc.on = function(eName, cb) {
			switch(eName) { //Message and Error will have extra data that I want directly piped to the 'on'
				case 'message':
					bc.onmessage = function(e) {
						cb(e.data);
					}
					break;
				case 'open':
					bc.onopen = cb;
					break;
				case 'error':
					bc.onerror = function(e) {
						cb(e.data);
					}
					break;
				case 'close':
					bc.onclose = cb;
					break;
			}
		}
	}

	(function() { //Continue
		//These types are mainly so they share the `creationTime` from Resource
		function Resource() {
			this.creationTime = (function() {
				return (this.id / 4194304) + 1420070400000;
			})();
		}
		Discord.Types.Resource = Resource;

		function Server(data) {
			var self = this;
			Resource.call(this);

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
				self.channels[channel.id] = new Channel(channel);
			});
			data.members.forEach(function(member) {
				self.members[member.user.id] = new User(member);
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
		Discord.Types.Server = Server;

		function Channel(data) {
			Resource.call(this);
			applyAll(data, this);
		}
		Discord.Types.Channel = Channel;

		function DMChannel() {
			Resource.call(this);
		}
		Discord.Types.DMChannel = DMChannel;

		function User() {
			Resource.call(this);
		}
		Discord.Types.User = User;

		function Message() {
			Resource.call(this);
		}
		Discord.Types.Message = Message;

		for (var type in Discord.Types) {
			Discord.Types[type].prototype = Resource.prototype;
		}

		function applyAll(from, to) {
			for (var key in from) {
				to[key] = from[key]
			}
		}
	})();


})(typeof exports === 'undefined'? this['Discord'] = {} : exports);
