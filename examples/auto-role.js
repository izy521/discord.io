var Discord = require('discord.io');
var drole = ""; /* roleid to be applied when someone joins the server */
var serverid = ""; /* your server id */
var bot = new Discord.Client({
  autorun: true, /* If false, you need to connect to the server using bot.connect(); */
  token: "" /* your discordapp token */
});

bot.on('ready', function() {
  console.log("Successfully connected: " + bot.username + " - (" + bot.id + ")");
});

bot.on('guildMemberAdd', function(callback) { /* Event called when someone joins the server */
  if(callback.guild_id == serverid)
    bot.addToRole({"serverID":serverid,"userID":callback.id,"roleID":drole},function(err,response) {
      if (err) console.error(err); /* Failed to apply role */
        /* some code */
  });
 });
