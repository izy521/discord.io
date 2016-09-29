/**
 * Misc argument types
 */
declare type region = "brazil" | "frankfurt" | "amsterdam" | "london" | "singapore" | "us-east" | "us-central" | "us-south" | "us-west" | "sydney";

declare type userStatus = "online" | "idle" | "offline";

declare type callbackFunc = (error: cbError, response: any) => void;

declare type WebSocketEvent = {
  d: any;
  op: number;
  s: number;
  t: string;
};

declare type game = {
  name: string;
  type: number;
  url?: string;
};

declare type colors = "DEFAULT" | "AQUA" | "GREEN" | "BLUE" | "PURPLE" | "GOLD" | "ORANGE" | "RED" | "GREY" | "DARKER_GREY" | "NAVY" | "DARK_AQUA" | "DARK_GREEN" | "DARK_BLUE" | "DARK_PURPLE" | "DARK_GOLD" | "DARK_ORANGE" | "DARK_RED" | "DARK_GREY" | "LIGHT_GREY" | "DARK_NAVY";

declare type channelType = "voice" | "text";


/**
 * Events callbacks
 */
declare type readyCallback = (event: WebSocketEvent) => void;
declare type messageCallback = (user: string, userID: string, channelID: string, mesage: string, event: WebSocketEvent) => void;
declare type presenceCallback = (user: string, userID: string, status: string, game: game, event: WebSocketEvent) => void;
declare type anyCallback = (event: WebSocketEvent) => void;
declare type disconnectCallback = (errMsg: string, code: number) => void;

/*
 *WebSocket event callbacks
 */
declare type messageCreateCallback = (username: any, userID: any, channelID: any, message: any, event: WebSocketEvent) => void;
declare type messageUpdate1Callback = (newMsg: any, event: WebSocketEvent) => void;
declare type messageUpdate2Callback = (oldMsg: any, newMsg: any, event: WebSocketEvent) => void;
declare type presenceUpdateCallback = (event: WebSocketEvent) => void;
declare type userUpdateCallback = (event: WebSocketEvent) => void;
declare type userSettingsUpdateCallback = (event: WebSocketEvent) => void;
declare type guildCreateCallback = (server: any, event: WebSocketEvent) => void;
declare type guildUpdateCallback = (oldServer: any, newServer: any, event: WebSocketEvent) => void;
declare type guildDeleteCallback = (server: any, event: WebSocketEvent) => void;
declare type guildMemberAddCallback = (member: any, event: WebSocketEvent) => void;
declare type guildMemberUpdateCallback = (oldMember: any, newMember: any, event: WebSocketEvent) => void;
declare type guildMemberRemoveCallback = (member: any, event: WebSocketEvent) => void;
declare type guildRoleCreateCallback = (role: any, event: WebSocketEvent) => void;
declare type guildRoleUpdateCallback = (oldRole: any, newRole: any, event: WebSocketEvent) => void;
declare type guildRoleDeleteCallback = (role: any, event: WebSocketEvent) => void;
declare type channelCreateCallback = (channel: any, event: WebSocketEvent) => void;
declare type channelUpdateCallback = (oldChannel: any, newChannel: any, event: WebSocketEvent) => void;
declare type channelDeleteCallback = (channel: any, event: WebSocketEvent) => void;
declare type voiceStateUpdateCallback = (event: WebSocketEvent) => void;
declare type voiceServerUpdateCallback = (event: WebSocketEvent) => void;
declare type guildMembersChunkCallback = (event: WebSocketEvent) => void;

/**
 * Callbacks interface
 */
declare interface cbError {
		message?: string,
		statusCode?: string,
		statusMessage?: string,
		response?: string
}

declare interface cbRes {

}

/**
 * Collections types as TypeScript doesn't support them
 */
declare type ServerCollection = { [id: string]: Discord.Server };
declare type ChannelCollection = { [id: string]: Discord.Channel };
declare type UserCollection = { [id: string]: Discord.User };
declare type DMChannelCollection = { [id: string]: Discord.DMChannel };
declare type RoleCollection = { [id: string]: Discord.Role };
declare type MemberCollection = { [id: string]: Discord.Member };

/**
 * Permissions as boolean mixin (used in Role)
 * Just for autocompletion
 */
declare interface permissions {
  GENERAL_CREATE_INSTANT_INVITE?: boolean;
  GENERAL_KICK_MEMBERS?: boolean;
  GENERAL_BAN_MEMBERS?: boolean;
  GENERAL_ADMINISTRATOR?: boolean;
  GENERAL_MANAGE_CHANNELS?: boolean;
  GENERAL_MANAGE_GUILD?: boolean;
  GENERAL_MANAGE_ROLES?: boolean;
  GENERAL_MANAGE_NICKNAMES?: boolean;
  GENERAL_CHANGE_NICKNAME?: boolean;

  TEXT_READ_MESSAGES?: boolean;
  TEXT_SEND_MESSAGES?: boolean;
  TEXT_SEND_TTS_MESSAGE?: boolean;
  TEXT_MANAGE_MESSAGES?: boolean;
  TEXT_EMBED_LINKS?: boolean;
  TEXT_ATTACH_FILES?: boolean;
  TEXT_READ_MESSAGE_HISTORY?: boolean;
  TEXT_MENTION_EVERYONE?: boolean;

  VOICE_CONNECT?: boolean;
  VOICE_SPEAK?: boolean;
  VOICE_MUTE_MEMBERS?: boolean;
  VOICE_DEAFEN_MEMBERS?: boolean;
  VOICE_MOVE_MEMBERS?: boolean;
  VOICE_USE_VAD?: boolean;
}

/**
 * METHODS OPTIONS TYPES
 */
declare type sendMessageOpts = {
  to: string,
  message: string,
  tts?: boolean,
  nonce?: string,
  typing?: boolean
}

declare type uploadFileOpts = {
  to: string,
  file: string,
  filename?: string,
  message?: string
}

declare type getMessageOpts = {
  channelID: string,
  messageID: string
}

declare type getMessagesOpts = {
  channelID: string,
  before?: string,
  after?: string,
  limit?: number
}

declare type editMessageOpts = {
  channelID: string,
  messageID: string,
  message: string
}

declare type deleteMessagesOpts = {
  channelID: string,
  messageIDs: string[]
}

declare type deleteMessageOpts = {
  channelID: string,
  messageID: string
}

declare type pinMessageOpts = {
  channelID: string,
  messageID: string
}

declare type getPinnedMessagesOpts = {
  channelID: string
}

declare type deletePinnedMessageOpts = {
  channelID: string,
  messageID: string
}

declare type createServerOpts = {
  icon: string,
  name: string,
  region: region
}

declare type editServerOpts = {
  serverID: string,
  name: string,
  icon: string,
  region: region,
  afk_channel_id: string,
  afk_timeout: number
}

declare type editUserInfoOpts = {
  avatar: string,
  username: string
  email: string,
  password: string,
  new_password: string,
}

declare type setPresenceOpts = {
  idle_since: any,
  game: game
}

declare type addAndRemoveFromRole = {
  serverID: string,
  userID: string,
  role: string
}

declare type moveUserToOpts = {
  serverID: string,
  userID: string,
  channelID: string
}

declare type actionsOnUserOpts = {
  channelID: string,
  target: string
}

declare type banUserOpts = {
  channelID: string,
  target: string,
  lastDays?: number
}

declare type createChannelOpts = {
  serverID: string,
  type: channelType,
  name: string
}

declare type editChannelInfoOpts = {
  channelID: string,
  name?: string,
  position?: number,
  topic?: string,
  bitrate?: string
}

declare type createInviteOpts = {
  channelID: string,
  max_users: number,
  max_age: number,
  temporary: boolean,
  xkcdpass: boolean
}

declare type editRoleOpts = {
  serverID: string,
  roleID: string,
  name: string,
  hoist: boolean,
  permissions: permissions,
  color: colors,
  mentionable: boolean,
  // I dont know what position is and it is unused in current code
  position: any
}

declare type deleteRoleOpts = {
  serverID: string,
  role: string
}

declare type editNicknameOpts = {
  nick: string,
  serverID: string,
  userID: string
}

declare type editChannelPermissionsOpts = {
  channelID: string,
  userID: string,
  roleID: string,
  allow: Discord.Permissions[],
  deny: Discord.Permissions[],
  default: Discord.Permissions[]
}

declare type editServerWidgetOpts = {
  serverID: string,
  channelID: string,
  enabled: boolean
}

declare type addServerEmojiOpts = {
    serverID: string,
    name: string,
    image: string
}

declare type editServerEmojiOpts = {
    serverID: string,
    emojiID: string,
    name: string,
    role: string[]
}

declare type deleteServerEmojiOpts = {
    serverID: string,
    emojiID: string
}

declare type deleteChannelPermissionOpts = {
    channelID: string,
    userID: string,
    roleID: string
}

declare type editNoteOpts = {
  userID: string,
  note: string
}

declare type getMemberOpts = {
  serverID: string,
  userID: string
}

declare type getMembersOpts = {
  limit: number,
  after: string
}

/**
 * CLASSES
 */
declare class Resource {
  id: string;
  creation_time: number;
}

declare namespace Discord {

  export let version: string;

  export class Server extends Resource {
    name: string;
    id: string;
    region: region;
    owner_id: string;
    joined_at: string;
    large: boolean;
    verification_level: number;
    splash: string;
    icon: string;
    member_count: number;
    unavailable: boolean;
    channels: ChannelCollection;
    members: MemberCollection;
    roles: RoleCollection;
    features: Object[];
    emojis: Object[];
    afk_timeout: number;
    afk_channel_id: string;
    embed_enabled: boolean;
    embed_channel_id: string;
    default_message_notifications: number;
  }

  export class Channel extends Resource {
    name: string;
    id: string;
    guild_id: string;
    type: string;
    topic: string;
    position: number;
    last_message_id: string;
    members: Object;
  }

  export class DMChannel extends Resource {
    recipient: Object;
    last_message_id: string;
    id: string;
  }

  export class User extends Resource {
    username: string;
    id: string;
    discriminator: number;
    avatar: string;
    bot: boolean;
    game: Object;
  }

  export class Member extends Resource {
    id: string;
    roles: string[];
    mute: boolean;
    joined_at: string;
    deaf: boolean;
    status: userStatus;
    voice_channel_id: string;
  }

  export class Role extends Resource {
    name: string;
    id: string;
    position: number;
    managed: boolean;
    permissions: number;
    mentionnable: boolean;
    hoist: boolean;
    color: number;
  }

  export class Client {
    id: string;
    username: string;
    email: string;
    discriminator: number;
    avatar: string;
    bot: boolean;
    verified: boolean;
    connected: boolean;
    presenceStatus: userStatus;
    inviteURL: string;
    servers: ServerCollection;
    channels: ChannelCollection;
    users: UserCollection;
    directMessages: DMChannelCollection;
    internals: Object;

    constructor(options: {
      token: string,
      autorun?: boolean,
      messageCacheLimit?: number,
      shard?: number[]
    })

    // EVENTS
    on(eventName: "ready", callback: readyCallback): void
    on(eventName: "message", callback: messageCallback): void
    on(eventName: "presence", callback: presenceCallback): void
    on(eventName: "any", callback: anyCallback): void
    on(eventName: "disconnect", callback: disconnectCallback): void
    // WebSocket events
    on(eventName: "messageCreate", callback: messageCreateCallback): void
    on(eventName: "messageUpdate", callback: messageUpdate1Callback): void
    on(eventName: "messageUpdate", callback: messageUpdate2Callback): void
    on(eventName: "presenceUpdate", callback: presenceUpdateCallback): void
    on(eventName: "userUpdate", callback: userUpdateCallback): void
    on(eventName: "userSettingsUpdate", callback: userSettingsUpdateCallback): void
    on(eventName: "guildCreate", callback: guildCreateCallback): void
    on(eventName: "guildUpdate", callback: guildUpdateCallback): void
    on(eventName: "guildDelete", callback: guildDeleteCallback): void
    on(eventName: "guildMemberAdd", callback: guildMemberAddCallback): void
    on(eventName: "guildMemberUpdate", callback: guildMemberUpdateCallback): void
    on(eventName: "guildMemberRemove", callback: guildMemberRemoveCallback): void
    on(eventName: "guildRoleCreate", callback: guildRoleCreateCallback): void
    on(eventName: "guildRoleUpdate", callback: guildRoleUpdateCallback): void
    on(eventName: "guildRoleDelete", callback: guildRoleDeleteCallback): void
    on(eventName: "channelCreate", callback: channelCreateCallback): void
    on(eventName: "channelUpdate", callback: channelUpdateCallback): void
    on(eventName: "channelDelete", callback: channelDeleteCallback): void
    on(eventName: "voiceStateUpdate", callback: voiceStateUpdateCallback): void
    on(eventName: "voiceServerUpdate", callback: voiceServerUpdateCallback): void
    on(eventName: "guildMembersChunk", callback: guildMembersChunkCallback): void
    on(eventName: string, callback: Function): void

    /**
     * CLIENT
     */
    // Connection
    connect(): void
    disconnect(): void

    // User Information
    editUserInfo(options: editUserInfoOpts, callback?: callbackFunc): void
    setPresence(options: setPresenceOpts): void
    getOauthInfo(callback: callbackFunc): void
    getAccountSettings(callback: callbackFunc): void

    // Miscellaneous
    getOfflineUsers(callback: Function): void
    fixMessage(message: string): void

    /**
     * SERVERS
     */
    createServer(options: createServerOpts, callback?: callbackFunc): void
    editServer(options: editServerOpts, callback?: callbackFunc): void
    leaveServer(channelID: string, callback?: callbackFunc): void
    deleteServer(channelID: string, callback?: callbackFunc): void
    transferOwnership(options: Object, callback?: callbackFunc): void
    acceptInvite(inviteCode: string, callback?: callbackFunc): void
    createInvite(options: createInviteOpts, callback: Function): void
    deleteInvite(inviteCode: string, callback?: callbackFunc): void
    queryInvite(inviteCode: string, callback: Function): void

    /**
     * CHANNELS
     */
    sendMessage(options: sendMessageOpts, callback?: callbackFunc): void
    uploadFile(options: uploadFileOpts, callback?: callbackFunc): void
    getMessage(options: getMessageOpts, callback?: callbackFunc): void
    getMessages(options: getMessagesOpts, callback?: callbackFunc): void
    editMessage(options: editMessageOpts, callback?: callbackFunc): void
    simulateTyping(channelID: string, callback?: callbackFunc): void
    deleteMessages(options: deleteMessagesOpts, callback?: callbackFunc): void
    deleteMessage(options: deleteMessageOpts, callback?: callbackFunc): void
    pinMessage(options: pinMessageOpts, callback?: callbackFunc): void
    deletePinnedMessage(options: deletePinnedMessageOpts, callback?: callbackFunc): void
    getPinnedMessages(options: getPinnedMessagesOpts, callback?: callbackFunc): void

    /**
     * VOICE CHANNELS
     */
    joinVoiceChannel(channelID: string, callback?: callbackFunc): void
    leaveVoiceChannel(channelID: string, callback?: callbackFunc): void
    getAudioContext(channelID: string, callback: (error, stream) => void): void

    /**
     * USERS
     */
    createDMChannel(userID: string, callback?: callbackFunc): void
    editNickname(options: editNicknameOpts, callback?: callbackFunc): void
    addToRole(options: addAndRemoveFromRole, callback?: callbackFunc): void
    removeFromRole(options: addAndRemoveFromRole, callback?: callbackFunc): void
    moveUserTo(options: moveUserToOpts): void
    kick(options: actionsOnUserOpts, callback?: callbackFunc): void
    ban(options: banUserOpts, callback?: callbackFunc): void
    unban(options: actionsOnUserOpts, callback?: callbackFunc): void
    mute(options: actionsOnUserOpts, callback?: callbackFunc): void
    unmute(options: actionsOnUserOpts, callback?: callbackFunc): void
    deafen(options: actionsOnUserOpts, callback?: callbackFunc): void
    undeafen(options: actionsOnUserOpts, callback?: callbackFunc): void

    // Methods that are not in GitBooks

    //v2
    editChannelPermissions(options: editChannelPermissionsOpts, callback?: callbackFunc): void

    editServerWidget(options: editServerWidgetOpts, callback?: callbackFunc): void

    addServerEmoji(options: addServerEmojiOpts, callback?: callbackFunc): void
    editServerEmoji(options: editServerEmojiOpts, callback?: callbackFunc): void
    deleteServerEmoji(options: deleteServerEmojiOpts, callback?: callbackFunc): void

    editNote(options: editNoteOpts, callback?: callbackFunc): void
    getMember(options: getMemberOpts, callback?: callbackFunc): void
    getMembers(options: getMembersOpts, callback?: callbackFunc): void
    getAllUsers(callback: callbackFunc): void

    /**
     * CHANNELS
     */
    createChannel(options: createChannelOpts, callback?: callbackFunc): void
    deleteChannel(channelID: string, callback?: callbackFunc): void
    editChannelInfo(options: editChannelInfoOpts, callback?: callbackFunc): void
    deleteChannelPermission(options: deleteChannelPermissionOpts, callback?: callbackFunc): void

    /**
    * ROLES
    */
    createRole(serverID: string, callback?: (error: cbError, response: Role) => any): void
    editRole(options: editRoleOpts, callback?: callbackFunc): void
    deleteRole(options: deleteRoleOpts, callback?: callbackFunc): void

    /**
     * INVITES
     */
    getServerInvites(serverID: string, callback: Function): void
    getChannelInvites(channelID: string, callback: Function): void
    getBans(serverID: string, callback?: callbackFunc): void
  }

  export class OAuth {

  }

  export class Codes {
    WebSocket: {
      "4000": "Unknown Error",
      "4001": "Unknown Opcode",
      "4002": "Decode Error",
      "4003": "Not Authenticated",
      "4004": "Authentication Failed",
      "4005": "Already Authenticated",
      "4006": "Session Not Valid",
      "4007": "Invalid Sequence number",
      "4008": "Rate Limited",
      "4009": "Session Timeout",
      "4010": "Invalid Shard"
    }
  }

  export interface Colors {
		DEFAULT: number;
		AQUA: number;
		GREEN: number;
		BLUE: number;
		PURPLE: number;
		GOLD: number;
		ORANGE: number;
		RED: number;
		GREY: number;
		DARKER_GREY: number;
		NAVY: number;
		DARK_AQUA: number;
		DARK_GREEN: number;
		DARK_BLUE: number;
		DARK_PURPLE: number;
		DARK_GOLD: number;
		DARK_ORANGE: number;
		DARK_RED: number;
		DARK_GREY: number;
		LIGHT_GREY: number;
		DARK_NAVY: number;
	}

  export interface Permissions {
		GENERAL_CREATE_INSTANT_INVITE: number;
		GENERAL_KICK_MEMBERS: number;
		GENERAL_BAN_MEMBERS: number;
		GENERAL_ADMINISTRATOR: number;
		GENERAL_MANAGE_CHANNELS: number;
		GENERAL_MANAGE_GUILD: number;
		GENERAL_MANAGE_ROLES: number;
		GENERAL_MANAGE_NICKNAMES: number;
		GENERAL_CHANGE_NICKNAME: number;
        GENERAL_MANAGE_EMOJIS: number;

		TEXT_READ_MESSAGES: number;
		TEXT_SEND_MESSAGES: number;
		TEXT_SEND_TTS_MESSAGE: number;
		TEXT_MANAGE_MESSAGES: number;
		TEXT_EMBED_LINKS: number;
		TEXT_ATTACH_FILES: number;
		TEXT_READ_MESSAGE_HISTORY: number;
		TEXT_MENTION_EVERYONE: number;
		TEXT_EXTERNAL_EMOJIS: number;

		VOICE_CONNECT: number;
		VOICE_SPEAK: number;
		VOICE_MUTE_MEMBERS: number;
		VOICE_DEAFEN_MEMBERS: number;
		VOICE_MOVE_MEMBERS: number;
		VOICE_USE_VAD: number;

        UNKNOWN_29: number;
	}
}

export = Discord;
