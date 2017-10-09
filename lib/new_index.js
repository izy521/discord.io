(function discord_io(Discord) {
"use strict";
var is_node = !!(process && process.release);

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

class Client extends EE {
	constructor(options) {
		super();
		if ( typeof(options) !== 'object' || options === null )
			throw new TypeError("The Discord Client constructor takes an Object argument");
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
		if (!this.connected && !this._connecting) return setTimeout(function() {
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
}
class Server {
	constructor(client, data) {
		this.client = client;
		this.verificationLevel = data.verification_level;
		this.memberCount = data.member_count;
		this.large = data.large || data.member_count > LARGE_THRESHOLD;
		this.joinedAt = new Date(this.joined_at);
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
		data.members.forEach( member_data => this.members[member_data.id] = new Member(this, member_data) );
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
			member.supress = vs_data.supress;
			member.mute = vs_data.mute;
			member.deaf = vs_data.deaf;
			member.selfMute = vs_data.self_mute;
			member.selfDeaf = vs_data.self_deaf;
			member.selfVideo = vs_data.self_video;
			member.channelID = vs_data.channel_id;
			member.sessionID = vs_data.session_id;
		}, this);

		this.owner = this.members[data.owner_id];
		this.systemChannel = this.channels[data.system_channel_id] || null;

		data = null;
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
}
class Channel {
	constructor(client) {
		this.client = client;
	}
	
	async sendMessage(arg) {
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

				client._req('get', Endpoints.MESSAGES(arg.channelID) + qstringify(qs))
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

	/**
	 * Delete a batch of messages.
	 * @param {Object} arg
	 * @param {Array<Snowflake>} input.messages - An Array of messages and/or IDs.
	 */
	async deleteMessages(arg) {
		var copy = arg.messageIDs.slice();

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
	
	async moveUp() {}
	async moveDown() {}
}
class User {
	constructor(client) {
	}
	
	/**
	 * Send a message/file to a user.
	 * @param {Object} arg 
	 */
	sendMessage(arg) {
		return send_message(this.client, Object.assign({to: this.id}, arg));
	}
}
class Member {
	constructor(server, data) {
		var client = server.client;

		
	}
}
class Message {
	constructor(client, data) {
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
		this.channel = client.channels[data.channel_id] || null;
		this.author = client.users[data.author.id] || data.author;
		this.attachments = data.attachments;

		data.mentions.forEach( (m, i) => this.mentions[i] = client.users[m.id] || m );
		data.mention_roles.forEach(function(id, index) {
			if (!channel || !channel.server) return;
			this.mentionedRoles[index] = channel.server.roles[id] || id;
		});
	}
	
	valueOf() {
		return this.content.length;
	}
	
	toString() {
		return this.content;
	}

	/**
	 * Delete a posted message
	 */
	async delete() {
		return this.client.requester.request('delete', Endpoints.MESSAGES(this.channel.id, this.id));
	}
}
class Role {}
class Emoji {
	constructor(server, data) {
		this.server = server;
		this.client = server.client;
	}

	toString() {
		return `<:${this.name}:${this.id}>`;
	}

	edit(arg) {
		var payload = payload_object({ name: this.name, roles: this.roles }, arg);
		return this.client.requester.request('patch', Endpoints.SERVER_EMOJIS(this.server.id, this.id));
	}

	delete() {
		if (this.client.bot) throw new Error("This method requires a user account");
		return this.client.requester.request('delete', Endpoints.SERVER_EMOJIS(this.server.id, this.id));
	}
}

class Requester {
	constructor(client) {
		this.client = client;
		this.headers = {
			"accept": "*/*",
			"accept-language": "en-US;q=0.8",
			"authorization": `${client.bot ? "Bot " : ""}${client.token}` //Change
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
				headers: Object.assign(this.headers, {
					"Content-Type": c_type
				})
			};
			
			if (data) opts.body = (data.result || JSON.stringify(data));
			
			return fetch(url, opts)
				//[Map -> Object Headers, Object Body]
				.then(response => [map_to_object(response.headers), response.json()]);
		}).then(function(parsed_response) {
			if (!this.client.bot) return parsed_response[1]; //body
			
			var [headers, body] = parsed_response;
			
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
				this.routes.global.reset = headers["x-ratelimit-reset"];
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

async function handle_ws_message(client, event) {
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
			clearTimeout(client.internals.heartbeat);
			client.internals._ping.unshift(Date.now() - client.internals._lastHB);
			client.internals._pings = client.internals._pings.slice(0, 10);
			break;
	}
}

function handle_dispatch(client, message) {
	var [title, data] = [message.t, message.d];
	console.log(message);
	switch (title) {
		case "READY":
			break;
		case "GUILD_CREATE":
			console.log(data.voice_states[0]);
			//client.servers[data.id] = new Server(client, data);
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
	client.internals.heartbeat = setTimeout(
		client._ws.close.bind(client._ws, 1e3, 'No heartbeat received'),
		15e3
	);
	client.internals._lastHB = Date.now();
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

function map_to_object(map) {
	var obj = {};
	map.forEach( (value, key) => { obj[key] = value; } );
	return obj;
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