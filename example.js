var Discordbot = require('node-discord');
var bot = new Discordbot({
	token: "", //Your bot's token
	chats: [""] //Chat room as the first string in an array. An array for future-proofing.
});

bot.on("ready", function() {
	console.log("Connected!");
	console.log("Logged in as: ");
	console.log(bot.username);
	console.log(bot.id);
	console.log("----------");
});

bot.on("message", function(user, userID, chatID, message, extras) {
	console.log(user + " - " + userID);
	console.log("in " + chatID);
	console.log(message);
	console.log("----------");
	
	if (message == "Hello, " + bot.username) {
		bot.sendMessage("Hello, " + user); //Sending a string message.
	}
	if (message == "echo") {
		bot.sendMessage({ //Sending an object message.
			target: chatID,
			message: message
		});
	}
});