# discord.io
A low-level library for creating a Discord client from Node.js. [Come join the discussion!](https://discord.gg/0MvHMfHcTKVVmIGP)

### Installation
`npm install discord.io`

### [Documentation / Github Wiki](https://github.com/izy521/discord.io/wiki)

### Example
```javascript
var DiscordClient = require('discord.io');
var bot = new DiscordClient({
    autorun: true,
    email: "",
    password: "",
    //OR
    token: ""
});

bot.on('ready', function() {
    console.log(bot.username + " - (" + bot.id + ")");
});

bot.on('message', function(user, userID, channelID, message, rawEvent) {
    if (message === "ping") {
        bot.sendMessage({
            to: channelID,
            message: "pong"
        });
    }
});
```
