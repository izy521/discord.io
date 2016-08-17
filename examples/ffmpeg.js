var Discord = require('discord.io');
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
	var ffmpeg = spawn('ffmpeg' , [ //Or 'avconv', if you have it instead
		'-i', file,
		'-f', 's16le',
		'-ar', '48000',
		'-ac', '2', //If you want one audio channel (mono), you can omit `stereo: true` in `getAudioContext`
		'pipe:1'
	], {stdio: ['pipe', 'pipe', 'ignore']});
			
	ffmpeg.stdout.once('readable', function() {
		stream.send(ffmpeg.stdout);
	});
			
	ffmpeg.stdout.once('end', function() {
		//The file's done
	});
}
