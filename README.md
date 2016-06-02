# discord.io
![alt tag](https://raw.githubusercontent.com/adryd/discord.io/logo.png/)
A small, single-file, fully featured [Discordapp](https://discordapp.com) library for Node.js.

[![Discord](https://discordapp.com/api/servers/66192955777486848/widget.png?style=button)](https://discord.gg/0MvHMfHcTKVVmIGP) [![NPM](https://img.shields.io/npm/v/discord.io.svg)](https://img.shields.io/npm/v/gh-badges.svg)

### Installation
`npm install discord.io`

### [Documentation / Github Wiki](https://github.com/izy521/discord.io/wiki)
[WIP Documentation / Gitbooks](https://www.gitbook.com/book/izy521/discord-io/details)

### Example
```javascript
var Discord = require('discord.io');
var bot = new Discord.Client({
    token: "",
    autorun: true
});

bot.on('ready', function() {
    console.log(bot.username + " - (" + bot.id + ")");
});

bot.on('message', function(user, userID, channelID, message, event) {
    if (message === "ping") {
        bot.sendMessage({
            to: channelID,
            message: "pong"
        });
    }
});
```
