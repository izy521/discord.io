declare namespace Discord {
  /**
  * Misc argument types
  */
  export type region = "brazil" | "frankfurt" | "amsterdam" | "london" | "singapore" | "us-east" | "us-central" | "us-south" | "us-west" | "sydney";

  export type userStatus = "online" | "idle" | "offline";

  export type callbackFunc = (error: cbError, response) => any;

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
    region
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
    region;
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
    // TODO: specify callback parameters
    on(eventName: string, callback: Function)

    /**
     * CLIENT
     */
    // Connection
    connect()
    disconnect()

    // User Information
    editUserInfo(options: editUserInfoOpts, callback?: callbackFunc)
    setPresence(options: setPresenceOpts)
    getOauthInfo(callback: callbackFunc)
    getAccountSettings(callback: callbackFunc)

    // Miscellaneous
    getOfflineUsers(callback: Function)
    fixMessage(message: string)
    setGlobalRequestDelay(delay: number)

    /**
     * SERVERS
     */
    createServer(options: createServerOpts, callback?: callbackFunc)
    editServer(options: editServerOpts, callback?: callbackFunc)

    // 4 below not in gitbook
    deleteServer(channelID: string, callback?: callbackFunc)
    leaveServer(channelID: string, callback?: callbackFunc)
    transferOwnership(options: Object, callback?: callbackFunc)

    listBans(options: Object, callback?: callbackFunc)

    /**
     * CHANNELS
     */
    // 3 below not in gitbook
    createChannel(options: createChannelOpts, callback?: callbackFunc)
    deleteChannel(channelID: string, callback?: callbackFunc)
    editChannelInfo(options: editChannelInfoOpts, callback?: callbackFunc)

    sendMessage(options: sendMessageOpts, callback?: callbackFunc)
    uploadFile(options: uploadFileOpts, callback?: callbackFunc)
    getMessages(options: getMessagesOpts, callback?: callbackFunc)
    editMessage(options: editMessageOpts, callback?: callbackFunc)
    simulateTyping(channelID: string, callback?: callbackFunc)
    deleteMessages(options: deleteMessagesOpts, callback?: callbackFunc)
    deleteMessage(options: deleteMessageOpts, callback?: callbackFunc)

    /**
     * VOICE CHANNELS
     */
    joinVoiceChannel(channelID: string, callback?: callbackFunc)
    leaveVoiceChannelVoiceChannel(channelID: string, callback?: callbackFunc)
    getAudioContext(channelID: string, callback: Function)

    /**
     * USERS
     */
    createDMChannel(userID: string, callback?: callbackFunc)
    addToRole(options: addAndRemoveFromRole, callback?: callbackFunc)
    removeFromRole(options: addAndRemoveFromRole, callback?: callbackFunc)
    moveUserTo(options: moveUserToOpts)

    kick(options: actionsOnUserOpts, callback?: callbackFunc)
    ban(options: banUserOpts, callback?: callbackFunc)
    unban(options: actionsOnUserOpts, callback?: callbackFunc)
    mute(options: actionsOnUserOpts, callback?: callbackFunc)
    unmute(options: actionsOnUserOpts, callback?: callbackFunc)
    deafen(options: actionsOnUserOpts, callback?: callbackFunc)
    undeafen(options: actionsOnUserOpts, callback?: callbackFunc)

    // not in gitbook
    editNickname(options: editNicknameOpts, callback?: callbackFunc)

    // Below is not is gitbook
    /**
    * ROLES
    */
    createRole(serverID: string, callback?: (error: cbError, response: Role) => any)
    editRole(options: editRoleOpts, callback?: callbackFunc)
    deleteRole(options: deleteRoleOpts, callback?: callbackFunc)

    /**
     * INVITES
     */
    acceptInvite(inviteCode: string, callback?: callbackFunc)
    createInvite(options: createInviteOpts, callback: Function)
    deleteInvite(inviteCode: string, callback?: callbackFunc)
    queryInvite(inviteCode: string, callback: Function)
    listServerInvites(serverID: string, callback: Function)
    listChannelInvites(channelID: string, callback: Function)
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

declare module 'discord.io' {
  export = Discord;
}