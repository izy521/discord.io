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
	var ws;
	
	var self = this;
	EventEmitter.call(self);
	
	
	function init() {
		self.servers = {};
		self.internals = {};
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
								getServers(options.chats, function() {
									self.emit('ready', message);
								});
								break;
							case "MESSAGE_CREATE":
								self.emit('message', message.d.author.username, message.d.author.id, message.d.channel_id, message.d.content, message);
								break;
							case "PRESENCE_UPDATE":
								self.emit('presence', message.d.username, message.d.id, message.d.status, message);
								break;
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
	function getServers(servArr, callback) {
		servArr.forEach(function(serverID) { //Prepare for callback hell.
			self.servers[serverID] = {};
			request.get({
				headers: messageHeaders(),
				url: "http://discordapp.com/api/guilds/" + serverID + "/channels",
			}, function(err, res, body) {
				body = JSON.parse(body);
				try {
					body.forEach(function(channel) {
						self.servers[serverID][channel.id] = channel;
					});
					callback();
				} catch(e) {
					console.log("Your bot was unable to see the list of channels. It may need more permissions. This will limit its functionality");
					callback();
				}
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
			if (self.servers[server][channel]) {
				return server;
			}
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
			//When users PM each other, it seems to make a new chat rather than just use the user IDs. I'll have to figure that one out later.
			var defaultTarget = options.chats[0];
			var target;
			var messObj;
		
			if (typeof(input) === "object") {
				target = input.target || defaultTarget;
				messObj = {
					content: input.message,
					mentions: []
				};
			} else if (typeof(input) === "string") {
				target = defaultTarget;
				messObj = {
					content: input,
					mentions: []
				}
			} else {
				return "The input needs to be a string (only message), or object (containing a target and message key)";
			}
			var messJSON = JSON.stringify(messObj);
		
			request.post({
				headers: messageHeaders(messJSON),
				url: "https://discordapp.com/api/channels/" + target + "/messages",
				body: messJSON
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