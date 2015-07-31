# node-discord
A library for creating a Discord client from Node.js. Currently allows sending and receiving text messages only. [Come join the discussion!](https://discord.gg/0MvHMfHcTKVVmIGP)

### Warning:
This is incredibly Alpha, and I'm not even completely sure how Discord works, but I just wanted to contribute. I'd recommend updating frequently during the start of the project. I've also been told, by one of the developers, "we change it [The API] often", so I'll try to keep the updates regular.

# What you'll need
* A "token". Sign in with the bot's account once and pull it from your browser's localStorage.
* The ID of the chat you wish the bot to default to.

# How to install

````javascript
npm install node-discord
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

# Methods
Methods that get the bot to do things. Only one so far.

## sendMessage(argument)
````javascript
bot.sendMessage("Hello World"); //Will send the message to the default chat defined above.
bot.sendMessage({ //Will send the message to the room with this ID
	target: "ID of the room",
	message: "Hello World"
});
````
