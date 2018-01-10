"use strict";
(function discord_io(Discord) {

var is_node = (typeof(window) === 'undefined');

var udp, zlib, dns, stream, EE = Object, requesters, child_proc, URL, NACL, Opus;

var CURRENT_VERSION      = "3.0.0",
	WS_GATEWAY_VERSION   = 6,
	HTTP_GATEWAY_VERSION = 7,
	LARGE_THRESHOLD      = 250,
	MAX_REQUESTS         = 5,
	CONNECT_WHEN         = null,
	Endpoints,
	Opcodes = {
		Gateway: {
			Dispatch: 0,
			Hearbeat: 1,
			Identify: 2,
			Status_Update: 3,
			Voice_State_Update: 4,
			Voice_Server_Ping: 5,
			Resume: 6,
			Reconnect: 7,
			Request_Guild_Members: 8,
			Invalid_Session: 9,
			Hello: 10,
			Heartbeat_ACK: 11
		},
		Voice: {}
	},
	Payloads = {
		IDENTIFY: function(client) {
			return {
				op: 2,
				d: {
					token: client.internals.token,
					v: WS_GATEWAY_VERSION,
					compress: is_node && !!zlib.inflateSync,
					large_threshold: LARGE_THRESHOLD,
					properties: {
						$os: is_node ? require('os').platform() : navigator.platform,
						$browser:"discord.io",
						$device:"discord.io",
						$referrer:"",
						$referring_domain:""
					}
				}
			};
		},
		RESUME: function(client) {
			return {
				op: 6,
				d: {
					seq: client.internals.s,
					token: client.internals.token,
					session_id: client.internals.sessionID
				}
			};
		},
		HEARTBEAT: function(client) {
			return {op: 1, d: client.internals.sequence};
		},
		ALL_USERS: function(client) {
			return {op: 12, d: Object.keys(client.servers)};
		},
		STATUS: function(status_string, game_object) {
			return {
				op: 3,
				d: {
					status: status_string,
					game: game_object
				},
				afk: false,
				since: 0
			}
		},
		STATUS: function(client, input) {
			return {
				op: 3,
				d: {
					status: input.status || client.status,
					game: type(input.game) === 'object' ?
						{
							name: input.game.name ? String(input.game.name) : null,
							type: input.game.type ? Number(input.game.type) : null,
							url: input.game.url ? String(input.game.url) : null
						} :
						null,
					afk: false,
					since: 0
				}
			}
		},
		UPDATE_VOICE: function(serverID, channelID) {
			return {
				op: 4,
				d: {
					guild_id: serverID,
					channel_id: channelID,
					self_mute: false,
					self_deaf: false
				}
			};
		},
		OFFLINE_USERS: function(array) {
			return {
				op: 8,
				d: {
					guild_id: array.splice(0, 50),
					query: "",
					limit: 0
				}
			};
		},
		VOICE_SPEAK: function(v) {
			return {op:5, d:{ speaking: !!v, delay: 0 }};
		},
		VOICE_IDENTIFY: function(clientID, voiceSession) {
			return {
				op: 0,
				d: {
					server_id: voiceSession.serverID,
					user_id: clientID,
					session_id: voiceSession.session,
					token: voiceSession.token
				}
			};
		},
		VOICE_DISCOVERY: function(ip, port, mode) {
			return {
				op:1,
				d:{
					protocol:"udp",
					data:{
						address: ip,
						port: Number(port),
						mode: mode
					}
				}
			};
		}
	}

if (is_node) {
	udp         = require('dgram'),
	zlib        = require('zlib'),
	dns         = require('dns'),
	stream      = require('stream'),
	EE          = require('events').EventEmitter,
	requesters  = {
		http:     require('http'),
		https:    require('https')
	},
	child_proc  = require('child_process'),
	URL         = require('url'),
	//NPM Modules
	NACL        = require('tweetnacl'),
	Opus        = null;
}

Discord.Channel = {
	Text: 0,
	Private: 1,
	Voice: 2,
	Group: 3,
	Category: 4
};
Discord.Message = {
	Default: 0,
	GroupRecipientAdd: 1,
	GroupRecipientRemove: 2,
	GroupCallCreate: 3,
	GroupNameUpdate: 4,
	GroupIconUpdate: 5,
	PinAdd: 6
};
Discord.Status = {
	Invisible: 'invisible',
	Online: 'online',
	Idle: 'idle',
	DND: 'dnd'
};
Discord.Activities = {
	Playing: 0,
	Streaming: 1, //Requires a 'url' field in setPresence, as well
	Listening: 2,
	Watching: 3
};
Discord.URL = {
	Twitch: function Twitch(name) {
		return `https://www.twitch.tv/${name}`;
	}
};
Discord.Colors = {
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

class Client extends EE {
	constructor(options) {
		super();
		if ( typeof(options) !== 'object' || options === null )
			throw new TypeError("The Discord Client constructor argument must be an Object");
		if (!options.token)
			throw new Error("No token provided for the Discord Client constructor");

		this.servers = {};
		this.channels = {};
		this.users = {};
		this.internals = {
			oauth: {}, settings: {}, token: options.token
		};
		this.requester = new Requester(this);

		apply_properties(this, [
			["_ws", null],
			["_pings", []],
			["_lastHB", 0],
			["_uIDToDM", {}],
			["_status", null],
			["_ready", false],
			["_vChannels", {}],
			["_messageCache", {}],
			["_connecting", false],
			["_mainKeepAlive", null],
			["_heartbeat_timeout", null],
			["_req", this.requester.request],
			["_game", new Proxy( {name: null, type: null, url: null}, game_proxy_handler(this) )],
			["_messageCacheLimit", typeof(options.messageCacheLimit) === 'number' ? options.messageCacheLimit : 50],
		]);
	}

	get status() {
		return this._status;
	}
	set status(v) {
		if ( Object.values(Discord.Status).indexOf(v) < 0 ) return;
		return ws_send( this._ws, Payloads.STATUS(this._status = v, this._game) );
	}

	get game() {
		return this._game;
	}
	set game(v) {
		if (typeof(v) !== 'object') return;
		
		if (v === null) return DiscordClient.GAME_KEYS.forEach( key => this._game[key] = null );
		return DiscordClient.GAME_KEYS.forEach( key => v.hasOwnProperty(key) && (this._game[key] = v[key]) );
	}
	
	get ping() {
		return ((this._pings.reduce( (p, c) => { return p + c; }, 0) / this._pings.length) || 0) | 0;
	}

	/**
	 * Manually initiate the WebSocket connection to Discord.
	 */
	connect() {
		if (!this.connected && !this._connecting) setTimeout(function() {
			start_connection(this);
			CONNECT_WHEN = Math.max(CONNECT_WHEN, Date.now()) + 6000;
		}.bind(this), Math.max( 0, CONNECT_WHEN - Date.now() ));
		return this;
	}

	/**
	 * Disconnect the WebSocket connection to Discord.
	 */
	disconnect() {
		if (this._ws) this._ws.close();
		return this;
	}

	/**
	 * Receive OAuth information for the current client.
	 */
	async getOauthInfo() {
		return this._req('get', Endpoints.OAUTH);
	}

	/**
	 * Receive account settings information for the current client.
	 */
	async getAccountSettings() {
		return this._req('get', Endpoints.SETTINGS);
	}

	/**
	 * Create a server
	 * @param {Object} arg 
	 */
	async createServer(arg) {
		var payload, client, img_mime;

		payload = payload_object({icon: null, name: null, region: null}, input);
		client = this;

		if ( input.icon && (img_mime = image_type(input.icon)) ) {
			payload.icon = image_to_b64(img_mime, input.icon);
		}

		
	}

	/**
	 * Get invite information from a code
	 * @arg {String} inviteCode
	 */
	async queryInvite(inviteCode) {
		// this.requester.request('get', Endpoints.INVITES(inviteCode));
	}
}
class Server {
	constructor(client, data) {
		this.client = client;
		this.verificationLevel = data.verification_level;
		this.memberCount = data.member_count;
		this.large = data.large || data.member_count > LARGE_THRESHOLD;
		this.joinedAt = new Date(data.joined_at);
		this.mfaLevel = data.mfa_level;

		this.roles = {};
		this.emojis = {};
		this.members = {};
		this.channels = {};

		this.explicitContentFilter = data.explicit_content_filter;
		this.defaultMessageNotifications = data.default_message_notifications;
		this.applicationID = data.application_id;
		this.afkTimeout = data.afk_timeout;
		this.afkChannelID = data.afk_channel_id;

		copy_properties(data, this, [
			'unavailable', 'splash', 
			'region', 'name',
			'id', 'icon', 'features',
		]);

		data.roles.forEach( role_data => this.roles[role_data.id] = new Role(this, role_data) );
		data.emojis.forEach( emoji_data => this.emojis[emoji_data.id] = new Emoji(this, emoji_data) );
		data.members.forEach( member_data => this.members[member_data.user.id] = new Member(this, member_data) );
		data.channels.forEach( channel_data => this.channels[channel_data.id] = new Channel(this, channel_data) );
		data.presences.forEach(function(presence_data) {
			var id, member;
			
			id = presence_data.user && presence_data.user.id;
			if (!this.members[id]) return;

			member = this.members[id];
			member.status = presence_data.status;
			member.game = presence_data.game;
		}, this);
		data.voice_states.forEach(function(vs_data) {
			var id, member;

			id = vs_data.user_id;
			if (!this.members[id]) return;

			member = this.members[id];
			member.mute = vs_data.mute;
			member.deaf = vs_data.deaf;
			member.selfMute = vs_data.self_mute;
			member.selfDeaf = vs_data.self_deaf;
			member.selfVideo = vs_data.self_video;
			member.voiceChannelID = vs_data.channel_id;
			member.voiceSessionID = vs_data.session_id;
		}, this);

		this.owner = this.members[data.owner_id];
		this.systemChannel = this.channels[data.system_channel_id] || null;
		data = null;

		Object.seal(this);
	}


	async edit(arg) {
		var payload;

		payload = payload_object({
			name: this.name,
			icon: this.icon,
			region: this.region,
			afk_channel_id: this.afkChannelID,
			afk_timeout: this.afkTimeout
		}, {});
	}

	async leave() {
		return this.client.requester.request('delete', Endpoints.SERVERS_PERSONAL(this.id));
	}

	async delete() {
		return this.client.requester.request('delete', Endpoints.SERVERS(this.id));
	}

	async transferOwnership(userID) {
		if (!is_snowflake(userID)) throw new Error(`UserID required`);
		return this.client.requester.request('patch', Endpoints.SERVERS(this.id), {owner_id: userID});
	}

	/**
	 * Create a channel for this server.
	 * @param {Object} arg 
	 * @param {String} arg.name
	 * @param {Number} [arg.type] - Channel type number, valid values are in the Discord.Channel enum.
	 * @param {Boolean} [arg.nsfw]
	 * @param {CategoryChannel} [arg.parent] - The category you want this channel to be under.
	 * @param {Array<Permissions>} [arg.permissionOverwrites]
	 * @param {Number} [arg.bitrate] - [Voice Only] Value between 8000 and 96000
	 * @param {Number} [arg.userLimit] - [Voice Only] Value between 0 (unlimited) and 99
	 */
	async createChannel(arg) {
		if (typeof(arg) !== 'object') throw new TypeError("Required argument must be an Object");
		if (typeof(arg.name) !== 'string') throw new TypeError("'name' field must exist and be a String");
		if (
			Object.hasOwnProperty('type') && 
			Object.values(Discord.Channel).indexOf(arg.type) < 0
		) throw new RangeError("'type' value out of range");

		var payload = { 
			name: arg.name, 
			type: Number(arg.type),
			nsfw: !!arg.nsfw
		};

		if (!(arg.parent instanceof CategoryChannel)) 
			payload.parent_id = arg.parent.id;
		
		if (Array.isArray(arg.permissionOverwrites))
			arg.permissionOverwrites.forEach(function(permission) {
				if (permission instanceof PermissionOverwrite) {

				}
			});
		
		if (arg.type === Discord.Channel.Voice) {
			if (typeof(arg.bitrate) === 'number')
				payload.bitrate = between(8000, arg.bitrate, 96000);
			if (typeof(arg.userLimit) === 'number')
				payload.user_limit = between(0, arg.userLimit, 99);
		}
	}
}
class Channel {
	constructor(client, data) {
		this.client = client;
	}

	/**
	 * Send a message to this channel.
	 * @param {Object|String} arg 
	 * @param {String} arg.content
	 * @param {Object} arg.embed
	 */
	async sendMessage(arg) {
		if (arg.constructor === String) arg = {content: arg};
		return send_message(this.client, Object.assign({to: this.id}, arg));
	}

	async getMessage(arg) {
		return this._req('get', Endpoints.MESSAGES(this.id, arg.messageID))
		.then( m => new Message(this, m) );
	}
	async getMessages(arg) {
		var client, messages, lastMessageID, qs, total;
		
		client = this.client;
		messages = [];
		lastMessageID = "";
		qs = {};
		total = typeof(arg.amount) !== 'number' ? 50 : arg.amount;

		if (arg.before) qs.before = arg.before;
		if (arg.after) qs.after = arg.after;

		return new Promise(function(resolve, reject) {
			(function getMessages() {
				if (total > 100) {
					qs.limit = 100;
					total = total - 100;
				} else {
					qs.limit = total;
				}

				if (messages.length >= arg.amount) return resolve(messages.map( m => new Message(client, m) ));

				client._req('get', Endpoints.MESSAGES(arg.channelID) + object_to_qstring(qs))
					.then(function(r_messages) {
						messages = messages.concat(r_messages);
						lastMessageID = messages[messages.length - 1] && messages[messages.length - 1].id;
						if (lastMessageID) qs.before = lastMessageID;
						if (res.body.length < qs.limit) return resolve(messages.map( m => new Message(client, m) ));
						return setTimeout(getMessages, 1000);
					}).catch(function(error) {
						if (messages.length < 1) return reject(new ResponseError(error));
						return reject(new ResponseError(error, null, messages));
					});
			})();
		});
	}

	async getPinnedMessages() {
		return this.client.requester.request('get', Endpoints.PINNED_MESSAGES(this.id));
	}

	/**
	 * Delete a batch of messages.
	 * @param {Array<Snowflake>} messages - An Array of messages and/or IDs.
	 */
	async deleteMessages(messages) {
		var copy = messages.slice();

		return new Promise(function(resolve, reject) {
			(function _deleteMessages() {
				if (copy.length <= 0) return resolve();
				var slice = copy.splice(0, 100).map( m => m instanceof Message ? m.id : m );
				this.client.requester.request('post', Endpoints.BULK_DELETE(this.id), {messages: slice})
					.then(_deleteMessages)
					.catch(reject);
			}.bind(this))();
		}.bind(this));
	}

	/**
	 * Get all invites for this channel.
	 */
	async getInvites() {
		return this.client.requester.request('get', `${Endpoints.CHANNEL(this.id)}/invites`);
	}

	/**
	 * Generate an invite URL for the channel.
	 * @param {Object}  [arg]
	 * @param {Number}  [arg.maxUses] - Amount of times this invite code can be used.
	 * @param {Number}  [arg.expires] - Time (in seconds) before the invitation expires.
	 * @param {Boolean} [arg.temporaryMembership] - Users who use this invite will be removed on disconnect, unless they have a role.
	 */
	async createInvite(arg) {
		var payload = {
			max_age: 0,
			max_users: 0,
			temporary: false
		};

		if (typeof(arg) === 'object') {
			if (arg.expires) payload.max_age = between(0, arg.expires, 86400);
			if (arg.maxUses) payload.max_users = between(0, arg.maxUses, 100);
			if (arg.temporaryMembership) payload.temporary = !!arg.temporaryMembership;
		}

		return this.client.requester.request('post', `${Endpoints.CHANNEL(this.id)}/invites`, payload);
	}
	
	async moveUp() {}
	async moveDown() {}

	/**
	 * Delete the channel
	 */
	async delete() {
		return this.client.requester.request('delete', Endpoints.CHANNEL(this.id));
	}

	/**
	 * Send a typing status to this channel.
	 */
	async simulateTyping() {
		return this.client.requester.request('post', Endpoints.TYPING(this.id));
	}
}
class TextChannel extends Channel {
	constructor(client, data) {
		super(client, data);
	}
}
class VoiceChannel extends Channel {
	constructor(client, data) {
		super(client, data);
	}
}
class CategoryChannel extends Channel {

}
class User {
	constructor(client) {
		this.client = client;
	}
	
	/**
	 * Send a message/file to a user.
	 * @param {Object} arg 
	 */
	async sendMessage(arg) {
		return send_message(this.client, Object.assign({to: this.id}, arg));
	}

	/**
	 * Create a Direct Message channel.
	 * @param {Snowflake} userID 
	 */
	async createDMChannel(userID) {
		var response = await this.client.requester.request(
			'post', 
			`${Endpoints.USER(this.client.id)}/channels`, 
			{recipient_id: userID}
		);
		
		this.client._uIDToDM[response.body.recipient.id] = res.body.id;
		//What to return?
		//Should I add a listener and return the channel when it's created?
	}
}
class Member {
	constructor(server, data) {
		var client, id;
		
		client = server.client;
		id = data.user.id;

		if (!client.users[id]) 
			client.users[id] = new User(client, data.user);
		
		copy_properties(data, this, ['mute', 'deaf']);
		
		this.id = id;
		this.user = client.users[id];
		this.server = server;
		this.status = null;
		this.game = null;
		this.suppress = null;
		this.selfMute = null;
		this.selfDeaf = null;
		this.selfVideo = null;
		this.voiceSessionID = null;
		this.voiceChannelID = null;

		Object.seal(this);
	}

	/**
	 * Assign a role to the member
	 * @param {Role} role 
	 */
	async assignRole(role) {
		if (!role || role.server !== this.server) 
			return new Error("The role does not belong to this server");
		
		return this.server.client.requester.request(
			'put',
			Endpoints.MEMBER_ROLES(this.server.id, this.user.id, role.id)
		);
	}

	/**
	 * Remove a role from the member
	 * @param {Role} role 
	 */
	async removeRole(role) {
		if (!role || role.server !== this.server)
			return new Error("The role does not belong to this server");
		
		return this.server.client.requester.request(
			'delete',
			Endpoints.MEMBER_ROLES(this.server.id, this.user.id, role.id)
		);
	}

	/**
	 * Remove a user from the Server
	 */
	async kick() {
		return this.server.client.requester.request(
			'delete',
			Endpoints.MEMBERS(this.server.id, this.id)
		);
	}

	/**
	 * Ban a user from the Server
	 * @param {Object} [arg] 
	 * @param {Number} [arg.lastDays]
	 * @param {String} [arg.reason]
	 */
	async ban(arg) {
		var params, param_string;
		
		params = {};

		if (typeof(arg.lastDays) === 'number') {
			params['delete-message-days'] = Math.max(Math.min(7, arg.lastDays), 1);
		}
		if (typeof(arg.reason) === 'string') {
			params['reason'] = encodeURIComponent(arg.reason);
		}

		param_string = object_to_qstring(params);

		return this.server.client.requester.request(
			'put',
			Endpoints.BANS(this.server.id, this.id) + (param_string ? `?${param_string}`: '')
		);
	}

	/**
	 * Unban this member from the server
	 */
	async unban() {
		return this.server.client.requester.request(
			'delete',
			Endpoints.BANS(this.server.id, this.id)
		);
	}

	/**
	 * Server-mute this member from speaking in all voice channels.
	 */
	async mute() {
		return this.server.client.requester.request(
			'patch',
			Endpoints.MEMBERS(this.server.id, this.id),
			{mute: true}
		);
	}

	/**
	 * Remove the server-mute on this member.
	 */
	async unmute() {
		return this.server.client.requester.request(
			'patch',
			Endpoints.MEMBERS(this.server.id, this.id),
			{mute: false}
		);
	}

	/**
	 * Server-deafen this member.
	 */
	async deafen() {
		return this.server.client.requester.request(
			'patch',
			Endpoints.MEMBERS(this.server.id, this.id),
			{deaf: true}
		);
	}

	/**
	 * Remove the server-deafen for this member.
	 */
	async undeafen() {
		return this.server.client.requester.request(
			'patch',
			Endpoints.MEMBERS(this.server.id, this.id),
			{deaf: false}
		);
	}

	/**
	 * Move a user into a voice channel (must already be in a voice channel).
	 * @param {VoiceChannel} voiceChannel 
	 */
	async moveTo(voiceChannel) {
		if (!voiceChannel || voiceChannel.constructor !== VoiceChannel)
			throw new TypeError("Argument must be a VoiceChannel");
		
		return this.server.client.requester.request(
			'patch',
			Endpoints.MEMBERS(this.server.id, this.id),
			{channel_id: voiceChannel.id}
		);
	}

	/**
	 * Edit this user's nickname.
	 * @param {String} nick 
	 */
	async editNickname(nick) {
		if (typeof(nick) !== 'string') throw new TypeError("Provided argument must be a String");
		var payload, url;

		payload = { nick };
		url = (this.id === this.server.client.id) ? 
			Endpoints.MEMBERS(this.server.id) + `/@me/nick` :
			Endpoints.MEMBERS(this.server.id, this.id);
		
		return this.server.client.requester.request('patch', url, payload);
	}
}
class Message {
	constructor(client, data) {
		this.client = client;
		this.type = data.type;
		this.tts = data.tts;
		this.timestamp = new Date(data.timestamp);
		this.pinned = data.pinned;
		this.nonce = data.nonce;
		this.mentions = Array(data.mentions.length);
		this.mentionedRoles = Array(data.mention_roles.length);
		this.mentionedEveryone = data.mention_everyone;
		this.id = data.id;
		this.embeds = data.embeds;
		this.edited_timestamp = data.edited_timestamp;
		this.content = data.content;
		this.channel = this.client.channels[data.channel_id] || null;
		this.author = this.client.users[data.author.id] || data.author;
		this.attachments = data.attachments;

		data.mentions.forEach( (m, i) => this.mentions[i] = this.client.users[m.id] || m );
		data.mention_roles.forEach(function(id, index) {
			if (!channel || !channel.server) return;
			this.mentionedRoles[index] = channel.server.roles[id] || id;
		}, this);

		Object.seal(this);
	}
	
	valueOf() {
		return this.content.length;
	}
	
	toString() {
		return this.content;
	}

	/**
	 * Edit a previously sent message.
	 * @param {Object} arg
	 * @param {String} arg.content - The new Message content
	 * @param {Object} [arg.embed] - The new Discord embed Object
	 */
	async edit(arg) {
		var clone, message;

		clone = Object.assign(this.constructor.prototype, this);

		if (arg.content) clone.content = arg.content;
		if (arg.embed) clone.embed = arg.embed;

		message = await this.client.requester.request(
			'patch',
			Endpoints.MESSAGES(this.channel.id, this.id),
			{content: clone.content, embed: arg.embed}
		);

		return new Message(this.client, message);
	}

	/**
	 * Delete this message from the channel
	 */
	async delete() {
		return this.client.requester.request('delete', Endpoints.MESSAGES(this.channel.id, this.id));
	}

	/**
	 * Add this message to the channel's pins.
	 */
	async pin() {
		return this.client.requester.request(
			'put',
			Endpoints.PINNED_MESSAGES(this.channel.id, this.id)
		);
	}

	/**
	 * Remove this message from the channel's pins.
	 */
	async unpin() {
		return this.client.requester.request(
			'delete',
			Endpoints.PINNED_MESSAGE(this.channel.id, this.id)
		);
	}

	/**
	 * Add an emoji reaction to the message.
	 * @param {Emoji|String} emoji 
	 */
	async addReaction(emoji) {
		if (!emoji) throw new TypeError("Emoji data expected");
		
		var emoji_data = Emoji.stringify(emoji);
		
		return this.client.requester.request(
			'put',
			Endpoints.USER_REACTIONS(this.channel.id, this.id),
			emoji_data
		);
	}

	/**
	 * Remove an emoji reaction from the message.
	 * @param {Emoji|String} emoji
	 */
	async removeReaction(emoji) {
		if (!emoji) throw new TypeError("Emoji data expected");
		
		var emoji_data = Emoji.stringify(emoji);
		
		return this.client.requester.request(
			'put',
			Endpoints.USER_REACTION(this.channel.id, this.id),
			emoji_data
		);
	}

	/**
	 * Get the amount of people who used a reaction on this message.
	 * @param {Emoji|String} emoji 
	 */
	async getReaction(emoji) {
		if (!emoji) throw new TypeError("Emoji data expected");

		var emoji_data = Emoji.stringify(emoji);

		return this.client.requester.request(
			'get',
			Endpoints.MESSAGE_REACTIONS(this.channel.id, this.id, emoji_data)
		);
	}
}
class Role {
	constructor(server, data) {
		this.server = server;

		Object.seal(this);
	}

	/**
	 * Delete the role
	 */
	async delete() {
		return this.server.client.requester.request(
			'delete', 
			Endpoints.ROLES(this.server.id, this.id)
		);
	}
}
class Emoji {
	constructor(server, data) {
		this.server = server;
		this.client = server.client;
	}

	static stringify(data) {
		var emoji_str = data;

		if (data.constructor === Emoji)
			emoji_str = `${data.name}:${data.id}`;
		
		return encodeURIComponent(decodeURIComponent(emoji_str));
	}

	toString() {
		return `<:${this.name}:${this.id}>`;
	}

	/**
	 * [User Account] Edit this emoji
	 * @param {Object} arg
	 * @param {String} [arg.name]
	 * @param {Array<Snowflake>} [arg.roles]
	 */
	async edit(arg) {
		if (this.client.bot) throw new Error("This method requires a user account");
		var payload = payload_object({ name: this.name, roles: this.roles }, arg);
		return this.client.requester.request('patch', Endpoints.SERVER_EMOJIS(this.server.id, this.id));
	}

	/**
	 * Delete this emoji
	 */
	async delete() {
		if (this.client.bot) throw new Error("This method requires a user account");
		return this.client.requester.request('delete', Endpoints.SERVER_EMOJIS(this.server.id, this.id));
	}
}
class Invite {
	constructor(client, data) {
		this.client = client;
		this.code = data.code;
		this.createdAt = new Date(data.created_at);
		this.maxAge = data.max_age;
		this.maxUses = data.maxUses;
		this.temporary = data.temporary;
		this.uses = data.uses;
		this.expires = new Date( Number(this.createdAt) + (this.maxAge * 1e4) );

		this.server = data.guild ? client.servers[data.guild.id] : null;
		this.channel = client.channels[data.channel.id];
		this.inviter = client.users[data.inviter.id];

		Object.seal(this);
	}

	toString() {
		return `https://discord.gg/${this.code}`;
	}

	async delete() {
		return this.server.client.requester.request(`delete`, Endpoints.INVITES(this.code));
	}
}
class Permissions {
	constructor(from) {
		this.allow_value = 0;
		this.deny_value = 0;

		if (from instanceof Role)
			this.allow_value = role.permissions;

		if (from instanceof Permissions) {
			this.allow_value = from.allow_value;
			this.deny_value = from.deny_value;
		}
	}
	
	allow(bit) {
	  this.allow_value |= 1 << bit;
	  this.deny_value &= ~(1 << bit);
	}
	
	deny(bit) {
	  this.deny_value |= 1 << bit;
	  this.allow_value &= ~(1 << bit);
	}
	
	nullify(bit) {
	  this.allow_value &= ~(1 << bit);
	  this.deny_value &= ~(1 << bit);
	}

	get role_value() {
	  return { permissions: this.allow_value };
	}
	get overwrite_value() {
	  return {
	    allow: this.allow_value,
	    deny: this.deny_value
	  };
	}
}
Permissions.GENERAL_CREATE_INVITE       =  0; //Server & Channel
Permissions.GENERAL_KICK_MEMBERS        =  1; //Server
Permissions.GENERAL_BAN_MEMBERS         =  2; //Server
Permissions.GENERAL_ADMINISTRATOR       =  3; //Server (Able to be set on Channel, but not intended, apparently)
Permissions.GENERAL_MANAGE_CHANNELS     =  4; //Server & Channel (Manage Channel in permission overwrites)
Permissions.GENERAL_MANAGE_SERVER       =  5; //Server
Permissions.GENERAL_AUDIT_LOG           =  7; //Server
Permissions.GENERAL_READ_TEXT_SEE_VOICE = 10; //Server & Channel
Permissions.GENERAL_CHANGE_NICKNAME     = 26; //Server
Permissions.GENERAL_MANAGE_NICKNAMES    = 27; //Server
Permissions.GENERAL_MANAGE_ROLES        = 28; //Server & Channel (Manage Permissions in permission overwrites)
Permissions.GENERAL_MANAGE_WEBHOOKS     = 29; //Server & Channel
Permissions.GENERAL_MANAGE_EMOJIS       = 30; //Server

Permissions.TEXT_ADD_REACTIONS          =  6; //Server & Channel
Permissions.TEXT_SEND_MESSAGES          = 11; //Server & Channel
Permissions.TEXT_SEND_TTS_MESSAGES      = 12; //Server & Channel
Permissions.TEXT_MANAGE_MESSAGES        = 13; //Server & Channel
Permissions.TEXT_EMBED_LINKS            = 14; //Server & Channel
Permissions.TEXT_ATTACH_FILES           = 15; //Server & Channel
Permissions.TEXT_READ_MESSAGE_HISTORY   = 16; //Server & Channel
Permissions.TEXT_MENTION_EVERYONE       = 17; //Server & Channel
Permissions.TEXT_USE_EXTERNAL_EMOJIS    = 18; //Server & Channel

Permissions.VOICE_CONNECT               = 20; //Server & Channel
Permissions.VOICE_SPEAK                 = 21; //Server & Channel
Permissions.VOICE_MUTE_MEMBERS          = 22; //Server & Channel
Permissions.VOICE_MUTE_MEMBERS          = 23; //Server & Channel
Permissions.VOICE_DEAFEN_MEMBERS        = 24; //Server & Channel
Permissions.VOICE_USE_VOICE_ACTIVITY    = 25; //Server & Channel

Permissions.base   = [0, 4, 10, 28, 29];
Permissions.text   = Permissions.base.concat([6, 11, 12, 13, 14, 15, 16, 17, 18]);
Permissions.voice  = Permissions.base.concat([20, 21, 22, 23, 24, 25]);
Permissions.role   = Permissions.base.concat(
	Permissions.text,
	Permissions.voice,
	[1, 2, 3, 5, 7, 26, 27, 30]
);

/**
 * Constructor for permission overwrites
 * @constructor
 */
class PermissionOverwrite {
	//{"id":"148988330220978176","type":"role","allow":0,"deny":1024}
	//Accepts a Role or Member
	constructor(target, channel) {
		var allowed_types, index;
    
    	allowed_types = [TextChannel, VoiceChannel];
    	index = allowed_types.indexOf(channel && channel.constructor);
    
    	if (index < 0)
			throw new TypeError("'channel' must be a TextChannel or VoiceChannel");
    
		this.type;
		this.channel_type = allowed_types[index];
		this.allow_value = 0;
		this.deny_value = 0;
    
		allowed_types = null;
		index = null;
	}
}


class Requester {
	constructor(client) {
		this.client = client;
		this.headers = {
			"accept": "*/*",
			"accept-language": "en-US;q=0.8",
			"authorization": `${client.bot ? "Bot " : ""}${client.internals.token}`
		};
		this.routes = {
			global: {
				rate_limited: false,
				reset: 0,
				reset_timeout: null
			},
			guilds: {},
			channels: {}
		};
		
		if (is_node) Object.assign(this.headers, {
			"accept-encoding": "gzip, deflate",
			"user_agent": `DiscordBot (https://github.com/izy521/discord.io, ${CURRENT_VERSION})`,
			"dnt": 1
		});
	}
	
	async request(method, url, data) {
		var regex, match, parameter, id, rate_limit, error;
		
		regex = /(channels|guilds)\/(\d*)/;
		
		if (match = url.match(regex)) {
			parameter = match[1];
			id = match[2];
			rate_limit = this.routes[parameter][id];
			
			if (rate_limit && rate_limit.remaining <= 0) {
				error = new Error(`Internally rate-limited, expires after ${new Date(rate_limit.reset)}`);
				error.reset = rate_limit.reset;
				throw(error);
			}
		}
		
		return new Promise(function(resolve, reject) {
			var opts, request, c_type;
			
			if (type(data) === 'object' || method.toLowerCase() === 'get') c_type = "application/json; charset=utf-8";
			if (data instanceof Multipart) c_type = `multipart/form-data; boundary=${data.boundary}`;
			
			if (is_node) {
				opts = Object.assign(URL.parse(url), {
					method: method,
					headers: this.headers
				});
				
				request = requesters[opts.protocol.slice(0, -1)].request(opts, function(res) {
					var chunks = [];
					res .on('data', c => chunks[chunks.length] = c)
						.once('end', function() {
							chunks = Buffer.concat(chunks);
							//[Object Headers, Object Body]
							try { chunks = zlib.gunzipSync(chunks); } catch(e) {}
							return resolve([res.headers, JSON.parse(chunks)]);
						});
				});
				
				req.setHeader("Content-Type", c_type);
				if (data) req.write(data.result || JSON.stringify(data), data.result ? 'binary' : 'utf-8');
				return req.once('error', e => reject(e.message)).end();
			}
			
			opts = {
				method: method,
				headers: Object.assign({
					"Content-Type": c_type
				}, this.headers)
			};
			
			if (data) opts.body = (data.result || JSON.stringify(data));
			
			return fetch(url, opts)
				//[Map -> Object Headers, Object Body]
				.then(response => [map_to_object(response.headers), response.json()]);
		}).then(function(parsed_response) {
			if (!this.client.bot) return parsed_response[1]; //body
			
			var [headers, body] = parsed_response;
			console.log(headers, body);
			
			if (match) {
				if (!rate_limit) {
					rate_limit = 
						this.routes[parameter][id] = 
						new RateLimit(this.routes, parameter, id, headers);
				}
				rate_limit.update(headers);
			}
			
			if (headers["x-ratelimit-global"]) {
				this.routes.global.rate_limited = true;
				this.routes.global.reset = (+headers["x-ratelimit-reset"]);
				this.routes.global.reset_timeout = setTimeout(function() {
					this.routes.global = {
						rate_limited: false,
						reset: 0,
						reset_timeout: null
					}
				}, this.routes.global.reset - Date.now());
			}
			return body;
		});
	}
}
class RateLimit {
	constructor(routes_object, parameter, id, headers) {
		this.limit = headers["x-ratelimit-limit"];
		this.remaining = headers["x-ratelimit-remaining"];
		this.reset = (+headers["x-ratelimit-reset"] * 1000);
		this.reset_timeout = setTimeout( x => delete routes_object[parameter][id] , this.reset - Date.now() );
	}
	
	update(headers) {
		return void(this.remaining = headers["x-ratelimit-remaining"]);
	}
}
class Multipart {
	constructor() {
		this.boundary `DiscordIO-${CURRENT_VERSION}`;
		this.result = "";
	}

	append(data) {
		var [nl, str] = ["\r\n", `${nl}--`];
		str += `${this.boundary}${nl}`;
		str += `Content-Disposition: form-data; name="${data[0]}"`;

		if (data[2]) {
			str += `; filename="${data[2]}"${nl}`;
			str += `Content-Type: application/octet-stream`;
		}

		str += `${nl}${nl}${( data[1] instanceof Buffer ? data[1] : new Buffer(String(data[1]), 'utf-8') ).toString('binary')}`;
		this.result = str;
	}

	finalize() {
		this.result += `\r\n--${this.boundary}--`;
	}
}

class ResponseError extends Error {
	constructor(response, message, partial_data) {
		super();
		this.response = response.body;
		this.message = message || "Unable to complete request";
		this.statusCode = response.statusCode;
		this.statusMessage = response.statusMessage;
		this.partialData = partial_data || null;
	}
}

[Client, Server, Channel, User, Message, Role].forEach( c => Discord[c.name] = c );

async function send_message(client, arg) {
	var is_multipart, multipart, outbound_data, channel_id;

	if (arg.file && arg.embed) 
		throw new Error(`Unable to send a message with both 'file' and 'embed' fields`);
	
	if (arg.file && !buffer_like(arg.file))
		throw new TypeError(`'file' must be a Uint8Array, Array, or Buffer`);
	
	is_multipart = !!arg.file;
	
	if (is_multipart) {

		if (!arg.filename) throw new Error(`A 'filename' is required if uploading a 'file'`);

		multipart = new Multipart();
		[
			["content", message.content],
			["mentions", ""],
			["tts", false],
			["nonce", message.nonce],
			["file", file, arg.filename]
		].forEach(multipart.append, multipart);
		multipart.finalize();
		outbound_data = multipart;
	} else {
		outbound_data = payload_object({content: null, embed: null, tts: null}, arg);
	}

	channel_id = await resolveID(client, arg.to);
	return client.requester.request('post', Endpoints.MESSAGES(channel_id), outbound_data);
}

async function start_connection(client, gateway = Endpoints.WS_GATEWAY) {
	client._ws = new Websocket(gateway);
	client.internals.gatewayURL = gateway;
	
	//client.onclose = handle_ws_close.bind(null, client);
	//client.onerror = handle_ws_close.bind(null, client);
	client._ws.onmessage = handle_ws_message.bind(null, client);
}

function handle_ws_message(client, event) {
	var message, payload;

	message = decompress_ws_message(event.data, event.binary);

	switch(message.op) {
		case Opcodes.Gateway.Dispatch:
			client.internals.sequence = message.s;
			handle_dispatch(client, message);
			break;
		case Opcodes.Gateway.Reconnect:
			break;
		case Opcodes.Gateway.Invalid_Session:
			break;
		case Opcodes.Gateway.Hello:
			payload = identify_or_resume(client);
			ws_send(client._ws, payload);

			client._main_keep_alive = setInterval(
				keep_alive.bind(null, client),
				message.d.heartbeat_interval
			);
			break;
		case Opcodes.Gateway.Heartbeat_ACK:
			clearTimeout(client._heartbeat_interval);
			client._pings.unshift(Date.now() - client._lastHB);
			client._pings = client._pings.slice(0, 10);
			break;
	}
}

function handle_dispatch(client, message) {
	var [title, data] = [message.t, message.d];
	//console.log(message);
	switch (title) {
		case "READY":
			//Ignoring: user_settings
			client.user = new User(data.user);
			//console.log(data);
			break;
		case "GUILD_CREATE":
			//console.log(data.members[0]);
			client.servers[data.id] = new Server(client, data);
			break;
	}
}

function decompress_ws_message(message, binary) {
	return binary ? JSON.parse(zlib.inflateSync(message).toString()) : JSON.parse(message);
}

function identify_or_resume(client) {
	var payload, internals = client.internals;

	if (internals.sequence && internals.token && internals.sesionID) {
		return Payloads.RESUME(client);
	}

	payload = Payloads.IDENTIFY(client);
	if (client._shard) payload.d.shard = client._shard;

	return payload;
}

function keep_alive(client) {
	client._heartbeat_interval = setTimeout(
		client._ws.close.bind(client._ws, 1e3, 'No heartbeat received'),
		15e3
	);
	client._lastHB = Date.now();
	ws_send(client._ws, Payloads.HEARTBEAT(client));
}

/**
 * Sends a WebSocket message if the client exists and is ready to send.
 * @param {WebSocket} ws 
 * @param {Object} data 
 */
function ws_send(ws, data) {
	if (ws && ws.readyState == 1) ws.send(JSON.stringify(data));
}

function payload_object(base_object, modified_object) {
	return Object.assign(Object.seal(base_object), modified_object);
}

function buffer_like(b) {
	return b instanceof Uint8Array || (Buffer && Buffer.isBuffer(b));
}

function image_type(buffer) {
	var i, types = ['jpeg', 'png', 'gif'];

	(
		buffer[0] === 0xFF &&
		buffer[1] === 0xD8 &&
		buffer[buffer.length - 1] === 0xD9 &&
		buffer[buffer.length - 2] === 0xFF
	) && (i = 0);

	[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
		.every((b, i) => buffer[i] === b) && (i = 1);

	(
		buffer[0] === 0x47 &&
		buffer[1] === 0x49 &&
		buffer[2] === 0x46 &&
		buffer[3] === 0x38 &&
		([0x39, 0x37].indexOf(buffer[4]) > -1) &&
		buffer[5] === 0x61
	) && (i = 2);

	return typeof (i) === 'number' ? types[i] : undefined;
}

function image_to_b64(mime, buffer) {
	return `data:image/${mime};base64,${buffer.toString('base64')}`
}

function map_to_object(map) {
	var obj = {};
	map.forEach( (value, key) => { obj[key] = value; } );
	return obj;
}

function object_to_qstring(object) {
	return Object.keys(object)
		.map(key => `${key}=${object[key]}`)
		.join("&");
}

function between(min, value, max) {
	Math.min(Math.max(min, Number(value)), max);
}

function copy_properties(from, to, properties) {
	return properties.forEach( prop => to[prop] = from[prop] );
}

function apply_properties(object, properties) {
	return properties.forEach(function(t) {
		return Object.defineProperty(object, t[0], {
			configurable: true,
			writable: true,
			value: t[1]
		});
	}, object);
}

function game_proxy_handler(client) {
	var change_timeout = null;
	return {
		set: function(object, name, value) {
			if (DiscordClient.GAME_KEYS.indexOf(name) < 0) return;
			if (change_timeout) clearInterval(change_timeout);

			object[name] = value;
			change_timeout = setTimeout(function() {
				ws_send( client._ws, Payloads.STATUS(client._status, client._game) );
				change_timeout = null;
			}, 1500);
		}
	};
}

function is_snowflake(ID) {
	//Only created for syntax purposes
	return typeof ID === 'string';
}

!function set_endpoints() {
	var WS_GATEWAY = `wss://gateway.discord.gg/?encoding=json&v=${WS_GATEWAY_VERSION}`;
	var API     = `https://discordapp.com/api`;
	var CDN     = `http://cdn.discordapp.com`;
	var ME      = `${API}/users/@me`;
	Endpoints   = Discord.Endpoints = {
		WS_GATEWAY, API, CDN, ME,
		
		NOTE:     userID => `${ME}/notes/${userID}`,
		LOGIN:    `${API}/auth/login`,
		OAUTH:    `${API}/oauth2/applications/@me`,
		GATEWAY:  `${API}/gateway`,
		SETTINGS: `${ME}/settings`,
		
		SERVERS:          serverID => `${API}/guilds${serverID ? `/${serverID}` : ``}`,
		SERVERS_PERSONAL: serverID => `${ME}/guilds${serverID ? `/${serverID}` : ``}`,
	};
}();

function Websocket(url, opts) {
	if (is_node) return new (require('ws'))(url, opts);
	return new WebSocket(url);
}

})(typeof exports === 'undefined'? this.Discord = {} : exports);