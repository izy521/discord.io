var util = require("util");
var EventEmitter = require("events").EventEmitter;

function DiscordClient(options) {
	if (typeof(options) !== "object") {
		console.log("The options should be an object");
		return;
	}
	
	/*Variables*/
	var WebSocket = require('ws');
	var request = require('request');
	var udp = require('dgram');
	request = request.defaults({'gzip': true});
	var fs = require('fs');
	var ws;
	
	var self = this;
	EventEmitter.call(self);
	
	/*Internal Functions*/
	function init() {
		self.servers = {};
		self.internals = {};
		self.directMessages = {};
		
		var loginJSON = JSON.stringify({email: options.username, password: options.password});
		request.post({ //This is where the magic happens, if you're looking through it.
			headers: messageHeaders(),
			url: "https://discordapp.com/api/auth/login",
			body: loginJSON
		}, function(err, res, body) {
			if (!err && res.statusCode === 200) {
				body = JSON.parse(body);
				self.internals.token = body.token;
				
				request.get({
					headers: messageHeaders(),
					url: "https://discordapp.com/api/gateway"
				}, function(err, res, gatewayBody) {
					if (!err && res.statusCode === 200) {
						var KAi;
						gatewayBody = JSON.parse(gatewayBody);
						ws = new WebSocket(gatewayBody.url);
						
						ws.on('message', function(data, flags) {
							var message = JSON.parse(data);
					
							//Events
							if (message.t) {			
								switch(message.t) {
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
												d: new Date().getTime()
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
											if (self.servers[server].members[message.d.user.id]) {
												for (var userItem in message.d.user) {
													self.servers[server].members[message.d.user.id].user[userItem] = message.d.user[userItem];
												}
											} else {
												self.servers[server].members[message.d.user.id] = {};
												self.servers[server].members[message.d.user.id].user = {};
												for (var userItem in message.d.user) {
													self.servers[server].members[message.d.user.id].user[userItem] = message.d.user[userItem];
												}
											}
										}
										self.emit('presence', message.d.user.username, message.d.user.id, message.d.status, message);
										break;
									case "USER_UPDATE":
										if (message.d) {
											for (var userItem in message.d) {
												self[userItem] = message.d[userItem];
											}
										}
										break;
									case "CHANNEL_CREATE":
										if (message.d) {
											if (message.d.is_private === true) {
												self.directMessage[message.d.id] = {};
												for (var DMItem in message.d) {
													self.directMessage[message.d.id][DMItem] = message.d[DMItem];
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
									case "CHANNEL_DELETE":
										if (message.d) {
											delete self.servers[message.d.guild_id].channels[message.d.id];
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
									case "GUILD_MEMBER_REMOVE":
										if (message.d) {
											delete self.servers[message.d.guild_id].members[message.d.user.id];
										}
										break;
									case "GUILD_CREATE":
										if (message.d) {
											self.servers[message.d.id] = {};
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
								}
							}
							self.emit('debug', message);
						});
						ws.on('close', function() {
							clearInterval(KAi);
							self.emit("disconnected");
						});
						ws.on('error', function(err) {
							self.emit('err', err);
						});
						ws.on('open', function() {
							var initObj = {
								"op":2,
								"d": {
									"token": self.internals.token,
									"properties": {
										"$os":"Linux",
										"$browser":"",
										"$device":"Nodebot",
										"$referrer":"",
										"$referring_domain":""
									},
								"v": 2
								}
							}
							ws.send(JSON.stringify(initObj));
						});
						
					} else {
						self.emit("err", "Couldn't GET Gateway list: " + err);
						return false;
					}
				});			
			} else {
				self.emit("err", body);
				return false;
			}
		});
	}
	function getServerInfo(servArr, callback) {
		self.servers = {};
		for (var server=0; server<servArr.length; server++) { //This seems like a place where we'll need the speed, so I'm using a for loop instead of a forEach.
			self.servers[servArr[server].id] = {};
			
			/*for (var key in servArr[server]) {
				self.servers[servArr[server].id][key] = servArr[server][key];
			}*/
			for (var cpy=0, keys=Object.keys(servArr[server]), len=keys.length; cpy<len; cpy++) {
				self.servers[servArr[server].id][keys[cpy]] = servArr[server][keys[cpy]];
			}
			
			self.servers[servArr[server].id].channels = {}; //Turning these three into objects for easy search, instead of their original arrays
			self.servers[servArr[server].id].members = {};
			self.servers[servArr[server].id].roles = {};
			
			for (var channel=0; channel<servArr[server].channels.length; channel++) {
				self.servers[servArr[server].id].channels[servArr[server].channels[channel].id] = servArr[server].channels[channel];
			}
			
			for (var member=0; member<servArr[server].members.length; member++) {
				self.servers[servArr[server].id].members[servArr[server].members[member].user.id] = servArr[server].members[member];
			}
			
			for (var role=0; role<servArr[server].roles.length; role++) {
				self.servers[servArr[server].id].roles[servArr[server].roles[role].id] = servArr[server].roles[role];
			}
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
			"authorization": self.internals.token,
			"content-type": "application/json",
			"dnt": "1",
			"origin": "https://discordapp.com",
			"user-agent": "Nodebot (node-discord)"
		};
		return headers;
	}
	function serverFromChannel(channel) {
		for (var server in self.servers) {
			if (self.servers[server].channels[channel]) {
				return server;
			}
		}
	}
	function generateMessage(message) {
		var foundIDs = [];
		
		for (var i=0; i<message.length; i++) {
			if (message[i] === "@") {
				var username = message.substring(i + 1, message.indexOf(" ", i) > -1 ? message.indexOf(" ", i) : message.length);
				
				for (var server in self.servers) {
					for (var user in self.servers[server].members) {
						if (self.servers[server].members[user].user.username === username) { //Holy Bob
							foundIDs.push(user);
						}
					}
				}
			}
		}
		
		return {
			content: message,
			mentions: foundIDs
		}
	}
	
	/*Methods*/
	
	/*Connection*/
	self.connect = function() {
		if (ws) {
			if (ws.readyState != 0 || ws.readyState != 1) {
				init();
			}
		} else {
			init();
		}
	};
	self.disconnect = function() {
		ws.close();
	};
	/*Bot status*/
	self.setUsername = function(newUsername, callback) {
		checkRS(function() {
			var payload = {
				avatar: self.avatar,
				email: options.username,
				new_password: null,
				password: options.password,
				username: newUsername
			}
			request.patch({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/users/@me",
				body: JSON.stringify(payload),
			}, function(err, res, body) {
				if (!err) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					self.emit('err', "Unable to change name: " + err);
				}
			});
		});
	}
	/*Bot content actions*/
	self.uploadFile = function(input, callback) { /* After like 15 minutes of fighting with Request, turns out Discord doesn't allow multiple files in one message... despite having an attachments array.*/
		checkRS(function() {
			var channel = input.channel;
			var file = input.file;
			var formData = {
				file: fs.createReadStream(file)
			};
			request.post({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/channels/" + channel + "/messages",
				formData: formData
			}, function(err, res, body) {
				if (!err) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					self.emit('err', 'Unable to upload file: ' + err);
				}
			});
		});
	}
	self.sendMessage = function(input, callback) {
		checkRS(function() {
			var target = input.to;
			var message = generateMessage(input.message);
			if (!input.nonce) {
				message.nonce = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
			} else {
				message.nonce = input.nonce;
			}
			var messageJSON = JSON.stringify(message);
			
			if (self.directMessages[target]) {
				request.post({
					headers: messageHeaders(),
					url: "https://discordapp.com/api/channels/" + self.directMessages[target].id + "/messages",
					body: messageJSON
				}, function(err, res, mbody) {
					if (!err) {
						if (typeof(callback) === 'function') {
							callback(JSON.parse(mbody));
						}
					} else {
						self.emit('err', "Unable to send message: " + err);
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
							headers: messageHeaders(),
							url: "https://discordapp.com/api/users/" + self.id + "/channels",
							body: JSON.stringify(initMessage)
						}, function(err, res, body) {
							body = JSON.parse(body);
							request.post({
								headers: messageHeaders(),
								url: "https://discordapp.com/api/channels/" + body.id + "/messages",
								body: messageJSON
							}, function(err, res, mbody) {
								if (!err) {
									if (typeof(callback) === 'function') {
										callback(JSON.parse(mbody));
									}
								} else {
									self.emit('err', "Unable to send message: " + err);
								}
							});
							
							self.directMessages[body.recipient.id] = body;
						});
                        
                        return;
					}
				}
			}
			
			request.post({
				headers: messageHeaders(),
                url: "https://discordapp.com/api/channels/" + target + "/messages",
                body: messageJSON
            }, function(err, res, mbody) {
				if (!err) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(mbody));
					}
				} else {
					self.emit('err', "Unable to send message: " + err);
				}
			});
			return;
		});
	};
	self.getMessages = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			var limit;
			typeof(input.limit) !== 'number' ? limit = 50 : limit = input.limit
			
			request.get({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/channels/" + channelID + "/messages?limit=" + limit
			}, function(err, res, body) {
				if (!err) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					self.emit('err', "Unable to get recent messages: " + err);
				}
			});
		});
	}
	self.editMessage = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			var messageID = input.messageID;
			var message = generateMessage(input.message);
			var messageJSON = JSON.stringify(message);
		
			request.patch({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/channels/" + channelID + "/messages/" + messageID,
				body: messageJSON
			}, function(err, res, body) {
				if (!err) {
					if (typeof(callback) === 'function') {
						callback(JSON.parse(body));
					}
				} else {
					self.emit('err', "Unable to edit message: " + err);
				}
			});
		});
	}
	self.deleteMessage = function(input) {
		checkRS(function() {
			var channelID = input.channel;
			var messageID = input.messageID;
		
			request.del({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/channels/" + channelID + "/messages/" + messageID
			});
		});
	}
	self.fixMessage = function(message) {
		var mentions = message.match(/<@.*?>/g);
        if (mentions !== null) {
            for (var i=0; i<mentions.length; i++) {
                var UID = mentions[i].replace(/</g, "").replace(/@/g, "").replace(/>/,"");
				
				for (var server in self.servers) {
					if (self.servers[server].members[UID]) {
						message = message.replace(mentions[i], "@" + self.servers[server].members[UID].user.username);
						break;
					}
				}
            }
        }
        return message;
	}
	/*Bot management actions*/
	self.kick = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The kick method requires an object argument");
				return false;
			}
			
			request.del({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/members/" + input.target,
				headers: messageHeaders(),
			});
		});
	};
	self.ban = function(input) {
		checkRS(function() {
			if (typeof(input) !== "object") {
				console.log("The ban method requires an object argument");
				return false;
			}
			
			request.put({
				url: "https://discordapp.com/api/guilds/" + serverFromChannel(input.channel) + "/bans/" + input.target,
				headers: messageHeaders(),
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
				headers: messageHeaders()
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
				headers: messageHeaders(),
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
				headers: messageHeaders(),
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
				headers: messageHeaders(),
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
				headers: messageHeaders(),
				body: messJSON
			});
		});
	};
	
	self.createServer = function(input, callback) {
		checkRS(function() {
			var icon;
			var name = input.name;
			var region;
		
			input.icon === undefined ? icon = null : icon = input.icon;
		
			request.get({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/voice/regions",
			}, function(err, res, body) {
				if (!err) {
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
							headers: messageHeaders(),
							url: "https://discordapp.com/api/guilds",
							body: JSON.stringify(newServer);
						}, function(err, res, sbody) {
							if (!err) {
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
	}
	self.deleteServer = function(input, callback) {
		checkRS(function() {
			var serverID = input.server;
			
			request.del({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/guilds/" + serverID
			}, function(err, res, body) {
				if (!err) {
					body = JSON.parse(body);
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
				headers: messageHeaders(),
				url: "https://discordapp.com/api/guilds/" + serverID + "/channels",
				body: JSON.stringify(newChannel)
			}, function(err, res, body) {
				if (!err) {
					body = JSON.parse(body);
					if (typeof(callback) === 'function') {
						callback(body);
					}
				}
			});
		});
	}
	self.deleteChannel = function(input, callback) {
		checkRS(function() {
			var channelID = input.channel;
			
			request.del({
				headers: messageHeaders(),
				url: "https://discordapp.com/api/channels/" + channelID,
			}, function(err, res, body) {
				if (!err) {
					body = JSON.parse(body);
					if (typeof(callback) === 'function') {
						callback(body);
					}
				}
			});
		});
	}
	/*Misc*/
	self.serverFromChannel = function(channel) {
		return serverFromChannel(channel);
	}
	
	if (options.autorun && options.autorun === true) {
		init();
	}
	return self;
}

util.inherits(DiscordClient, EventEmitter);
module.exports = DiscordClient;
