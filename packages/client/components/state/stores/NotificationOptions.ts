import { Accessor, createMemo } from "solid-js";

import { Channel, Server } from "stoat.js";

import { AbstractStore } from ".";
import { State } from "..";

/**
 * Possible notification states
 */
export type NotificationState = "all" | "mention" | "none";

/**
 * Possible notification states
 */
const NotificationStates: NotificationState[] = ["all", "mention", "none"];

/**
 * Default notification states for various types of channels
 */
export const DEFAULT_STATES: {
  [key in Channel["type"]]: NotificationState;
} = {
  SavedMessages: "all",
  DirectMessage: "all",
  Group: "all",
  TextChannel: undefined!,
  ForumChannel: undefined!,
};

/**
 * Default state for servers
 */
export const DEFAULT_SERVER_STATE: NotificationState = "mention";

export interface MuteState {
  until?: number;
}

export interface TypeNotificationOptions {
  /**
   * Per-server settings
   */
  server: Record<string, NotificationState | undefined>;

  /**
   * Per-category settings (a category's channels follow it unless they
   * have a setting of their own)
   */
  category: Record<string, NotificationState | undefined>;

  /**
   * Per-channel settings
   */
  channel: Record<string, NotificationState | undefined>;

  /**
   * Server mute settings
   */
  server_mutes: Record<string, MuteState | undefined>;

  /**
   * Category mute settings
   */
  category_mutes: Record<string, MuteState | undefined>;

  /**
   * Channel mute settings
   */
  channel_mutes: Record<string, MuteState | undefined>;
}

/**
 * Manages the user's notification preferences.
 */
export class NotificationOptions extends AbstractStore<
  "notifications",
  TypeNotificationOptions
> {
  #now: Accessor<number>;

  /**
   * Construct new Experiments store.
   */
  constructor(state: State) {
    super(state, "notifications");

    // update every minute
    this.#now = createMemo(() => +state.datePerMinute());
  }

  /**
   * Get this store's value
   *
   * Reexported to allow equals checking for syncing
   */
  get() {
    return super.get();
  }

  /**
   * Hydrate external context
   */
  hydrate(): void {
    /** nothing needs to be done */
  }

  /**
   * Generate default values
   */
  default(): TypeNotificationOptions {
    return {
      server: {},
      category: {},
      channel: {},
      server_mutes: {},
      category_mutes: {},
      channel_mutes: {},
    };
  }

  /**
   * Validate the given data to see if it is compliant and return a compliant object
   */
  clean(input: Partial<TypeNotificationOptions>): TypeNotificationOptions {
    const server: TypeNotificationOptions["server"] = {};
    const category: TypeNotificationOptions["category"] = {};
    const channel: TypeNotificationOptions["channel"] = {};
    const server_mutes: TypeNotificationOptions["server_mutes"] = {};
    const category_mutes: TypeNotificationOptions["category_mutes"] = {};
    const channel_mutes: TypeNotificationOptions["channel_mutes"] = {};

    if (typeof input.server === "object") {
      for (const serverId of Object.keys(input.server)) {
        const entry = input.server[serverId];

        // migrate legacy muted channels to new dict.
        if ((entry as unknown) === "muted") {
          server_mutes[serverId] = {};
        }

        if (entry && NotificationStates.includes(entry)) {
          server[serverId] = entry;
        }
      }
    }

    if (typeof input.category === "object") {
      for (const categoryId of Object.keys(input.category)) {
        const entry = input.category[categoryId];
        if (entry && NotificationStates.includes(entry)) {
          category[categoryId] = entry;
        }
      }
    }

    if (typeof input.channel === "object") {
      for (const channelId of Object.keys(input.channel)) {
        const entry = input.channel[channelId];

        // migrate legacy muted channels to new dict.
        if ((entry as unknown) === "muted") {
          channel_mutes[channelId] = {};
        }

        if (entry && NotificationStates.includes(entry)) {
          channel[channelId] = entry;
        }
      }
    }

    const now = +new Date();

    if (typeof input.server_mutes === "object") {
      for (const serverId of Object.keys(input.server_mutes)) {
        const entry = input.server_mutes[serverId];
        if (
          entry &&
          (typeof entry.until === "undefined" ||
            (typeof entry.until === "number" && entry.until > now))
        ) {
          server_mutes[serverId] = { until: entry.until };
        }
      }
    }

    if (typeof input.category_mutes === "object") {
      for (const categoryId of Object.keys(input.category_mutes)) {
        const entry = input.category_mutes[categoryId];
        if (
          entry &&
          (typeof entry.until === "undefined" ||
            (typeof entry.until === "number" && entry.until > now))
        ) {
          category_mutes[categoryId] = { until: entry.until };
        }
      }
    }

    if (typeof input.channel_mutes === "object") {
      for (const channelId of Object.keys(input.channel_mutes)) {
        const entry = input.channel_mutes[channelId];
        if (
          entry &&
          (typeof entry.until === "undefined" ||
            (typeof entry.until === "number" && entry.until > now))
        ) {
          channel_mutes[channelId] = { until: entry.until };
        }
      }
    }

    return {
      server,
      category,
      channel,
      server_mutes,
      category_mutes,
      channel_mutes,
    };
  }

  /**
   * Compute the notification state for a given Server
   * @param server Server
   * @returns Notification state
   */
  computeForServer(server?: Server) {
    return server
      ? (this.get().server[server.id] ??
          server.notificationDefaults?.server ??
          DEFAULT_SERVER_STATE)
      : undefined;
  }

  /**
   * Compute the actual notification state for a given Channel.
   *
   * Order: the member's own choice for the channel, then its category, then the
   * whole server; only where they chose nothing, the admin's default for the
   * channel, then the admin's default for the server.
   * @param channel Channel
   * @returns Notification state
   */
  computeForChannel(channel: Channel) {
    const own = this.get().channel[channel.id];
    if (own) return own;

    const categoryId = channel.category?.id;
    const ownCategory = categoryId
      ? this.get().category[categoryId]
      : undefined;
    if (ownCategory) return ownCategory;

    const server = channel.server;
    if (!server) return DEFAULT_STATES[channel.type];

    return (
      this.get().server[server.id] ??
      server.notificationDefaults?.channels?.[channel.id] ??
      server.notificationDefaults?.server ??
      DEFAULT_SERVER_STATE
    );
  }

  /**
   * What a channel gets when the member picks the default for it: their
   * category's choice, else their server choice, else the admin's defaults.
   * @param channel Channel
   * @returns Notification state, and where it comes from
   */
  inheritedForChannel(channel: Channel) {
    const categoryId = channel.category?.id;
    const ownCategory = categoryId
      ? this.get().category[categoryId]
      : undefined;
    if (ownCategory) return { state: ownCategory, from: "category" as const };

    const server = channel.server;
    if (!server)
      return { state: DEFAULT_STATES[channel.type], from: "server" as const };

    const ownServer = this.get().server[server.id];
    if (ownServer) return { state: ownServer, from: "server" as const };

    const adminChannel = server.notificationDefaults?.channels?.[channel.id];
    if (adminChannel) return { state: adminChannel, from: "channel" as const };

    return {
      state: server.notificationDefaults?.server ?? DEFAULT_SERVER_STATE,
      from: "server" as const,
    };
  }

  /**
   * Set notification state for a category
   * @param categoryId Category id
   * @param state State (undefined: follow the server)
   */
  setCategory(categoryId: string, state: NotificationState | undefined) {
    this.set("category", categoryId, state);
  }

  /**
   * Get notification state chosen for a category
   * @param categoryId Category id
   * @returns Chosen state, or undefined if it follows the server
   */
  getCategory(categoryId: string) {
    return this.get().category[categoryId];
  }

  /**
   * Set mute state for a category
   * @param categoryId Category id
   * @param state State
   */
  setCategoryMute(categoryId: string, state: MuteState | undefined) {
    this.set("category_mutes", categoryId, state);
  }

  /**
   * Get muted state for a category
   * @param categoryId Category id
   * @returns Current state
   */
  getCategoryMute(categoryId: string) {
    return this.get().category_mutes[categoryId];
  }

  /**
   * Whether a category is muted
   * @param categoryId Category id
   * @returns Whether it is muted right now
   */
  isCategoryMuted(categoryId: string): boolean {
    const value = this.get().category_mutes[categoryId];
    return !!value && (!value.until || value.until > this.#now());
  }

  /**
   * Set notification state for a server
   * @param server Server
   * @param state State
   */
  setServer(server: Server, state: NotificationState | undefined) {
    this.set("server", server.id, state);
  }

  /**
   * Set mute state for a server
   * @param server Server
   * @param state State
   */
  setServerMute(server: Server, state: MuteState | undefined) {
    this.set("server_mutes", server.id, state);
  }

  /**
   * Get muted state for a server
   * @param server Server
   * @returns Current state
   */
  getServerMute(server: Server) {
    return this.get().server_mutes[server.id];
  }

  /**
   * Set notification state for a channel
   * @param channel Channel
   * @param state State
   */
  setChannel(channel: Channel, state: NotificationState | undefined) {
    this.set("channel", channel.id, state);
  }

  /**
   * Set mute state for a channel
   * @param channel Channel
   * @param state State
   */
  setChannelMute(channel: Channel, state: MuteState | undefined) {
    this.set("channel_mutes", channel.id, state);
  }

  /**
   * Get notification state for a channel
   * @param channel Channel
   * @returns Current state
   */
  getChannel(channel: Channel) {
    return this.get().channel[channel.id];
  }

  /**
   * Get muted state for a channel
   * @param channel Channel
   * @returns Current state
   */
  getChannelMute(channel: Channel) {
    return this.get().channel_mutes[channel.id];
  }

  /**
   * Check whether a Channel or Server is muted (channel will inherit server)
   * @param target Channel or Server
   * @returns Whether this object is muted
   */
  isMuted(target?: Channel | Server): boolean {
    let value: MuteState | undefined;
    if (target instanceof Channel) {
      if (this.isMuted(target.server)) return true;

      // a muted category mutes every channel in it
      const categoryId = target.category?.id;
      if (categoryId && this.isCategoryMuted(categoryId)) return true;

      value = this.get().channel_mutes[target.id];
    } else if (target instanceof Server) {
      value = this.get().server_mutes[target.id];
    }

    return !!value && (!value.until || value.until > this.#now());
  }

  /**
   * Check whether a Channel is muted by itself or by its category (ignoring
   * the server): what unread dots and the sidebar's dimming follow
   * @param channel Channel
   * @returns Whether this channel, or its category, is muted
   */
  isChannelOrCategoryMuted(channel: Channel): boolean {
    const categoryId = channel.category?.id;
    return (
      this.isChannelMuted(channel) ||
      (!!categoryId && this.isCategoryMuted(categoryId))
    );
  }

  /**
   * Check whether a Channel is muted (ignoring server)
   * @param channel Channel
   * @returns Whether this channel is muted
   */
  isChannelMuted(channel: Channel): boolean {
    const value = this.get().channel_mutes[channel.id];
    return !!value && (!value.until || value.until > this.#now());
  }
}
