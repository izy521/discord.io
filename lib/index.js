var util = require("util");
var EventEmitter = require("events").EventEmitter;

function DiscordClient(options) {
	if (typeof(options) !== "object") {
		console.log("The options should be an object");
		return;
	}
	if (options.chats) {
		console.log("The chats array is no longer required (and no longer used). You may remove it on the next sign in.");
	}
	
	/*Variables*/
	var WebSocket = require('ws');
	var request = require('request');
	request = request.defaults({'gzip': true});
	var ws;
	
	var self = this;
	EventEmitter.call(self);
	
	/*Internal Functions*/
	function init() {
		self.servers = {};
		self.internals = {};
		self.directMessages = {};
		self.id = "";
		self.username = "";
		self.internals.token = "";
		
		var loginJSON = JSON.stringify({email: options.username, password: options.password});
		request.post({ //This is where the magic happens, if you're looking through it.
			headers: messageHeaders(loginJSON),
			url: "https://discordapp.com/api/auth/login",
			body: loginJSON
		}, function(err, res, body) {
			ws = new WebSocket("wss://discordapp.com/hub");
			if (!err && res.statusCode === 200) {
				body = JSON.parse(body);
				self.internals.token = body.token;
			
				var KAi;
				ws.on('message', function(data, flags) {
					var message = JSON.parse(data);
					
					//Events
					if (message.t) {			
						switch(message.t) {
							case "READY":
								self.username = message.d.user.username;
								self.id = message.d.user.id;
								getServerInfo(message.d.guilds, function() {
									getDirectMessages(message.d.private_channels);
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
								break;
						}
					}
					self.emit('debug', message);
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
		if (ws.readyState && ws.readyState == 1) {
			callback();
		} else {
			console.log("The bot is not connected yet");
			return false;
		}
	}
	function messageHeaders(inputJSON) {
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
			
			if (self.directMessages[target]) {
				request.post({
					headers: messageHeaders(messageJSON),
					url: "https://discordapp.com/api/channels/" + self.directMessages[target].id + "/messages",
					body: messageJSON
				});
				return;
			} else {
				for (var server in self.servers) {
					if (self.servers[server].members[target]) {
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
							
							self.directMessages[body.recipient.id] = body;
						});
                        
                        return;
					}
				}
			}
			
			request.post({
				headers: messageHeaders(messageJSON),
                url: "https://discordapp.com/api/channels/" + target + "/messages",
                body: messageJSON
            });
			
			return;
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
