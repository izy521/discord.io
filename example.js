/*Variable area*/
var Discordbot = require('discord.io');
var bot = new Discordbot({
	username: "",
	password: "",
	autorun: true
});

/*Event area*/
bot.on("err", function(error) {
	console.log(error)
});

bot.on("ready", function(rawEvent) {
	console.log("Connected!");
	console.log("Logged in as: ");
	console.log(bot.username);
	console.log(bot.id);
	console.log("----------");
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

bot.on("presence", function(user, userID, status, rawEvent) {
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
	if (!interval) interval = 250;
	
	var messInt = setInterval(function() {
		if (messageArr.length > 0) {
			bot.sendMessage({
				to: ID,
				message: messageArr[0]
			});
			messageArr.splice(0,1);
		} else {
			clearInterval(messInt);
		}
	}, interval);
}

function sendFiles(channelID, fileArr, interval) {
	if (!interval) interval = 500;
	
	var fileInt = setInterval(function() {
		if (fileArr.length > 0) {
			bot.uploadFile({
				channel: channelID,
				file: fileArr[0]
			});
			fileArr.splice(0,1);
		} else {
			clearInterval(fileInt);
		}
	}, interval);
}
