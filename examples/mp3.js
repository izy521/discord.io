/*A few users have been complaining that FFMPEG/AVCONV is cutting off their (messed up) audio MP3s incorrectly.
  This seems to happen on the later FFMPEG/AVCONV. To get around this, you can use the `lame` module from Node
  and send it to `discord.io`, as you would with spawning ffmpeg in your script. Or fix your MP3 files.*/
var Discord = require('discord.io');
var Lame = require('lame');
var fs = require('fs');
var spawn = require('child_process').spawn;
var bot = new Discord.Client({
	autorun: true,
	token: ""
});

var voiceChannelID = "",
	file = "";

bot.on('ready', function() {
    console.log(bot.username + " - (" + bot.id + ")");
	
	bot.joinVoiceChannel(voiceChannelID, function() {
		bot.getAudioContext({channel: voiceChannelID, stereo: true}, handleStream);
	});
});

function handleStream(error, stream) {
	playMP3(stream, file);
}

function playMP3(outputStream, inputFile) {
	var lame = new Lame.Decoder();
	var input = fs.createReadStream(inputFile);
	
	lame.once('readable', function() {
		outputStream.send(lame);
	});
	
	input.pipe(lame);
}
