# node-discord
A library for creating a Discord client from Node.js. Currently allows sending and receiving text messages only. (This is incredibly Alpha, and I'm not even completely sure how Discord works, but I just wanted to contribute.)

# What you'll need
* A "token". Sign in with the bot's account once and pull it from your browser's localStorage.
* The ID of the chat you wish the bot to default to.

# How to install

````javascript
npm install node-discord
````

# Events
Events for the bot, currently only two are used:
## ready
````javascript
bot.on('ready', function() { });
````

## message

````javascript
bot.on('message', function(user, userID, chatID, message, extras) { });
````

* **user** : The user's name.
* **userID** : The user's ID.
* **chatID** : The ID of the room where the bot received the message.
* **message** : The message.
* **extras** : Not currently in use, but will contain all the other message data received by the bot.
