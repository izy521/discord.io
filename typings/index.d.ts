declare namespace Discord {
  /**
  * Misc argument types
  */
  export type region = "brazil" | "frankfurt" | "amsterdam" | "london" | "singapore" | "us-east" | "us-central" | "us-south" | "us-west" | "sydney";

  export type userStatus = "online" | "idle" | "offline";

  export type callbackFunc = (error: cbError, response: any) => void;

  export type WebSocketEvent = {
    d: any;
    op: number;
    s: number;
    t: string;
  };
  // event callbacks
  export type readyCallback = (event: WebSocketEvent) => void;
  export type messageCallback = (user: string, userID: string, channelID: string, mesage: string, event: WebSocketEvent) => void;
  export type GameObject = {
    name: string;
    type: number;
    url?: string;
  };
  export type presenceCallback = (user: string, userID: string, status: string, game: GameObject, event: WebSocketEvent) => void;
  export type anyCallback = (event: WebSocketEvent) => void;
  export type disconnectCallback = (errMsg: string, code: number) => void;
  // WebSocket event callbacks
  // TODO: add missing types
  export type messageCreateCallback = (username: any, userID: any, channelID: any, message: any, event: WebSocketEvent) => void;
  export type messageUpdate1Callback = (newMsg: any, event: WebSocketEvent) => void;
  export type messageUpdate2Callback = (oldMsg: any, newMsg: any, event: WebSocketEvent) => void;
  export type presenceUpdateCallback = (event: WebSocketEvent) => void;
  export type userUpdateCallback = (event: WebSocketEvent) => void;
  export type userSettingsUpdateCallback = (event: WebSocketEvent) => void;
  export type guildCreateCallback = (server: any, event: WebSocketEvent) => void;
  export type guildUpdateCallback = (oldServer: any, newServer: any, event: WebSocketEvent) => void;
  export type guildDeleteCallback = (server: any, event: WebSocketEvent) => void;
  export type guildMemberAddCallback = (member: any, event: WebSocketEvent) => void;
  export type guildMemberUpdateCallback = (oldMember: any, newMember: any, event: WebSocketEvent) => void;
  export type guildMemberRemoveCallback = (member: any, event: WebSocketEvent) => void;
  export type guildRoleCreateCallback = (role: any, event: WebSocketEvent) => void;
  export type guildRoleUpdateCallback = (oldRole: any, newRole: any, event: WebSocketEvent) => void;
  export type guildRoleDeleteCallback = (role: any, event: WebSocketEvent) => void;
  export type channelCreateCallback = (channel: any, event: WebSocketEvent) => void;
  export type channelUpdateCallback = (oldChannel: any, newChannel: any, event: WebSocketEvent) => void;
  export type channelDeleteCallback = (channel: any, event: WebSocketEvent) => void;
  export type voiceStateUpdateCallback = (event: WebSocketEvent) => void;
  export type voiceServerUpdateCallback = (event: WebSocketEvent) => void;
  export type guildMembersChunkCallback = (event: WebSocketEvent) => void;

  export type colors = "DEFAULT" | "AQUA" | "GREEN" | "BLUE" | "PURPLE" | "GOLD" | "ORANGE" | "RED" | "GREY" | "DARKER_GREY" | "NAVY" | "DARK_AQUA" | "DARK_GREEN" | "DARK_BLUE" | "DARK_PURPLE" | "DARK_GOLD" | "DARK_ORANGE" | "DARK_RED" | "DARK_GREY" | "LIGHT_GREY" | "DARK_NAVY";

  export type channelType = "voice" | "text";

  export interface cbError {
		message?: string,
		statusCode?: string,
		statusMessage?: string,
		response?: string
	}

  export interface cbRes {

  }


  /**
   * Collections types as TypeScript doesn't support them
   */
  export type ServerCollection = { [id: string]: Server };
  export type ChannelCollection = { [id: string]: Channel };
  export type UserCollection = { [id: string]: User };
  export type DMChannelCollection = { [id: string]: DMChannel };
  export type RoleCollection = { [id: string]: Role };
  export type MemberCollection = { [id: string]: Member };

  /**
   * Permissions as boolean mixin (used in Role)
   * Just for autocompletion these are computed properties
   */
  export interface permissions {
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
  export type sendMessageOpts = {
    to: string,
    message: string,
    tts?: boolean,
    nonce?: string,
    typing?: boolean
  }

  export type uploadFileOpts = {
    to: string,
    file: string,
    filename?: string,
    message?: string
  }

  export type getMessagesOpts = {
    channel: string,
    before?: string,
    after?: string,
    limit?: number
  }

  export type editMessageOpts = {
    channel: string,
    messageID: string,
    message: string
  }

  export type deleteMessagesOpts = {
    channel: string,
    messageIDs: string[]
  }

  export type deleteMessageOpts = {
    channel: string,
    messageID: string
  }

  export type createServerOpts = {
    icon: string,
    name: string,
    region: region
  }

  export type editServerOpts = {
    serverID: string,
    name: string,
    icon: string,
    region: region,
    afk_channel_id: string,
    afk_timeout: number
  }

  export type editUserInfoOpts = {
    avatar: string,
    email: string,
    password: string,
    new_password: string,
    username: string
  }

  export type setPresenceOpts = {
    idle_since: any,
    game: string,
    type: number,
    url: string
  }

  export type addAndRemoveFromRole = {
    server: string,
    user: string,
    role: string
  }

  export type moveUserToOpts = {
    server: string,
    user: string,
    channel: string
  }

  export type actionsOnUserOpts = {
    channel: string,
    target: string
  }

  export type banUserOpts = {
    channel: string,
    target: string,
    lastDays?: number
  }

  export type createChannelOpts = {
    server: string,
    type: channelType,
    name: string
  }

  export type editChannelInfoOpts = {
    channel: string,
    name?: string,
    position?: number,
    topic?: string,
    bitrate?: string
  }

  export type createInviteOpts = {
    channel: string,
    max_users: number,
    max_age: number,
    temporary: boolean,
    xkcdpass: boolean
  }

  export type editRoleOpts = {
    server: string,
    role: string,
    name: string,
    hoist: boolean,
    permissions: permissions,
    color: colors
  }

  export type deleteRoleOpts = {
    server: string,
    role: string
  }

  export type editNicknameOpts = {
    nick: string,
    serverID: string,
    userID: string
  }

  /**
   * CLASSES
   */
  export class Ressource {
    id: string;
    creation_time: number;
  }

  export class Server {
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

  export class Channel {
    name: string;
    id: string;
    guild_id: string;
    type: string;
    topic: string;
    position: number;
    permission_overwrites: Object[];
    last_message_id: string;
    members: Object;
  }

  export class DMChannel {
    recipient: Object;
    last_message_id: string;
    id: string;
  }

  export class User {
    username: string;
    id: string;
    discriminator: number;
    avatar: string;
    bot: boolean;
    game: Object;
  }

  export class Member {
    id: string;
    roles: string[];
    mute: boolean;
    joined_at: string;
    deaf: boolean;
    status: userStatus;
    voice_channel_id: string;
  }

  export class Role implements permissions {
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
    setGlobalRequestDelay(delay: number): void

    /**
     * SERVERS
     */
    createServer(options: createServerOpts, callback?: callbackFunc): void
    editServer(options: editServerOpts, callback?: callbackFunc): void

    // 4 below not in gitbook
    deleteServer(channelID: string, callback?: callbackFunc): void
    leaveServer(channelID: string, callback?: callbackFunc): void
    transferOwnership(options: Object, callback?: callbackFunc): void

    listBans(options: Object, callback?: callbackFunc): void

    /**
     * CHANNELS
     */
    // 3 below not in gitbook
    createChannel(options: createChannelOpts, callback?: callbackFunc): void
    deleteChannel(channelID: string, callback?: callbackFunc): void
    editChannelInfo(options: editChannelInfoOpts, callback?: callbackFunc): void

    sendMessage(options: sendMessageOpts, callback?: callbackFunc): void
    uploadFile(options: uploadFileOpts, callback?: callbackFunc): void
    getMessages(options: getMessagesOpts, callback?: callbackFunc): void
    editMessage(options: editMessageOpts, callback?: callbackFunc): void
    simulateTyping(channelID: string, callback?: callbackFunc): void
    deleteMessages(options: deleteMessagesOpts, callback?: callbackFunc): void
    deleteMessage(options: deleteMessageOpts, callback?: callbackFunc): void

    /**
     * VOICE CHANNELS
     */
    joinVoiceChannel(channelID: string, callback?: callbackFunc): void
    leaveVoiceChannelVoiceChannel(channelID: string, callback?: callbackFunc): void
    getAudioContext(channelID: string, callback: Function): void

    /**
     * USERS
     */
    createDMChannel(userID: string, callback?: callbackFunc): void
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

    // not in gitbook
    editNickname(options: editNicknameOpts, callback?: callbackFunc): void

    // Below is not in gitbook
    /**
    * ROLES
    */
    createRole(serverID: string, callback?: (error: cbError, response: Role) => any): void
    editRole(options: editRoleOpts, callback?: callbackFunc): void
    deleteRole(options: deleteRoleOpts, callback?: callbackFunc): void

    /**
     * INVITES
     */
    acceptInvite(inviteCode: string, callback?: callbackFunc): void
    createInvite(options: createInviteOpts, callback: Function): void
    deleteInvite(inviteCode: string, callback?: callbackFunc): void
    queryInvite(inviteCode: string, callback: Function): void
    listServerInvites(serverID: string, callback: Function): void
    listChannelInvites(channelID: string, callback: Function): void
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
}

export = Discord;
