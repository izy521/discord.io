/*Variable area*/
var Discordbot = require('discord.io');
var bot = new Discordbot({
	token: "",
	autorun: true
});

/*Event area*/

bot.on("ready", function(rawEvent) {
	console.log("Connected!");
	console.log("Logged in as: ");
	console.log(bot.username + " - (" + bot.id + ")");
});

bot.on("message", function(user, userID, channelID, message, rawEvent) {
	console.log(user + " - " + userID);
	console.log("in " + channelID);
	console.log(message);
	console.log("----------");
	
	if (message === "ping") {
		sendMessages(channelID, ["Pong"]); //Sending a message with our helper function
	} else if (message === "picture") {
		sendFiles(channelID, ["fillsquare.png"]); //Sending a file with our helper function
	}
});

bot.on("presence", function(user, userID, status, gameName, rawEvent) {
	/*console.log(user + " is now: " + status);*/
});

bot.on("debug", function(rawEvent) {
	/*console.log(rawEvent)*/ //Logs every event
});

bot.on("disconnected", function() {
	console.log("Bot disconnected");
	/*bot.connect()*/ //Auto reconnect
});

/*Function declaration area*/
function sendMessages(ID, messageArr, interval) {
	var callback, resArr = [], len = messageArr.length;
	typeof(arguments[2]) === 'function' ? callback = arguments[2] : callback = arguments[3];
	if (typeof(interval) !== 'number') interval = 1000;
	
	function _sendMessages() {
		setTimeout(function() {
			if (messageArr[0]) {
				bot.sendMessage({
					to: ID,
					message: messageArr.shift()
				}, function(err, res) {
					if (err) {
						resArr.push(err);
					} else {
						resArr.push(res);
					}
					if (resArr.length === len) if (typeof(callback) === 'function') callback(resArr);
				});
				_sendMessages();
			}
		}, interval);
	}
	_sendMessages();
}

function sendFiles(channelID, fileArr, interval) {
	var callback, resArr = [], len = fileArr.length;
	typeof(arguments[2]) === 'function' ? callback = arguments[2] : callback = arguments[3];
	if (typeof(interval) !== 'number') interval = 1000;
	
	function _sendFiles() {
		setTimeout(function() {
			if (fileArr[0]) {
				bot.uploadFile({
					to: channelID,
					file: fileArr.shift()
				}, function(err, res) {
					if (err) {
						resArr.push(err);
					} else {
						resArr.push(res);
					}
					if (resArr.length === len) if (typeof(callback) === 'function') callback(resArr);
				});
				_sendFiles();
			}
		}, interval);
	}
	_sendFiles();
}
