var util = require("util");
var EventEmitter = require("events").EventEmitter;

function DiscordClient(options) {
	if (typeof(options) !== "object") {
		console.log("The options should be an object");
		return;
	}
	if (!options.chats[0]) {
		console.log("There needs to be a default server."); 
		return;
	}
	if (options.token) {
		console.log("The token requirement is now removed, please use your username and password."); 
		return;
	}
	
	var WebSocket = require('ws');
	var request = require('request');
	request = request.defaults({'gzip': true});
	var ws;
	
	var self = this;
	EventEmitter.call(self);
	
	
	function init() {
		self.servers = {};
		self.internals = {};
		self.directMessages = {};
		self.id = "";
		self.username = "";
		self.internals.token = "";
		self.internals.sessionKey = "";
		
		var loginJSON = JSON.stringify({email: options.username, password: options.password});
		
		request.post({ //This is where the magic happens, if you're looking through it.
			headers: messageHeaders(loginJSON),
			url: "https://discordapp.com/api/auth/login",
			body: loginJSON
		}, function(err, res, body) {
			if (!err && res.statusCode === 200) {
				body = JSON.parse(body);
				self.internals.token = body.token;
				var sk = res.headers["set-cookie"][0];
				self.internals.sessionKey = sk.substring(sk.indexOf("=") + 1, sk.indexOf(";"));
			
				var KAi;
				ws = new WebSocket("wss://discordapp.com/hub");
				ws.on('message', function(data, flags) {
					var message = JSON.parse(data);
					
					//Events
					if (message.t) {			
						switch(message.t) {
							case "READY":
								self.username = message.d.user.username;
								self.id = message.d.user.id;
								getDirectMessages();
								getServerInfo(options.chats, function() {
									self.emit('ready', message);
								});
								break;
							case "MESSAGE_CREATE":
								self.emit('message', message.d.author.username, message.d.author.id, message.d.channel_id, message.d.content, message);
								break;
							case "PRESENCE_UPDATE":
								self.emit('presence', message.d.username, message.d.id, message.d.status, message);
								break;
							case "CHANNEL_CREATE":
								if (message.d.recipient) {
									if (!(message.d.recipient.id in self.directMessages)) {
										getDirectMessages();
									}
								}
						}
					}
					self.emit("debug", message);
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
							}
						}
					}
					ws.send(JSON.stringify(initObj));
			
					KAi = setInterval(function() {
						var keepAlive = { //Send KA data
							op: 1,
							d: new Date().getTime()
						};
						if (ws.readyState == 1) {
							ws.send(JSON.stringify(keepAlive));
						}
					},40000);
				});
				ws.on('close', function() {
					clearInterval(KAi);
					self.emit("disconnected");
				});
			} else {
				self.emit("err", body);
				return false;
			}
		});
	}
	function getServerInfo(servArr, callback) {
		servArr.forEach(function(serverID) { //Prepare for callback hell.
			request.get({ //Creating a server object for every server in the chats array.
				headers: messageHeaders(),
				url: "https://discordapp.com/api/guilds/" + serverID,
			}, function(err, res, serverBody) {
				serverBody = JSON.parse(serverBody);
				self.servers[serverID] = {};
				if (serverBody.id === undefined) {
					console.log("Unable to get server information for server " + serverID + ". Your bot may not have enough permissions.");
				} else {
					self.servers[serverID] = serverBody;
					self.servers[serverID].channels = {};
					self.servers[serverID].members = {};
					
					request.get({ //Populate the channels object
						headers: messageHeaders(),
						url: "https://discordapp.com/api/guilds/" + serverID + "/channels"
					}, function(err, res, channelBody) {
						channelBody = JSON.parse(channelBody);
						channelBody.forEach(function(channel, index) {
							self.servers[serverID].channels[channelBody[index].id] = channel;
						});
					});
					
					request.get({ //Populate the members object
						headers: messageHeaders(),
						url: "https://discordapp.com/api/guilds/" + serverID + "/members"
					}, function(err, res, memberBody) {
						memberBody = JSON.parse(memberBody);
						memberBody.forEach(function(member, index) {
							self.servers[serverID].members[memberBody[index].user.id] = member;
						});
					});
				}
				
			});
		});
		callback();
	}
	function getDirectMessages() {
		request.get({ //Populate directMessages object
			headers: messageHeaders(),
			url: "https://discordapp.com/api/users/" + self.id + "/channels",
		}, function(err, res, body) {
			body = JSON.parse(body);
			body.forEach(function(channel) {
				self.directMessages[channel.recipient.id] = channel;
			});
		});
	}
	function checkRS(callback) {
		if (ws.readyState && ws.readyState == 1) {
			callback();
		} else {
			console.log("The bot is not connected yet");
			return false;
		}
	}
	function messageHeaders(inputJSON, cookie) {
		var headers = {
			"accept": "*/*",
			"accept-encoding": "gzip, deflate",
			"accept-language": "en-US;q=0.8",
			"authorization": self.internals.token,
			"dnt": "1",
			"origin": "https://discordapp.com",
			"user-agent": "Nodebot (node-discord)"
		};
		if (inputJSON) {
			headers["content-type"] = "application/json";
			headers["content-length"] =  inputJSON.length.toString();
		}
		if (cookie) {
			headers["cookie"] = "session=" + cookie;
		}
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
				if (message[i + 1] === "@") break;
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
	self.connect = function() {
		if (ws.readyState != 0 || ws.readyState != 1) {
			init();
		}
	};
	self.disconnect = function() {
		ws.close();
	};
	
	self.sendMessage = function(input) {
		checkRS(function() {
			var target = input.to;
			var message = generateMessage(input.message);
			var messageJSON = JSON.stringify(message);
			
			for (var server in self.servers) {
				if (target in self.servers[server].members) {
					if (target in self.directMessages) {
						request.post({
							headers: messageHeaders(messageJSON),
							url: "https://discordapp.com/api/channels/" + self.directMessages[target].id + "/messages",
							body: messageJSON
						});
                        
                        return;
					} else {
						var initMessage = {
							recipient_id: target
						};
						request.post({
							headers: messageHeaders(JSON.stringify(initMessage)),
							url: "https://discordapp.com/api/users/" + self.id + "/channels",
							body: JSON.stringify(initMessage)
						}, function(err, res, body) {
							body = JSON.parse(body);
							request.post({
								headers: messageHeaders(messageJSON),
								url: "https://discordapp.com/api/channels/" + body.id + "/messages",
								body: messageJSON
							});
						});
                        
                        return;
					}
				} else if (target in self.servers[server].channels) {
					request.post({
						headers: messageHeaders(messageJSON),
						url: "https://discordapp.com/api/channels/" + target + "/messages",
						body: messageJSON
					});
                    
                    return;
				}
			}
            
            request.post({
				headers: messageHeaders(messageJSON),
                url: "https://discordapp.com/api/channels/" + target + "/messages",
                body: messageJSON
            });
			
		});
	};
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
				url: "https://discordapp.com/api/guilds/" + serverFromChanel(input.channel) + "/bans/" + input.target,
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
				headers: messageHeaders(messJSON),
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
				headers: messageHeaders(messJSON),
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
				headers: messageHeaders(messJSON),
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
				headers: messageHeaders(messJSON),
				body: messJSON
			});
		});
	};
	
	if (options.autorun && options.autorun === true) {
		init();
	}
	return self;
}

util.inherits(DiscordClient, EventEmitter);
module.exports = DiscordClient;
