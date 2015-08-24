# node-discord
A low-level library for creating a Discord client from Node.js. **Now Discord API v2 compliant** [Come join the discussion!](https://discord.gg/0MvHMfHcTKVVmIGP)

### Warning:
I'd recommend updating frequently during the start of the project. I've also been told, by one of the developers, "we change it [The API] often", so I'll try to keep the updates regular.

# What you'll need
* An email and password from Discord. The client doesn't support anonymous joining.

# How to install
````javascript
npm install node-discord
````

# Example
````javascript
/*Variable area*/
var Discordbot = require('node-discord');
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

````

# Events
Events for the bot.

## ready
````javascript
bot.on('ready', function(rawEvent) { });
````
* **rawEvent** : The entire event received in JSON.


## message
````javascript
bot.on('message', function(user, userID, channelID, message, rawEvent) { });
````

* **user** : The user's name.
* **userID** : The user's ID.
* **channelID** : The ID of the room where the bot received the message.
* **message** : The chat message.
* **rawEvent** : The entire event received in JSON.

## presence
````javascript
bot.on('presence', function(user, userID, status, rawEvent) { });
````
* **user** : The user's name.
* **userID** : The user's ID.
* **status** : The user's status. Currently observed: ['online', 'idle', 'offline']
* **rawEvent** : The entire event received in JSON.

## debug
````javascript
bot.on('debug', function(rawEvent) { });
````
* **rawEvent** : In this section, it logs ANY event received from Discord.

## err
````javascript
bot.on('err', function(error) { });
````
* **error** : Logs the backend error (login, connection issues, etc).

## disconnected
````javascript
bot.on('disconnected', function() { });
````

# Properties

The client comes with a few properties to help your coding.
* **id** -String-
* **username** -String-
* **email** -String-
* **verified** -Bool-
* **discriminator** -String-
* **avatar** -String-
* **servers** -Object-
    * **[Server Choice]** -Object-
        * **channels** -Array-
        * **members** -Array-
        * **roles** -Array-
* **directMessages** -Object-
* **internals** -Object-
    * **token** -String-

# Methods
Methods that get the bot to do things.

## -Connection-

### connect()
Connects to Discord.
````javascript
bot.connect()
````

### disconnect()
Disconnects from Discord and emits the "Disconnected" event.
````javascript
bot.disconnect()
````
## -Bot Status-

### setUsername(-String-)
````javascript
bot.setUsername("Yuna");
````

## -Bot Content Actions-

### sendMessage(-Object-)
````javascript
bot.sendMessage({
	to: "userID/channelID",
	message: "Hello World",
	nonce: "80085" //Discord update for their clients, not required at all and can be left out. The backend will generate a random one if it is.
});

//Or, assuming the helper function is there, from the example

sendMessages(channelID, ["An", "Array", "Of", "Messages"]); 
//Will send them each as their own message
````
A recent Discord update now forbids you from Direct Messaging a user that does not share a server with you.

### uploadFile(-Object-)
````javascript
bot.uploadFile({
    channel: "channelID",
    file: "fillsquare.png"
});

//Or, assuming the helper function is there, from the example

sendFiles(channelID, ["fillsquare.png", "anotherpossibleimage.png"]);
//Will send them each as their own message/file
````

### editMessage(-Object-)
````javascript
bot.editMessage({
    channel: "channelID",
    messageID: rawEvent.d.id,
    message: "Your new message"
});
````

### deleteMessage(-Object-)
````javascript
bot.deleteMessage({
    channel: "channelID",
    messageID: rawEvent.d.id
});
````

## -Bot Management Actions-

##### The following are similar in syntax. 

* ### kick(-Object-)
* ### ban(-Object-)
* ### unban(-Object-)
* ### mute(-Object-)
* ### unmute(-Object-)
* ### deafen(-Object-)
* ### undeafen(-Object-)
````javascript
bot.kick({
    channel: "Server or Channel ID",
    target: "User ID"
});

//The rest are the same
````

## Special Thanks
* **[Chris92](https://github.com/Chris92de)**
    * Found out Discord's direct messaging method.
    
## Related projects
* [Discord.NET](https://github.com/RogueException/Discord.Net)
* [DiscordSharp](https://github.com/Luigifan/DiscordSharp)
* [discord.js](https://github.com/discord-js/discord.js)
* [Discord4J](https://github.com/knobody/Discord4J)
* [PyDiscord](https://github.com/Rapptz/pydiscord)

