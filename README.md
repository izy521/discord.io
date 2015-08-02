# node-discord
A library for creating a Discord client from Node.js. Currently allows sending and receiving text messages only. [Come join the discussion!](https://discord.gg/0MvHMfHcTKVVmIGP)

### Warning:
This is incredibly Alpha, and I'm not even completely sure how Discord works, but I just wanted to contribute. I'd recommend updating frequently during the start of the project. I've also been told, by one of the developers, "we change it [The API] often", so I'll try to keep the updates regular.

# What you'll need
* An email and password from Discord. The client doesn't support anonymous joining.
* The ID of the chat you wish the bot to default to.

# How to install

````javascript
npm install node-discord
````

# Example

````javascript
var DiscordClient = require('node-discord');
var bot = new DiscordClient({
    username: "email@prov.com",
    password: "SuperSecretPassword123",
    autorun: true
});
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
bot.on('message', function(user, userID, chatID, message, rawEvent) { });
````

* **user** : The user's name.
* **userID** : The user's ID.
* **chatID** : The ID of the room where the bot received the message.
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

# Methods
Methods that get the bot to do things.

## connect()
Connects to Discord.
````javascript
bot.connect()
````

## disconnect()
Disconnects from Discord and emits the "Disconnected" event.
````javascript
bot.disconnect()
````

## sendMessage(string/object)
Sends a message in one of two ways
````javascript
bot.sendMessage("Hello World"); //Will send the message to the default chat defined above.
bot.sendMessage({ //Will send the message to the room with this ID
	target: "Channel ID",
	message: "Hello World"
});
````

##### The following are similar in syntax. There's a function to resolve server IDs from the channel ID (assuming your bot has enough permissions to access the api, which it should, if you're doing anything below). So you can use the channel ID or server ID.

### kick(object), ban(object), unban(object), mute(object), unmute(object), deafen(object), undeafen(object)
````javascript
bot.kick({
    channel: "Server or Channel ID",
    target: "User ID"
});

//The rest are the same
````
