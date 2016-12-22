var Discord = require('discord.io');
var bot = new Discord.Client({
	autorun: true, /* If false, you need to connect to the server using bot.connect(); */
	token: "" /* your discordapp token */
});

var drole = ""; /* roleid to be applied when someone joins the server */
var serverid = ""; /* your server id */

bot.on('ready', function() {
console.log("Successfully connected: " + bot.username + " - (" + bot.id + ")");
});

bot.on('guildMemberAdd', function(callback) { /* Event called when someone joins the server */
  bot.addToRole({"serverID":serverid,"userID":callback["id"],"roleID":drole},function(err,response) {
   if (!err) return; /* Failed to apply role */ 
    /* some code */
  });
 });
