var util = require("util");
var EventEmitter = require("events").EventEmitter;

function DiscordClient(options) {
	if (typeof(options) !== "object") throw new Error("The options should be an object");
	if (!options.chats[0]) throw new Error("There needs to be a default chat, for now.");
	
	var WebSocket = require('ws');
	var xhr = require('node-xhr');
	var ws = new WebSocket("wss://discordapp.com/hub");
	var self = this;
	EventEmitter.call(self);
	
	ws.on('message', function(data, flags) {
		var message = JSON.parse(data);
		
		if (message.t) {			
			switch(message.t) {
				case "READY":
					self.username = message.d.user.username;
					self.id = message.d.user.id;
					self.emit('ready', message);
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
				"token": options.token,
				"properties": {
					"$os":"Windows",
					"$browser":"Chrome",
					"$device":"",
					"$referrer":"",
					"$referring_domain":""
				}
			}
		}
		
		ws.send(JSON.stringify(initObj));		
	});
	setInterval(function() {
		var keepAlive = { //Send KA data
			op: 1,
			d: new Date().getTime()
		};
		ws.send(JSON.stringify(keepAlive));
	},40000);

	self.sendMessage = function(input) {
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
		
		xhr.post({
			url: "https://discordapp.com/api/channels/" + target + "/messages",
			headers: {
				"accept": "*/*",
				"accept-encoding": "gzip, deflate",
				"accept-language": "en-US;q=0.8",
				"authorization": options.token,
				"content-length": messJSON.length.toString(),
				"content-type": "application/json",
				"dnt": "1",
				"origin": "https://discordapp.com",
				"referer": "https://discordapp.com/channels/" + target + "/" + target,
				"user-agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.107 Safari/537.36"
			},
			body: messJSON
		});
	}
	
	return self;
}

util.inherits(DiscordClient, EventEmitter);
module.exports = DiscordClient;