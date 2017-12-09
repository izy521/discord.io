
<p align="center"><img src="http://i.imgur.com/kFzW7Uo.png"></p>
<h1 align="center">discord.io</h1>

A small, single-file, fully featured [Discordapp](https://discordapp.com) library for Node.js and browsers.

[![Discord](https://discordapp.com/api/guilds/66192955777486848/widget.png)](https://discord.gg/0MvHMfHcTKVVmIGP) [![NPM](https://img.shields.io/npm/v/discord.io.svg)](https://img.shields.io/npm/v/gh-badges.svg)

**With V5 gateway getting deprecated on Oct. 16, this is a first step at getting V6 to work.**

### Requirements
**Required**:
* **Node.js 0.10.x** or greater
* **Web Browser** if not using Node.js

**Optional**:
* **Audio**
    * **Node.js 0.12.x**
    * **ffmpeg/avconv** (needs to be added to PATH)
    
### [Documentation / Gitbooks](https://izy521.gitbooks.io/discord-io/content/)

### Getting Started:

#### Installing
**[Latest](https://github.com/Woor/discord.io/tree/gateway_v6)**
`npm install Woor/discord.io#gateway_v6`

#### Example
```javascript
var Discord = require('discord.io');

var bot = new Discord.Client({
    token: "",
    autorun: true
});

bot.on('ready', function() {
    console.log('Logged in as %s - %s\n', bot.username, bot.id);
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
