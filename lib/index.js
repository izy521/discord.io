/*jslint node: true */
/*jslint white: true */
"use strict";

/*Spaces so these don't look retarded in GitHub*/
var util        = require('util'),
    fs          = require('fs'),
    udp         = require('dgram'),
    zlib        = require('zlib'),
    dns         = require('dns'),
    crypto      = require('crypto'),
    bn          = require('path').basename,
    EE          = require('events').EventEmitter,
	requesters  = {
		http:     require('http'),
		https:    require('https')
	},
	ChildProc   = require('child_process'),
	URL         = require('url'),
	/* NPM Modules (node-opus is required later) */
	Websocket   = require('ws'),
	nacl        = require('tweetnacl');

var CURRENT_VERSION = "1.x.x",
	UPDATED_VERSION,
	GATEWAY_VERSION = 5;

/* --- Version Check --- */
try {
	CURRENT_VERSION = require('../package.json').version;
	APIRequest('get', "https://registry.npmjs.org/discord.io", function(err, res) {
		if (err) return;
		try { UPDATED_VERSION = res.body['dist-tags'].latest; } catch(e) {return;}
		if (CURRENT_VERSION !== UPDATED_VERSION) console.log("[WARNING]: Your library (" + CURRENT_VERSION + ") is out of date. Please update discord.io to " + UPDATED_VERSION + ".");
	});
} catch(e) {}

/* --- Classes --- */
function DiscordClient(options) {
	var self = this;
	EE.call(this);
	if (!options || options.constructor.name !== 'Object') return console.log("An Object is required to create the discord.io client.");
	if (typeof(options.messageCacheLimit) !== 'number') options.messageCacheLimit = 50;

	/*Variables*/
	[
		["_GLOBAL_REQUEST_DELAY", 0],
		["_messageCacheLimit", options.messageCacheLimit],
		["_mainKeepAlive", null],
		["_connecting", false],
		["_messageCache", {}],
		["_vChannels", {}],
		["_uIDToDM", {}],
		["_ws", null],
		["_req", req]
	].forEach(function(t) {
		Object.defineProperty(this, t[0], {
			configurable: true,
			writable: true,
			value: t[1]
		});
	}, this);

	this.presenceStatus = "offline";
	this.connected = false;
	this.inviteURL = null;
	this.connect = this.connect.bind(this, options);

	if (options.autorun && options.autorun === true) {
		this.connect();
	}

	/*Utils*/
	function req(method, url) {
		setTimeout(APIRequest.bind.apply(APIRequest, [self, arguments[0], arguments[1], arguments[2], arguments[3]]), self._GLOBAL_REQUEST_DELAY);
	}
}
function DiscordOAuth(opts, cb) {
	if (!opts.token) return
	//Will finish this later, perhaps. Is it even needed? Bleh
}
util.inherits(DiscordClient, EE);

/* - DiscordClient - Methods - */
var DCP = DiscordClient.prototype;
/* - DiscordClient - Methods - Connection - */
DCP.connect = function() {
	if (this.connected === false && this._connecting === false) return init(this, arguments[0]);
};
DCP.disconnect = function() {
	this._ws.close();
};
/* - DiscordClient - Methods - Status - */
DCP.editUserInfo = function(input, callback) {
	if (input.avatar) input.avatar = "data:image/jpg;base64," + input.avatar;

	var payload = {
		avatar: this.avatar,
		email: this.email,
		new_password: null,
		password: null,
		username: this.username
	},
		plArr = Object.keys(payload);

	for (var key in input) {
		if (plArr.indexOf(key) > -1) {
			payload[key] = input[key];
		} else {
			console.log(key + ' is not a valid key. Valid keys are: ');
			return console.log(plArr);
		}
	}
	this._req('patch', "https://discordapp.com/api/users/@me", payload, function(err, res) {
		handleResCB("Unable to edit user information", err, res, callback);
	});
};
DCP.setPresence = function(input) {
	var payload = {
		op: 3,
		d: {
			idle_since: input.idle_since ? input.idle_since : null,
			//game: input.game ? {name: String(input.game)} : null
			game: {
				name: input.game ? String(input.game) : null,
				type: input.type ? Number(input.type) : null,
				url: input.url ? String(input.url) : null
			}
		}
	};
	
	send(this._ws, payload);

	if (payload.d.idle_since === null) {
		this.presenceStatus = 'online';
		return;
	}
	this.presenceStatus = 'idle';
};
DCP.getOauthInfo = function(callback) {
	this._req('get', "https://discordapp.com/api/oauth2/applications/@me", function(err, res) {
		handleResCB("Error GETing OAuth information", err, res, callback);
	});
};
DCP.getAccountSettings = function(callback) {
	this._req('get', "https://discordapp.com/api/users/@me/settings", function(err, res) {
		handleResCB("Error GETing client settings", err, res, callback);
	});
};

/* - DiscordClient - Methods - Content - */
DCP.uploadFile = function(input, callback) {
	/* After like 15 minutes of fighting with Request, turns out Discord doesn't allow multiple files in one message...
	despite having an attachments array.*/
	var file,
		client = this, multi = new Multipart(),	message = {}, 
		isBuffer = (input.file instanceof Buffer), isString = (typeof(input.file) === 'string');
	if (!isBuffer && !isString) return console.log("uploadFile requires a String or Buffer as the 'file' value");
	if (isBuffer) if (input.filename) file = input.file; else return console.log("uploadFile requires a 'filename' value to be set if using a Buffer");
	if (isString) try { file = fs.readFileSync(input.file); } catch(e) { return handleErrCB("File does not exist: " + input.file, callback); }
	if (input.message) message = generateMessage(input.to, input.message)

	multi.append(["content", message.content || ""]);
	multi.append(["mentions", ""]);
	multi.append(["tts", false]);
	multi.append(["nonce", message.nonce || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) ]);
	multi.append(["file", file, input.filename || bn(input.file)]);
	multi.finalize();

	resolveID(client, input.to, function(channelID) {
		client._req('post', "https://discordapp.com/api/channels/" + channelID + "/messages", multi, function(err, res) {
			handleResCB("Unable to upload file", err, res, callback);
		});
	});
};
DCP.sendMessage = function(input, callback) {
	var client = this, time, message = generateMessage(input.to, input.message);
	message.tts = input.tts === true ? true : false;
	message.nonce = input.nonce || message.nonce;

	if (input.typing && input.typing === true) {
		time = (input.message.length * 0.12) * 1000;
		return emulateTyping(time);
	}

	_sendMessage(message, input.to);

	function emulateTyping(time) {
		if (time <= 0) return _sendMessage(message, input.to);
		if (time > 5000) time = time - 5000; else time = time - time;

		client.simulateTyping(input.to, function() {
			setTimeout(function() {
				emulateTyping(time);
			}, time);
		});
	}

	function _sendMessage(message, target) {
		resolveID(client, target, function(channelID) {
			client._req('post', "https://discordapp.com/api/channels/" + channelID + "/messages", message, function(err, res) {
				handleResCB("Unable to send messages", err, res, callback);
			});
		});
	}
};
DCP.getMessage = function(input, callback) {
	this._req('get', "https://discordapp.com/api/channels/" + input.channelID + "/messages/" + input.messageID, function(err, res) {
		handleResCB("Unable to get message", err, res, callback);
	});
};
DCP.getMessages = function(input, callback) {
	var qs = {}, channelID = input.channelID || input.channel;
	qs.limit = (typeof(input.limit) !== 'number' ? 50 : input.limit);
	if (input.before) qs.before = input.before;
	if (input.after) qs.after = input.after;

	this._req('get', "https://discordapp.com/api/channels/" + channelID + "/messages?" + qstringify(qs), function(err, res) {
		handleResCB("Unable to get messages", err, res, callback);
	});
};
DCP.editMessage = function(input, callback) {
	var channelID = input.channelID || input.channel;
	this._req('patch', "https://discordapp.com/api/channels/" + channelID + "/messages/" + input.messageID, generateMessage(channelID, input.message), function(err, res) {
		handleResCB("Unable to edit message", err, res, callback);
	});
};
DCP.deleteMessage = function(input, callback) {
	var channelID = input.channelID || input.channel;
	this._req('delete', "https://discordapp.com/api/channels/" + channelID + "/messages/" + input.messageID, function(err, res) {
		handleResCB("Unable to delete message", err, res, callback);
	});
};
DCP.deleteMessages = function(input, callback) {
	this._req('post', "https://discordapp.com/api/channels/" + input.channelID + "/messages/bulk_delete", {messages: input.messageIDs.slice(0, 100)}, function(err, res) {
		handleResCB("Unable to delete messages", err, res, callback);
	});
};
DCP.pinMessage = function(input, callback) {
	this._req('put', "https://discordapp.com/api/channels/" + input.channelID + "/pins/" + input.messageID, function(err, res) {
		handleResCB("Unable to pin message", err, res, callback);
	});
};
DCP.getPinnedMessages = function(input, callback) {
	this._req('get', "https://discordapp.com/api/channels/" + input.channelID + "/pins", function(err, res) {
		handleResCB("Unable to get pinned messages", err, res, callback);
	});
};
DCP.deletePinnedMessage = function(input, callback) {
	this._req('delete', "https://discordapp.com/api/channels/" + input.channelID + "/pins/" + input.messageID, function(err, res) {
		handleResCB("Unable to delete pinned message", err, res, callback);
	});
};
DCP.simulateTyping = function(channelID, callback) {
	this._req('post', "https://discordapp.com/api/channels/" + channelID + "/typing", function(err, res) {
		handleResCB("Unable to simulate typing", err, res, callback);
	});
};
DCP.fixMessage = function(message) {
	var client = this;
	return message.replace(/<@&(\d*)>|<@!(\d*)>|<@(\d*)>|<#(\d*)>/g, function(match, RID, NID, UID, CID) {
		var k, i;
		if (UID || CID) {
			if (client.users[UID]) return "@" + client.users[UID].username;
			if (client.channels[CID]) return "#" + client.channels[CID].name;
		}
		if (RID || NID) {
			k = Object.keys(client.servers);
			for (i=0; i<k.length; i++) {
				if (client.servers[k[i]].roles[RID]) return "@" + client.servers[k[i]].roles[RID].name;
				if (client.servers[k[i]].members[NID]) return "@" + client.servers[k[i]].members[NID].nick;
			}
		}
	});
};

/* - DiscordClient - Methods - Server Management - */
DCP.kick = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('delete', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, function(err, res) {
		handleResCB("Could not kick user", err, res, callback);
	});
};
DCP.ban = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	if (input.lastDays) {
		input.lastDays = Number(input.lastDays);
		input.lastDays = Math.min(input.lastDays, 7);
		input.lastDays = Math.max(input.lastDays, 1);
	}

	this._req('put', "https://discordapp.com/api/guilds/" + serverID + "/bans/" + userID + (input.lastDays ? "?delete-message-days=" + input.lastDays : ""), function(err, res) {
		handleResCB("Could not ban user", err, res, callback);
	});
};
DCP.unban = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('delete', "https://discordapp.com/api/guilds/" + serverID + "/bans/" + userID, function(err, res) {
		handleResCB("Could not unban user", err, res, callback);
	});
};
DCP.moveUserTo = function(input, callback) {
	var serverID = input.serverID || input.server;
	var userID = input.userID || input.target;
	var channelID = input.channelID || input.channel;
	this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {channel_id: channelID}, function(err, res) {
		handleResCB("Could not move the user", err, res, callback);
	});
};
DCP.mute = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {mute: true}, function(err, res) {
		handleResCB("Could not mute user", err, res, callback);
	});
};
DCP.unmute = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {mute: false}, function(err, res) {
		handleResCB("Could not unmute user", err, res, callback);
	});
};
DCP.deafen = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {deaf: true}, function(err, res) {
		handleResCB("Could not deafen user", err, res, callback);
	});
};
DCP.undeafen = function(input, callback) {
	var serverID = input.serverID || input.channel ? this.channels[input.channel].guild_id : null;
	var userID = input.userID || input.target;
	this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {deaf: false}, function(err, res) {
		handleResCB("Could not undeafen user", err, res, callback);
	});
};

/*Bot server management actions*/
DCP.createServer = function(input, callback) {
	var payload, client = this;
	if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
	payload = {icon: null, name: null, region: null};
	for (var key in input) {
		if (Object.keys(payload).indexOf(key) === -1) continue;
		payload[key] = input[key];
	}
	client._req('post', "https://discordapp.com/api/guilds", payload, function(err, res) {
		try {
			client.servers[res.body.id] = {};
			for (var skey in res.body) client.servers[res.body.id][skey] = res.body[skey];
		} catch(e) {}
		handleResCB("Could not create server", err, res, callback);
	});
};
DCP.editServer = function(input, callback) {
	var payload, regions, serverID = input.serverID || input.server, server, client = this;
	if (input.icon) input.icon = "data:image/jpg;base64," + input.icon;
	if (!client.servers[serverID]) return handleErrCB(("Server " + serverID + " not found."), callback);
	server = client.servers[serverID];
	payload = {
		name: server.name,
		icon: server.icon,
		region: server.region,
		afk_channel_id: server.afk_channel_id,
		afk_timeout: server.afk_timeout
	};

	for (var key in input) {
		if (Object.keys(payload).indexOf(key) === -1) continue;
		if (key === 'region') {
			if (regions && regions.indexOf(input[key]) > -1) payload[key] = input[key];
			continue;
		}
		if (key === 'afk_channel_id') {
			if (server.channels[input[key]] && server.channels[input[key]].type === 'voice') payload[key] = input[key];
			continue;
		}
		if (key === 'afk_timeout') {
			if ([60, 300, 900, 1800, 3600].indexOf(Number(input[key])) > -1) payload[key] = input[key];
			continue;
		}
		payload[key] = input[key];
	}

	client._req('patch', "https://discordapp.com/api/guilds/" + server, payload, function(err, res) {
		handleResCB("Unable to edit server", err, res, callback);
	});
};
DCP.leaveServer = function(serverID, callback) {
	this._req('delete', "https://discordapp.com/api/users/@me/guilds/" + serverID, function(err, res) {
		handleResCB("Could not leave server", err, res, callback);
	});
};
DCP.deleteServer = function(serverID, callback) {
	this._req('delete', "https://discordapp.com/api/guilds/" + serverID, function(err, res) {
		handleResCB("Could not delete server", err, res, callback);
	});
};
DCP.transferOwnership = function(input, callback) {
	this._req("patch", "https://discordapp.com/api/guilds/"+ input.serverID, {owner_id: input.userID}, function(err, res) {
		handleResCB("Could not transfer server ownership", err, res, callback);
	});
};

DCP.acceptInvite = function(inviteCode, callback) {
	if (this.bot) {
		console.log("This account is a 'bot' type account, and cannot use 'acceptInvite'. Please use the client's inviteURL property instead.")
		return handleErrCB("This account is a 'bot' type account, and cannot use 'acceptInvite'. Please use the client's inviteURL property instead.", callback);
	}
	var joinedServers = Object.keys(client.servers), client = this;
	this._req('post', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
		try {
			//Try to create the server with the small amount of data
			//that Discord provides directly from the HTTP response
			//since the websocket event may take a second to show.
			if (!client.servers[res.body.guild.id]) {
				client.servers[res.body.guild.id] = res.body.guild;
				client.servers[res.body.guild.id].channels = {};
				client.servers[res.body.guild.id].channels[res.body.channel.id] = res.body.channel;
			} else {
				if (joinedServers.indexOf(res.body.guild.id) > -1) {
					return handleErrCB("Already joined server: " + res.body.guild.id, callback);
				}
			}
		} catch(e) {}
		handleResCB(("The invite code provided " + inviteCode + " is incorrect."), err, res, callback);
	});
};
DCP.createInvite = function(input, callback) {
	var payload, channelID = input.channelID || input.channel, client = this;
	if (Object.keys(input).length === 1 && 'channel' in input) {
		payload = {
			validate: client.internals.lastInviteCode || null
		};
	} else {
		payload = {
			max_age: 0,
			max_users: 0,
			temporary: false,
		};
	}

	for (var key in input) {
		if (Object.keys(payload).indexOf(key) === -1) continue;
		payload[key] = input[key];
	}

	this._req('post', "https://discordapp.com/api/channels/"+ channelID + "/invites", payload, function(err, res) {
		try {client.internals.lastInviteCode = res.body.code;} catch(e) {}
		handleResCB('Unable to create invite', err, res, callback);
	});
};
DCP.deleteInvite = function(inviteCode, callback) {
	this._req('delete', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
		handleResCB('Unable to delete invite', err, res, callback);
	});
};
DCP.queryInvite = function(inviteCode, callback) {
	this._req('get', "https://discordapp.com/api/invite/" + inviteCode, function(err, res) {
		handleResCB('Unable to get information about invite', err, res, callback);
	});
};
DCP.listServerInvites = function(serverID, callback) {
	this._req('get', "https://discordapp.com/api/guilds/" + serverID + "/invites", function(err, res) {
		handleResCB('Unable to get invite list for server' + serverID, err, res, callback);
	});
};
DCP.listChannelInvites = function(channelID, callback) {
	this._req('get', "https://discordapp.com/api/channels/" + channelID + "/invites", function(err, res) {
		handleResCB('Unable to get invite list for channel' + channelID, err, res, callback);
	});
};

DCP.createChannel = function(input, callback) {
	var client = this, serverID = input.serverID || input.server, payload = {
		name: input.name,
		type: (['text', 'voice'].indexOf(input.type) === -1) ? 'text' : input.type
	};

	this._req('post', "https://discordapp.com/api/guilds/" + serverID + "/channels", payload, function(err, res) {
		try {
			var serverID = res.body.guild_id;
			var channelID = res.body.id;

			client.channels[channelID] = new Channel( client.servers[serverID], res.body );
		} catch(e) {}
		handleResCB('Unable to create channel', err, res, callback);
	});
};
DCP.createDMChannel = function(userID, callback) {
	var client = this;
	this._req('post', "https://discordapp.com/api/users/" + client.id + "/channels", {recipient_id: userID}, function(err, res) {
		if (!err) client._uIDToDM[res.body.recipient.id] = res.body.id;
		handleResCB("Unable to create DM Channel", err, res, callback);
	});
};
DCP.deleteChannel = function(channelID, callback) {
	this._req('delete', "https://discordapp.com/api/channels/" + channelID, function(err, res) {
		handleResCB("Unable to delete channel", err, res, callback);
	});
};
DCP.editChannelInfo = function(input, callback) {
	var channelID = input.channelID || input.channel, channel, payload;

	try {
		channel = this.channels[input.channel];
		payload = {
			name: channel.name,
			topic: channel.topic,
			bitrate: channel.bitrate,
			position: channel.position,
			user_limit: channel.user_limit
		};

		for (var key in input) {
			if (Object.keys(payload).indexOf(key) === -1) continue;
			if (key === 'bitrate') {
				input.bitrate = Number(input.bitrate);
				input.bitrate = Math.max(input.bitrate, 8000);
				input.bitrate = Math.min(input.bitrate, 96000);
			}
			payload[key] = input[key];
		}

		this._req('patch', "https://discordapp.com/api/channels/" + channelID, payload, function(err, res) {
			handleResCB("Unable to edit channel", err, res, callback);
		});
	} catch(e) {return handleErrCB(e, callback);}
};

DCP.createRole = function(serverID, callback) {
	var client = this;
	this._req('post', "https://discordapp.com/api/guilds/" + serverID + "/roles", function(err, res) {
		try {
			client.servers[serverID].roles[res.body.id] = new Role(res.body);
		} catch(e) {}
		handleResCB("Unable to create role", err, res, callback);
	});
};
DCP.editRole = function(input, callback) {
	var serverID = input.serverID || input.server, roleID = input.roleID || input.role, role, payload;
	try {
		role = new Role(this.servers[input.server].roles[input.role]);
		payload = {
			name: role.name,
			permissions: role.permissions,
			color: role.color,
			hoist: role.hoist
		};

		for (var key in input) {
			if (Object.keys(payload).indexOf(key) === -1) continue;
			if (key === 'permissions') {
				for (var perm in input[key]) {
					role[perm] = input[key][perm];
					payload.permissions = role.permissions;
				}
				continue;
			}
			if (key === 'color') {
				if (String(input[key])[0] === '#') payload.color = parseInt(String(input[key]).replace('#', '0x'), 16);
				if (role.color_values[input[key]]) payload.color = role.color_values[input[key]];
				continue;
			}
			payload[key] = input[key];
		}
		this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/roles/" + roleID, payload, function(err, res) {
			handleResCB("Unable to edit role", err, res, callback);
		});
	} catch(e) {return handleErrCB(e, callback);}
};
DCP.deleteRole = function(input, callback) {
	var serverID = input.serverID || input.server, roleID = input.roleID || input.role;
	this._req('delete', "https://discordapp.com/api/guilds/" + serverID + "/roles/" + serverID, function(err, res) {
		handleResCB("Could not remove role", err, res, callback);
	});
};

DCP.addToRole = function(input, callback) {
	var serverID = input.serverID || input.server, roleID = input.roleID || input.role, userID = input.userID || input.user, roles;
	try {
		roles = copy(this.servers[serverID].members[userID].roles);
		if (roles.indexOf(roleID) > -1) return handleErrCB((userID + " already has the role " + roleID), callback);
		roles.push(roleID);
		this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {roles: roles}, function(err, res) {
			handleResCB("Could not add role", err, res, callback);
		});
	} catch(e) {return handleErrCB(e, callback);}
};
DCP.removeFromRole = function(input, callback) {
	var serverID = input.serverID || input.server, roleID = input.roleID || input.role, userID = input.userID || input.user, roles;
	try {
		roles = copy(this.servers[serverID].members[userID].roles);
		if (roles.indexOf(roleID) === -1) return handleErrCB(("Role " + roleID + " not found for user " + userID), callback);
		roles.splice(roles.indexOf(roleID), 1);
		this._req('patch', "https://discordapp.com/api/guilds/" + serverID + "/members/" + userID, {roles: roles}, function(err, res) {
			handleResCB("Could not remove role", err, res, callback);
		});
	} catch(e) {return handleErrCB(e, callback);}
};

DCP.editNickname = function(input, callback) {
	var payload = {nick: String( input.nick ? input.nick : "" )};
	var url = input.userID === this.id ?
		'https://discordapp.com/api/guilds/' + input.serverID + '/members/@me/nick':
		'https://discordapp.com/api/guilds/' + input.serverID + '/members/' + input.userID;

	this._req('patch', url, payload, function(err, res) {
		handleResCB("Could not change nickname", err, res, callback);
	});
};
DCP.editNote = function(input, callback) {
	this._req('put', "https://discordapp.com/api/users/@me/notes/" + input.userID, {note: input.note}, function(err, res) {
		handleResCB("Could not edit note", err, res, callback);
	});
};

DCP.getMembers = function(input, callback) {
	var qs = {};
	qs.limit = (typeof(input.limit) !== 'number' ? 50 : input.limit);
	if (input.after) qs.after = input.after;

	this._req('get', "https://discordapp.com/api/guilds/" + input.serverID + "/members?" + qstringify(qs), function(err, res) {
		handleResCB("Could not get members", err, res, callback);
	});
};
DCP.listBans = function(serverID, callback) {
	this._req('get', 'https://discordapp.com/api/guilds/' + serverID + '/bans', function(err, res) {
		handleResCB("Could not get ban list", err, res, callback);
	});
};

/* --- Voice --- */
DCP.joinVoiceChannel = function(channelID, callback) {
	var serverID, init, handler, client = this;
	try {serverID = client.channels[channelID].guild_id;} catch(e) {}
	if (!serverID) return handleErrCB(("Cannot find the server related to the channel provided: " + channelID), callback);
	if (client.servers[serverID].channels[channelID].type !== 'voice') return handleErrCB(("Selected channel is not a voice channel: " + channelID), callback);
	if (client._vChannels[channelID]) return handleErrCB(("Voice channel already active: " + channelID), callback);

	init = {
		"op": 4,
		"d": {
			"guild_id": serverID,
			"channel_id": channelID,
			"self_mute": false,
			"self_deaf": false
		}
	};
	client._vChannels[channelID] = {
		serverID: serverID,
		channelID: channelID,
		token: null,
		session: null,
		endpoint: null,
		callback: callback,
	};
	handler = handleWSVoiceMessage.bind(client, client._vChannels[channelID]);
	client._vChannels[channelID].handler = handler;

	client._ws.on('message', handler);
	send(client._ws, init);
};
DCP.leaveVoiceChannel = function(channelID, callback) {
	if (!this._vChannels[channelID]) return handleErrCB("Not in the voice channel: " + channelID, callback);
	return leaveVoiceChannel(this, channelID, callback);
};

DCP.getAudioContext = function(channelObj, callback) {
	// #q/qeled assisted in getting the right audio encoding settings,
	// and a proper timing solution. Credit where it's due.
	var channelID = typeof(channelObj) === 'object' ? (channelObj.channel || channelObj.channelID) : channelObj;
	var audioChannels = channelObj.stereo === false ? 1 : 2;
	var voiceSession = this._vChannels[channelID];
	var Opus, opusEncoder;

	if (!voiceSession) return console.log("You have not joined the voice channel: " + channelID);
	if (voiceSession.ready !== true) return console.log("The connection to the voice channel " + channelID + " has not been initialized yet.");
	try { Opus = require('node-opus'); } catch(e) { console.log("Error requiring module: 'node-opus'"); console.log(e); return false; }

	opusEncoder = new Opus.OpusEncoder( 48000, 1 * audioChannels );

	voiceSession.audio = voiceSession.audio || new AudioCB(voiceSession, opusEncoder, audioChannels);
	callback(voiceSession.audio);
};

/* --- Misc --- */
DCP.serverFromChannel = function(channelID) {
	return serverFromChannel.call(this, channelID);
}
DCP.getOfflineUsers = function(callback) {
	var client = this, servers = Object.keys(this.servers).filter(function(s) {
		s = client.servers[s];
		return s.large && s.member_count !== Object.keys(s.members).length;
	});

	if (!servers[0]) return handleErrCB("All users collected in all servers", callback);
	return getOfflineUsers(client, servers);
};
DCP.setGlobalRequestDelay = function(delay) {
	if (type(delay) !== 'number') return;
	this._GLOBAL_REQUEST_DELAY = Math.max(delay, 0) | 0;
};

/* --- Functions --- */
function handleErrCB(err, callback) {
	if (typeof(callback) !== 'function') return;
	return callback({message: err});
}
function handleResCB(errMessage, err, res, callback) {
	if (typeof(callback) !== 'function') return;
	if (!res) res = {};
	var e = {
		message: err || errMessage,
		statusCode: res.statusCode,
		statusMessage: res.statusMessage,
		response: res.body
	};
	if (err || !checkStatus(res)) return callback(e);
	return callback(null, res.body);
}
function checkStatus(response) {
	return (response.statusCode / 100 | 0) === 2;
}
function stringifyError(response) {
	if (!response) return null;
	return response.statusCode + " " + response.statusMessage + "\n" + JSON.stringify(response.body);
}

/* - Functions - Messages - */
function cacheMessage(cache, limit, channelID, message) {
	if (!cache[channelID]) cache[channelID] = {};
	if (limit === null) return cache[channelID][message.id] = message;
	var k = Object.keys(cache[channelID]);
	if (k.length > limit) delete cache[channelID][k[0]];
	cache[channelID][message.id] = message;
}
function generateMessage(channelID, message) {
	return {
		content: String(message),
		nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
	};
}
function messageHeaders() {
	var r = {
		"accept": "*/*",
		"accept-encoding": "gzip, deflate",
		"accept-language": "en-US;q=0.8",
		"dnt": "1",
		"user-agent": "DiscordBot (https://github.com/izy521/discord.io, " + CURRENT_VERSION + ")"
	};
	if (this && this.internals && this.internals.token) r.authorization = (this.bot ? "Bot " + this.internals.token : this.internals.token);
	return r;
}

/* - Functions - Utils */
function APIRequest(method, url) {
	var data, callback, opts = URL.parse(url);
	if (typeof(arguments[2]) === 'function') { callback = arguments[2]; } else { data = arguments[2]; callback = arguments[3]; }
	opts.method = method;
	opts.headers = messageHeaders.call(this);

	var req = requesters[opts.protocol.slice(0, -1)].request(opts, function(res) {
		var chunks = [];
		res.on('data', function(c) { chunks[chunks.length] = c; });
		res.once('end', function() {
			chunks = Buffer.concat(chunks);
			try {chunks = zlib.gunzipSync(chunks).toString();} catch(e) {}
			try {res.body = JSON.parse(chunks);} catch (e) {}
			return callback(null, res);
		});
	});
	/*Discord seems to just hang up the socket when GET requesting some areas, if a content-type isn't set, on my account.
	 The devs say they know nothing about this. So I set it just in case it happens to others...*/
	if (type(data) === 'object' || method.toLowerCase() === 'get') req.setHeader("Content-Type", "application/json; charset=utf-8");
	if (data instanceof Multipart) req.setHeader("Content-Type", "multipart/form-data; boundary=" + data.boundary);
	if (data) req.write( data.result || JSON.stringify(data), data.result ? 'binary' : 'utf-8' );
	req.end();
	
	req.once('error', function(e) { return callback(e.message); });
}
/* - Functions - Utils - Synchronous */
function send(ws, data) {
	if (ws.readyState == 1) {
		ws.send(JSON.stringify(data));
	}
}
function serverFromChannel(channelID) {
	var serverArray = Object.keys(this.servers);
	for (var i=0; i<serverArray.length; i++) {
		if (this.servers[serverArray[i]].channels && this.servers[serverArray[i]].channels[channelID]) return serverArray[i];
	}
}
function copy(obj) {
	try {
		return JSON.parse( JSON.stringify( obj ) );
	} catch(e) {}
}
function copyKeys(from, to, omit) {
	if (!omit) omit = [];
	for (var key in from) {
		if (omit.indexOf(key) > -1) continue;
		to[key] = from[key];
	}
}
function type(v) {
	return Object.prototype.toString.call(v).match(/ (.*)]/)[1].toLowerCase();
}
function qstringify(obj) {
	//.map + .join is 7x slower!
	var i=0, s = "", k = Object.keys(obj);
	for (i;i<k.length;i++) {
		s += k[i] + "=" + obj[k[i]] + "&";
	}
	return s.slice(0, -1);
}
function emit(client, message) {
	if (!message.t) return;
	var args = [message.t.toLowerCase().split("_").map(function(e, i) {
		if (i === 0) return e;
		return e.slice(0,1).toUpperCase() + e.slice(1);
	}).join("")];

	for (var i=2; i<arguments.length; i++) {
		args.push(arguments[i]);
	}
	args.push(message);
	client.emit.apply(client, args);
}
function encryptToken(token, unpwd) {
	var cipher = crypto.createCipher('aes-256-cbc', unpwd);
	var crypted = cipher.update(token, 'utf8', 'hex');
	crypted += cipher.final('hex');
	return crypted;
}
function decryptToken(token, unpwd) {
	var decipher = crypto.createDecipher('aes-256-cbc', unpwd);
	var dec = decipher.update(token, 'hex', 'utf8');
	dec += decipher.final('utf8');
	return dec;
}
function decompressWSMessage(m, f) {
	return f.binary ? JSON.parse(zlib.inflateSync(m).toString()) : JSON.parse(m);
}

function getServerInfo(client, servArr) {
	for (var server=0; server<servArr.length; server++) {
		client.servers[servArr[server].id] = new Server(client, servArr[server]);
	}
}
function getDirectMessages(client, DMArray) {
	for (var DM=0; DM<DMArray.length; DM++) {
		client.directMessages[DMArray[DM].id] = new DMChannel(client._uIDToDM, DMArray[DM])
	}
}
function resolveID(client, ID, callback) {
	/*Get channel from ServerID, ChannelID or UserID.
	Only really used for sendMessage and uploadFile.*/
	//Callback used instead of return because requesting seems necessary.

	if (client._uIDToDM[ID]) return callback(client._uIDToDM[ID]);
	//If it's a UserID, and it's in the UserID : ChannelID cache, use the found ChannelID

	//If the ID isn't in the UserID : ChannelID cache, let's try seeing if it belongs to a user.
	if (client.users[ID]) return client.createDMChannel(ID, function(err, res) {
		if (err) return console.log("Internal ID resolver error: " + err);
		callback(res.id);
	});

	return callback(ID); //Finally, the ID must not belong to a User, so send the message directly to it, as it must be a Channel's.
}

/* --- Initializing --- */
function init(client, opts) {
	client.servers = {};
	client.channels = {};
	client.users = {};
	client.directMessages = {};
	client.internals = {
		oauth: {},
		version: CURRENT_VERSION,
		settings: {}
	};
	client._connecting = true;

	getToken(client, opts);
}
function getToken(client, opts) {
	if (opts.token) return getGateway(client, opts, opts.token);

	var et;
	try {
		et = fs.readFileSync('./tenc', 'utf-8');
		fs.unlinkSync('./tenc');
		return getGateway(client, decryptToken(et, String(opts.email + opts.password)));
	} catch(e) {}

	console.log("No token provided, and unable to parse 'tenc'. Using login method.");
	APIRequest('post', "https://discordapp.com/api/auth/login", {email: opts.email, password: opts.password}, function (err, res) {
		if (err || !checkStatus(res)) {
			client._connecting = false;

			client.emit("disconnected", "Error POSTing login information:\n" + stringifyError(res), 0);
			return client.emit("disconnect", "Error POSTing login information:\n" + stringifyError(res), 0);
		}
		getGateway(client, opts, res.body.token);
	});
}
function getGateway(client, opts, token) {
	client.internals.token = token;

	APIRequest('get', "https://discordapp.com/api/gateway", function (err, res) {
		if (err || !checkStatus(res)) {
			client._connecting = false;

			client.emit("disconnected", "Error GETing gateway:\n" + stringifyError(res), 0);
			return client.emit("disconnect", "Error GETing gateway:\n" + stringifyError(res), 0);
		}
		startConnection(client, opts, (res.body.url + "/?encoding=json&v=" + GATEWAY_VERSION));
	});
}
function startConnection(client, opts, gateway) {
	client._ws = new Websocket(gateway);
	client.internals.gatewayUrl = gateway;
	client.presenceStatus = 'online';
	client.connected = true;
	client._connecting = false;

	client._ws.once('open', handleWSOpen.bind(client, opts));
	client._ws.once('close', handleWSClose.bind(client));
	client._ws.once('error', handleWSClose.bind(client));
	client._ws.on('message', handleWSMessage.bind(client, opts));
}
function getOfflineUsers(client, servArr) {
	if (!servArr[0]) return;
	
	send(client._ws, {
				op: 8,
				d: {
					guild_id: servArr.splice(0, 50).filter(function(s) {
						return client.servers[s].large;
					}),
					query: "",
					limit: 0
				}
			}
	);
	setTimeout( getOfflineUsers, 0, client, servArr );
}

/* - Functions - Websocket Handling - */
function handleWSOpen(opts) {
	var ident = {
		"op":2,
		"d": {
			"token": this.internals.token,
			"v": GATEWAY_VERSION,
			"compress": !!zlib.inflateSync,
			"large_threshold": 250,
			"properties": {
				"$os":require('os').platform(),
				"$browser":"discord.io",
				"$device":"discord.io",
				"$referrer":"",
				"$referring_domain":""
			},
		}
	};
	if (type(opts.shard) === 'array'   &&
		opts.shard.length === 2        &&
		opts.shard[0] <= opts.shard[1] &&
		opts.shard[1] > 1
	) ident.d.shard = opts.shard;
	
	send(this._ws, ident);
}
function handleWSMessage(opts, data, flags) {
	var message = decompressWSMessage(data, flags);
	var _data = message.d;
	var userItem, chItem, old, client = this;
	try {
		client.internals.sequence = message.s;
	} catch(e) {}

	if (message.op === 10) {
		//Start keep-alive interval
		client._mainKeepAlive = setInterval( send, _data.heartbeat_interval, client._ws, {op: 1, d: client.internals.sequence} );
	}

	//Events
	client.emit('any', message);
	client.emit('debug', message);
	switch (message.t) {
		case "READY":
			for (userItem in _data.user) {
				client[userItem] = _data.user[userItem];
			}
			client.internals.sessionID = _data.session_id;

			try {
				if (!opts.token) fs.writeFileSync('./tenc', encryptToken(client.internals.token, String(opts.email + opts.password)));
			} catch(e) {}

			getServerInfo(client, _data.guilds);
			getDirectMessages(client, _data.private_channels);

			client.getOauthInfo(function(err, res) {
				if (!client.bot) return;
				if (err) return console.log(err);
				client.internals.oauth = res;
				client.inviteURL = "https://discordapp.com/oauth2/authorize?client_id=" + res.id + "&scope=bot"
			});
			client.getAccountSettings(function(err, res) {
				if (err) return console.log(err);
				client.internals.settings = res;
			});
			
			return (function() {
				var ready = false;
				var t = setTimeout(fireReady, 3500);
				checkForAllServers();

				function checkForAllServers() {
					if (ready) return;
					if (
						Object.keys(client.servers).every(function(s) {
							return !client.servers[s].unavailable;
						})
					) {
						clearTimeout(t);
						return client.emit('ready', message);
					}
					setTimeout(checkForAllServers, 0);
				}
				function fireReady() {
					ready = true;
					client.emit('ready', message);
				}
			})();
			/*return (function checkForAllServers() {
				if (
					Object.keys(client.servers).every(function(s) {
						return !client.servers[s].unavailable;
					})
				) return client.emit('ready', message);
				setTimeout(checkForAllServers, 0);
			})();*/
		case "MESSAGE_CREATE":
			client.emit('message', _data.author.username, _data.author.id, _data.channel_id, _data.content, message);
			emit(client, message, _data.author.username, _data.author.id, _data.channel_id, _data.content);
			return cacheMessage(client._messageCache, client._messageCacheLimit, _data.channel_id, _data);
		case "MESSAGE_UPDATE":
			try {
				emit(client, message, messageCache[_data.channel_id][_data.id], _data);
			} catch (e) { emit(client, message, undefined, _data); }
			return cacheMessage(client._messageCache, client._messageCacheLimit, _data.channel_id, _data);
		case "PRESENCE_UPDATE":
			if (!_data.guild_id) break;

			var serverID = _data.guild_id;
			var userID = _data.user.id;
			var user, member;

			if (!client.users[userID]) { client.users[userID] = {}; }
			if (!client.servers[serverID].members[userID]) { client.servers[serverID].members[userID] = {} }

			user = client.users[userID];
			member = client.servers[serverID].members[userID]

			for (var key in _data.user) {
				user[key] = _data.user[key];
			}
			user.game = _data.game;

			for (var key in _data) {
				if (['user', 'guild_id', 'game'].indexOf(key) > -1) continue;
				member[key] = _data[key];
			}
			client.emit('presence', user.username, user.id, member.status, user.game, message);
			break;
		case "USER_UPDATE":
			for (userItem in _data) {
				client[userItem] = _data[userItem];
			}
			break;
		case "USER_SETTINGS_UPDATE":
			for (userItem in _data) {
				client.internals[userItem] = _data[userItem];
			}
			break;
		case "GUILD_CREATE":
			/*The lib will attempt to create the server using the response from the
			REST API, if the user using the lib creates the server. There are missing keys, however.
			So we still need this GUILD_CREATE event to fill in the blanks.
			If It's not our created server, then there will be no server with that ID in the cache,
			So go ahead and create one.*/
			client.servers[_data.id] = new Server(client, _data);
			return emit(client, message, client.servers[_data.id]);
		case "GUILD_UPDATE":
			old = copy(client.servers[_data.id]);
			Server.update(client, _data);
			return emit(client, message, old, client.servers[_data.id]);
		case "GUILD_DELETE":
			emit(client, message, client.servers[_data.id]);
			return delete client.servers[_data.id];
		case "GUILD_MEMBER_ADD":
			client.users[_data.user.id] = new User(_data.user);
			client.servers[_data.guild_id].members[_data.user.id] = new Member(client, _data);
			client.servers[_data.guild_id].member_count += 1;
			return emit(client, message, client.servers[_data.guild_id].members[_data.user.id]);
		case "GUILD_MEMBER_UPDATE":
			old = copy(client.servers[_data.guild_id].members[_data.user.id]);
			Member.update(client.servers[_data.guild_id], _data);
			return emit(client, message, old, client.servers[_data.guild_id].members[_data.user.id]);
		case "GUILD_MEMBER_REMOVE":
			client.servers[_data.guild_id].member_count -= 1;
			emit(client, message, client.servers[_data.guild_id].members[_data.user.id]);
			return delete client.servers[_data.guild_id].members[_data.user.id];
		case "GUILD_ROLE_CREATE":
			client.servers[_data.guild_id].roles[_data.role.id] = new Role(_data.role);
			return emit(client, message, client.servers[_data.guild_id].roles[_data.role.id]);
		case "GUILD_ROLE_UPDATE":
			old = copy(client.servers[_data.guild_id].roles[_data.role.id]);
			Role.update(client.servers[_data.guild_id], _data);
			return emit(client, message, old, client.servers[_data.guild_id].roles[_data.role.id]);
		case "GUILD_ROLE_DELETE":
			emit(client, message, client.servers[_data.guild_id].roles[_data.role_id]);
			return delete client.servers[_data.guild_id].roles[_data.role_id];
		case "CHANNEL_CREATE":
			var channelID = _data.id;

			if (_data.is_private) {
				if (client.directMessages[channelID]) return;
				client.directMessages[channelID] = new DMChannel(client._uIDToDM, _data);
				return emit(client, message, client.directMessages[channelID]);
			} else {
				if (client.channels[channelID]) return;
				client.channels[channelID] = new Channel(client, client.servers[_data.guild_id], _data);
				return emit(client, message, client.channels[channelID]);
			}
		case "CHANNEL_UPDATE":
			old = copy(client.channels[_data.id]);
			Channel.update(client, _data);
			return emit(client, message, old, client.channels[_data.id]);
		case "CHANNEL_DELETE":
			if (_data.is_private === true) {
				emit(client, message, client.directMessages[_data.id]);
				delete client.directMessages[_data.id];
				return delete client._uIDToDM[_data.recipient.id];
			}
			emit(client, message, client.servers[_data.guild_id].channels[_data.id]);
			delete client.servers[_data.guild_id].channels[_data.id];
			return delete client.channels[_data.id];
		case "VOICE_STATE_UPDATE":
			var vcid;
			try {
				vcid = client.servers[_data.guild_id].members[_data.user_id].voice_channel_id;
				if (vcid)
					delete client.servers[_data.guild_id].channels[vcid].members[_data.user_id];
				if (_data.channel_id)
					client.servers[_data.guild_id].channels[_data.channel_id].members[_data.user_id] = _data;
					client.servers[_data.guild_id].members[_data.user_id].voice_channel_id = _data.channel_id;
			} catch(e) {}
			break;
		case "GUILD_MEMBERS_CHUNK":
			var members = _data.members, serverID = _data.guild_id;
			if (!client.servers[serverID].members) client.servers[serverID].members = {};

			members.forEach(function(user) {
				if (client.servers[serverID].members[user.user.id]) return;
				if (!client.users[user.user.id]) {
					client.users[user.user.id] = new User(user.user);
				}
				client.servers[serverID].members[user.user.id] = new Member(client, user);
			});
			var all = Object.keys(client.servers).every(function(server) {
				server = client.servers[server];
				return server.member_count === Object.keys(server.members).length;
			});

			if (all) return client.emit("offlineUsers");
			break;
	}
	return emit(client, message);
}
function handleWSClose(code, data) {
	var client = this;
	var eMsg = DiscordClient.Codes.WebSocket[code];
	
	clearInterval(client._mainKeepAlive);
	client.connected = false;
	client.presenceStatus = "offline";
	
	client._ws.removeAllListeners('message');
	client._ws = null;
	
	client.emit("disconnect", eMsg, code);
	client.emit("disconnected", eMsg, code);
}

/* - Functions - Voice - */
function joinVoiceChannel(client, voiceSession) {
	var vWS, vUDP, endpoint = voiceSession.endpoint.split(":")[0];

	dns.lookup(endpoint, function(err, address) {
		if (err) return console.log(err);

		voiceSession.ws = {};
		voiceSession.udp = {};
		voiceSession.ready = false;
		voiceSession.keepAlive = null;
		voiceSession.address = address;
		voiceSession.emitter = new EE();
		
		vUDP = voiceSession.udp.connection = udp.createSocket("udp4");
		vWS = voiceSession.ws.connection = new Websocket("wss://" + endpoint);

		vUDP.bind({exclusive: true});
		vUDP.once('message', handleUDPMessage.bind(client, voiceSession));

		vWS.once('open',  handlevWSOpen.bind(client, voiceSession));
		vWS.on('message', handlevWSMessage.bind(client, voiceSession));
		vWS.once('close', handlevWSClose.bind(client, voiceSession));
	});

	handleVoiceChannelChange(client, voiceSession);
}

function leaveVoiceChannel(client, channelID, callback) {
	if (!client._vChannels[channelID]) return;

	client._vChannels[channelID].ws.connection.close();
	client._vChannels[channelID].udp.connection.close();
	send(client._ws, {
		op:4,
		d: {
			guild_id: client.channels[channelID].guild_id,
			channel_id: null,
			self_mute: false,
			self_deaf: false
		}
	});
	delete client._vChannels[channelID];

	if (typeof(callback) === 'function') callback(null);
}

/* - Functions - Voice - Handling - */
function handleWSVoiceMessage(voiceSession, data, flags) {
	data = decompressWSMessage(data, flags);

	if (data.t === "VOICE_STATE_UPDATE") {
		if (data.d.user_id !== this.id || data.d.channel_id === null) return;
		voiceSession.session = data.d.session_id;
	} else if (data.t === "VOICE_SERVER_UPDATE") {
		voiceSession.token = data.d.token;
		voiceSession.serverID = data.d.guild_id;
		voiceSession.endpoint = data.d.endpoint;

		joinVoiceChannel(this, voiceSession);
		this._ws.removeListener('message', voiceSession.handler);
		delete voiceSession.handler;
	}
}

function handlevWSOpen(voiceSession) {
	send(voiceSession.ws.connection, {
		op: 0,
		d: {
			server_id: voiceSession.serverID,
			user_id: this.id,
			session_id: voiceSession.session,
			token: voiceSession.token
		}
	});
}
function handlevWSMessage(voiceSession, vMessage) {
	var vData = JSON.parse(vMessage), callback = voiceSession.callback;
	switch (vData.op) {
		case 2: //Ready (Actually means you're READY to initiate the UDP connection)
			for (var vKey in vData.d) {
				voiceSession.ws[vKey] = vData.d[vKey];
			}

			voiceSession.keepAlive = setInterval(function() {
				send(voiceSession.ws.connection, { "op": 3, "d": null });
			}, vData.d.heartbeat_interval);

			var udpDiscPacket = new Buffer(70);
			udpDiscPacket.writeUIntBE(vData.d.ssrc, 0, 4);
			voiceSession.udp.connection.send(
				udpDiscPacket, 0, udpDiscPacket.length, vData.d.port, voiceSession.address,
				function(err) { if (err) console.log(err); }
			);
			break;
		case 4: //Session Discription (Actually means you're ready to send audio... stupid Discord Devs :I)
			voiceSession.selectedMode = vData.d.mode;
			voiceSession.secretKey = vData.d.secret_key;
			voiceSession.ready = true;
			if (callback && typeof(callback) === 'function') callback(null, voiceSession.emitter);
			delete voiceSession.callback;
			break;
		case 5: //Speaking (At least this isn't confusing!)
			voiceSession.emitter.emit('speaking', vData.d.user_id, vData.d.ssrc, vData.d.speaking);
			break;
	}
}
function handlevWSClose(voiceSession) {
	clearInterval(voiceSession.keepAlive);
	voiceSession.emitter = null;
	console.log("Voice connection closed for channel: " + voiceSession.channelID);
	return voiceSession.ws.connection.removeAllListeners('message');
}

function handleUDPMessage(voiceSession, msg, rinfo) {
	var buffArr = JSON.parse(JSON.stringify(msg)).data, client = this, vDiscIP = "", vDiscPort;
	for (var i=4; i<buffArr.indexOf(0, i); i++) {
		vDiscIP += String.fromCharCode(buffArr[i]);
	}
	vDiscPort = msg.readUIntLE(msg.length - 2, 2).toString(10);

	var wsDiscPayload = {
		"op":1,
		"d":{
			"protocol":"udp",
			"data":{
				"address": vDiscIP,
				"port": Number(vDiscPort),
				"mode": voiceSession.ws.modes[1] //'xsalsa20_poly1305'
			}
		}
	};
	send(voiceSession.ws.connection, wsDiscPayload);
}

function handleVoiceChannelChange(client, voiceSession) {
	/*Listen for any websocket events that say that this audio client
	changed voice channels. The session token will differentiate our
	session from any other audio sessions using the same account*/
	client._ws.once('message', function(m, f) {
		m = decompressWSMessage(m, f);
		if (
			(m.t !== 'VOICE_STATE_UPDATE')				||
			(m.d.session_id !== voiceSession.session) 	||
			(m.d.guild_id !== voiceSession.serverID)
		) return handleVoiceChannelChange(client, voiceSession);
		if (m.d.channel_id === null) return leaveVoiceChannel(client, voiceSession.channelID);
		if (m.d.channel_id != voiceSession.channelID) {
			client._vChannels[m.d.channel_id] = voiceSession;
			delete client._vChannels[voiceSession.channelID];
			voiceSession.channelID = m.d.channel_id;
			handleVoiceChannelChange(client, voiceSession);
		}
	});
}

/* - Functions - Voice - AudioCallback - */
function AudioCB(voiceSession, opusEncoder, audioChannels) {
	EE.call(this);
	[
		["_streamRef", null],
		["_playingAudioFile", false],
		["_speakers", []],
		["_startTime", null],
		["_sequence", 0],
		["_timestamp", 0],
		["_port", null],
		["_address", null],
		["_secretKey", null],
		["_vUDP", voiceSession.udp.connection],
		["_voiceSession", voiceSession],
		["_opusEncoder", opusEncoder],
		["_audioChannels", audioChannels]
	].forEach(function(t) {
		Object.defineProperty(this, t[0], {
			configurable: true,
			writable: true,
			value: t[1]
		});
	}, this);

	this.VoicePacket = (function() {
		var header = new Buffer(12), nonce = new Buffer(24), output = new Buffer(2048);

		header[0] = 0x80;
		header[1] = 0x78;

		nonce.fill(0);

		return function(packet, ssrc, sequence, timestamp, key) {
			header.writeUIntBE(sequence, 2, 2);
			header.writeUIntBE(timestamp, 4, 4);
			header.writeUIntBE(ssrc, 8, 4);
			//<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01>
			header.copy(nonce);
			//<Buffer 80 78 00 01 00 00 03 c0 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 00>

			var encrypted = new Buffer(
				nacl.secretbox(
					new Uint8Array(packet),
					new Uint8Array(nonce),
					new Uint8Array(key)
				)
			);

			header.copy(output);
			encrypted.copy(output, 12);

			return output.slice(0, header.length + encrypted.length);
		};
	})();

	try {
		this._port = voiceSession.ws.port;
		this._address = voiceSession.address;
		this._secretKey = voiceSession.secretKey;
	} catch(e) {return console.log(e);}

	this.on('newListener', function(event) {
		if (isFinalIncomingEvListener(this, event)) {
			vUDP.on('message', handleIncomingAudio);
		}
	});

	this.on('removeListener', function(event) {
		if (isFinalIncomingEvListener(this, event)) {
			vUDP.removeListener('message', handleIncomingAudio);
		}
	});
}
util.inherits(AudioCB, EE);
var ACBP = AudioCB.prototype;
ACBP._speakingStart = { "op":5, "d":{ "speaking": true, "delay": 0 } };
ACBP._speakingEnd = { "op":5, "d":{ "speaking": false, "delay":0 } };

ACBP.playAudioFile = function(location) {
	var encs = ['ffmpeg', 'avconv'], selection, enc, ACBI = this;
	
	if (this._playingAudioFile) return console.log("Already playing something.");

	this._playingAudioFile = true;
	selection = chooseAudioEncoder(encs);

	if (!selection) return;

	enc = ChildProc.spawn(selection , [
		'-i', location,
		'-f', 's16le',
		'-ar', '48000',
		'-ac', ACBI._audioChannels,
		'pipe:1'
	], {stdio: ['pipe', 'pipe', 'ignore']});
	enc.stdout.once('end', function() {
		enc.kill();
		send(ACBI._voiceSession.ws.connection, ACBP._speakingEnd);
		ACBI._playingAudioFile = false;
		ACBI.emit('fileEnd');
	});
	enc.stdout.once('error', function(e) {
		enc.stdout.emit('end');
	});
	enc.stdout.once('readable', function() {
		send(ACBI._voiceSession.ws.connection, ACBP._speakingStart);
		ACBI._startTime = new Date().getTime();
		prepareAudio(ACBI, enc.stdout, 1);
	});
	this._streamRef = enc;
};
ACBP.stopAudioFile = function(callback) {
	if (this._playingAudioFile) {
		this._streamRef.stdout.end();
		this._streamRef.kill();
		this._playingAudioFile = false;
	} else {
		console.log("Not playing anything.");
	}
	if (typeof(callback) === 'function') callback();
};
ACBP.send = function(stream) { //If you're piping a stream, you can handle everything else.
	send(this._voiceSession.ws.connection, this._speakingStart);
	this._startTime = new Date().getTime();
	prepareAudio(this, stream, 1);
};

/*function sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt) {
	var buff, encoded, audioPacket, nextTime;

	buff = streamOutput.read( 1920 * audioChannels );
	if (streamOutput.destroyed) return;

	sequence = sequence < 0xFFFF ? sequence + 1 : 0;
	timestamp = timestamp < 0xFFFFFFFF ? timestamp + 960 : 0;

	encoded = [0xF8, 0xFF, 0xFE];
	if (buff && buff.length === 1920 * audioChannels) encoded = opusEncoder.encode(buff);

	audioPacket = VoicePacket(encoded, sequence, timestamp, secretKey);
	nextTime = startTime + cnt * 20;

	try {
		//It throws a synchronous error if it fails (someone leaves the audio channel while playing audio)
		udpClient.send(audioPacket, 0, audioPacket.length, port, address, function(err) {});
	} catch(e) { return; }
	return setTimeout(function() {
		return sendAudio(audioChannels, opusEncoder, streamOutput, udpClient, vWS, cnt + 1);
	}, 20 + (nextTime - new Date().getTime()));
}*/
function prepareAudio(ACBI, readableStream) {
	var done = false;

	readableStream.on('end', function() {
		done = true;
		send(ACBI._voiceSession.ws.connection, ACBP._speakingEnd);
	});

	_prepareAudio(ACBI, readableStream, 1);

	function _prepareAudio(ACBI, readableStream, cnt) {
		if (done) return;
		var buffer, encoded;

		buffer = readableStream.read( 1920 * ACBI._audioChannels );
		encoded = [0xF8, 0xFF, 0xFE];

		if (buffer && buffer.length === 1920 * ACBI._audioChannels) encoded = ACBI._opusEncoder.encode(buffer);

		return setTimeout(function() {
			sendAudio(ACBI, encoded);
			_prepareAudio(ACBI, readableStream, cnt + 1);
		}, 20 + ( (ACBI._startTime + cnt * 20) - Date.now() ));
	}
}

function sendAudio(ACBI, buffer) {
	ACBI._sequence = ACBI._sequence < 0xFFFF ? ACBI._sequence + 1 : 0;
	ACBI._timestamp = ACBI._timestamp < 0xFFFFFFFF ? ACBI._timestamp + 960 : 0;

	var audioPacket = ACBI.VoicePacket(buffer, ACBI._voiceSession.ws.ssrc, ACBI._sequence, ACBI._timestamp, ACBI._secretKey);
	
	try {
		//It throws a synchronous error if it fails (someone leaves the audio channel while playing audio)
		ACBI._vUDP.send(audioPacket, 0, audioPacket.length, ACBI._port, ACBI._address, function(err) {});
	} catch(e) { return; }
}

function handleIncomingAudio(msg) {
	var header = msg.slice(0, 12),
		nonce = new Buffer(24).fill(0),
		audio = msg.slice(12),
		ssrc = header.readUIntBE(8, 4),
		enc = speakers[ssrc] || new Opus.OpusEncoder( 48000, 1 * audioChannels ),
		decrypted;

	if (!speakers[ssrc]) speakers[ssrc] = enc;
	header.copy(nonce);

	try {
		decrypted = new Buffer(
			nacl.secretbox.open(
				new Uint8Array(audio),
				new Uint8Array(nonce),
				new Uint8Array(secretKey)
			)
		);

		self.emit('incoming', ssrc, enc.decode(decrypted));
	} catch (e) {}
}

function isFinalIncomingEvListener(emitter, event) {
	return event === 'incoming' && emitter.listenerCount('incoming') === 0;
}
function chooseAudioEncoder(players) {
	if (!players[0]) return console.log("You need either 'ffmpeg' or 'avconv' and they need to be added to PATH");
	var n = players.shift();
	var s = ChildProc.spawnSync(n);
	if (s.error) return chooseAudioEncoder(players);
	console.log("Using " + n);
	return n;
}

/* - DiscordClient - Classes - */
function Resource() {}
Object.defineProperty(Resource.prototype, "creation_time", {
	get: function() { return (+this.id / 4194304) + 1420070400000; },
	set: function(v) { return; }
});
[Server, Channel, DMChannel, User, Member, Role].forEach(function(p) {
	p.prototype = Object.create(Resource.prototype);
	Object.defineProperty(p.prototype, 'constructor', {value: p, enumerable: false});
});

function Server(client, data) {
	var server = this;

	//Accept everything now and trim what we don't need, manually. Any data left in is fine, any data left out could lead to a broken lib.
	copyKeys(data, this);
	if (data.unavailable) return;

	//Objects so we can use direct property accessing without for loops
	this.channels = {};
	this.members = {};
	this.roles = {};

	//Copy the data into the objects using IDs as keys
	data.channels.forEach(function(channel) {
		client.channels[channel.id] = new Channel(client, server, channel);
	});
	data.members.forEach(function(member) {
		client.users[member.user.id] = new User(member.user);
		server.members[member.user.id] = new Member(client, member);
	});
	data.presences.forEach(function(presence) {
		var id = presence.user.id;
		delete(presence.user);

		client.users[id].game = presence.game;
		server.members[id].status = presence.status;
	});
	data.roles.forEach(function(role) {
		server.roles[role.id] = new Role(role);
	});
	data.voice_states.forEach(function(vs) {
		var cID = vs.channel_id;
		var uID = vs.user_id;
		if (!server.channels[cID]) return;
		if (!server.members[uID]) return;
		server.channels[cID].members[uID] = vs;
		server.members[uID].voice_channel_id = cID;
	});

	//Now we can get rid of any of the things we don't need anymore
	delete(this.voice_states);
	delete(this.presences);
}
function Channel(client, server, data) {
	var channel = this;
	this.members = {};
	this.guild_id = server.id;
	copyKeys(data, this);
	Object.defineProperty(server.channels, channel.id, {
		get: function() { return client.channels[channel.id]; },
		set: function(v) { client.channels[channel.id] = v },
		enumerable: true,
		configurable: true
	});

	delete(this.is_private);
}
function DMChannel(translator, data) {
	copyKeys(data, this);
	translator[data.recipient.id] = data.id;
	delete(this.is_private);
}
function User(data) {
	copyKeys(data, this);
	this.bot = this.bot || false;
}
function Member(client, data) {
	this.id = data.user.id;
	copyKeys(data, this, ['user']);
	['username', 'discriminator', 'bot', 'avatar', 'game'].forEach(function(k) {
		if (k in Member.prototype) return;

		Object.defineProperty(Member.prototype, k, {
			get: function() { return client.users[this.id][k] },
			set: function(v) { client.users[this.id][k] = v },
			enumerable: true,
		});
	});
}
function Role(data) {
	copyKeys(data, this);
}

function Multipart() {
	this.boundary = 
		"NodeDiscordIO" + "-" + CURRENT_VERSION;
	this.result = "";
}

Server.update = function(client, data) {
	if (!client.servers[data.id]) client.servers[data.id] = {};
	for (var key in data) {
		if (key === 'roles') {
			data[key].forEach(function(r) {
				client.servers[data.id].roles[r.id] = new Role(r);
			});
			continue;
		}
		client.servers[data.id][key] = data[key];
	}
};
Channel.update = function(client, data) {
	if (!client.channels[data.id]) client.channels[data.id] = {};
	for (var key in data) {
		client.channels[data.id][key] = data[key];
	}
	delete(client.channels[data.id].is_private);
};
Member.update = function(server, data) {
	if (!server.members[data.user.id]) server.members[data.user.id] = {};
	copyKeys(data, server.members[data.user.id], ['user']);
};
Role.update = function(server, data) {
	if (!server.roles[data.role.id]) server.roles[data.role.id] = {};
	var role = server.roles[data.role.id];
	copyKeys(data.role, role);
};

Role.prototype.color_values = {
	DEFAULT: 0,
	AQUA: 1752220,
	GREEN: 3066993,
	BLUE: 3447003,
	PURPLE: 10181046,
	GOLD: 15844367,
	ORANGE: 15105570,
	RED: 15158332,
	GREY: 9807270,
	DARKER_GREY: 8359053,
	NAVY: 3426654,
	DARK_AQUA: 1146986,
	DARK_GREEN: 2067276,
	DARK_BLUE: 2123412,
	DARK_PURPLE: 7419530,
	DARK_GOLD: 12745742,
	DARK_ORANGE: 11027200,
	DARK_RED: 10038562,
	DARK_GREY: 9936031,
	LIGHT_GREY: 12370112,
	DARK_NAVY: 2899536
};

Multipart.prototype.append = function append(data) {
	/* Header */
	var str = "\r\n--";
	str += this.boundary + "\r\n";
	str += 'Content-Disposition: form-data; name="' + data[0] + '"';
	if (data[2]) {
		str += '; filename="' + data[2] + '"\r\n';
		str += 'Content-Type: application/octet-stream\r\n';
	} else {
		str += "\r\n";
	}

	/* Body */
	str += "\r\n" + ( data[1] instanceof Buffer ? data[1] : Buffer(String(data[1]), 'utf-8') ).toString('binary');
	this.result += str;
};

Multipart.prototype.finalize = function finalize() {
	this.result += "\r\n--" + this.boundary + "--";
};

Object.defineProperty(Role.prototype, "permission_values", {
	get: function() { return this },
	set: function(v) {},
	enumerable: true
});
function getPerm(bit) {
	return function() {
		return ((this.permissions >> bit) & 1) == 1;
	};
}
function setPerm(bit) {
	return function(v) {
		if (v === true) return this.permissions |= (1 << (bit));
		if (v === false) return this.permissions &= ~(1 << bit);
	};
}

/*Preparing people for v2*/
DiscordClient.Client = DiscordClient;
DiscordClient.OAuth = DiscordOAuth;
DiscordClient.Codes = {};
DiscordClient.Codes.WebSocket = {
	"4000": "Unknown Error",
	"4001": "Unknown Opcode",
	"4002": "Decode Error",
	"4003": "Not Authenticated",
	"4004": "Authentication Failed",
	"4005": "Already Authenticated",
	"4006": "Session Not Valid",
	"4007": "Invalid Sequence Number",
	"4008": "Rate Limited",
	"4009": "Session Timeout",
	"4010": "Invalid Shard"
};
DiscordClient.Permissions = {
	GENERAL_CREATE_INSTANT_INVITE: 0,
	GENERAL_KICK_MEMBERS: 1,
	GENERAL_BAN_MEMBERS: 2,
	GENERAL_ADMINISTRATOR: 3,
	GENERAL_MANAGE_CHANNELS: 4,
	GENERAL_MANAGE_GUILD: 5,
	GENERAL_MANAGE_ROLES: 28,
	GENERAL_MANAGE_NICKNAMES: 27,
	GENERAL_CHANGE_NICKNAME: 26,
	
	TEXT_READ_MESSAGES: 10,
	TEXT_SEND_MESSAGES: 11,
	TEXT_SEND_TTS_MESSAGE: 12,
	TEXT_MANAGE_MESSAGES: 13,
	TEXT_EMBED_LINKS: 14,
	TEXT_ATTACH_FILES: 15,
	TEXT_READ_MESSAGE_HISTORY: 16,
	TEXT_MENTION_EVERYONE: 17,
	
	VOICE_CONNECT: 20,
	VOICE_SPEAK: 21,
	VOICE_MUTE_MEMBERS: 22,
	VOICE_DEAFEN_MEMBERS: 23,
	VOICE_MOVE_MEMBERS: 24,
	VOICE_USE_VAD: 25
};


Object.keys(DiscordClient.Permissions).forEach(function(pn) {
	Object.defineProperty(Role.prototype, pn, {
		get: getPerm( DiscordClient.Permissions[pn] ),
		set: setPerm( DiscordClient.Permissions[pn] ),
		enumerable: true
	});
});


module.exports = DiscordClient;
