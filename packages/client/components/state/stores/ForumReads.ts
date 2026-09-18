import { State } from "..";

import { AbstractStore } from ".";

/**
 * What this member has already read in one forum channel.
 */
export type ForumReadRecord = {
  /**
   * Everything at or before this message id is read.
   *
   * Seeded from the channel's own read marker the first time the member opens
   * the forum, so a first visit does not light up every post that has ever
   * been written in it.
   */
  floor: string;

  /**
   * Posts read past the floor: post id -> the newest activity seen in it.
   *
   * Only posts with activity ABOVE the floor need an entry - anything below is
   * already covered - so this self-prunes as the floor advances rather than
   * growing with the age of the channel.
   */
  seen: Record<string, string>;

  /**
   * Posts where this member has been mentioned and has not opened yet.
   *
   * Kept here rather than read from `channel_unreads` each time because the
   * server clears mentions on ack, which happens the moment the forum opens.
   */
  mentioned: string[];
};

export type TypeForumReads = {
  channels: Record<string, ForumReadRecord>;
};

/**
 * Per-post read state for forum channels.
 *
 * WHY THIS EXISTS. Forum unread used to be read straight off the channel's
 * `channel_unreads` row, which holds ONE cutoff for the whole channel. That
 * cannot express "which posts have I read": opening the forum acks the channel,
 * so the cutoff jumps to the newest message and every marker is gone on the
 * next visit whether or not the member read anything. Bunjie caught it the day
 * the markers shipped - "Say 3 new posts and multiple comments on new posts are
 * all gone after I open a single post?" - and the answer was worse than the
 * question: not on opening a post, but on leaving the channel at all.
 *
 * So read state lives here instead, keyed by post.
 *
 * ⚠️ THIS IS PER DEVICE. It is deliberately NOT in `Sync`'s store list: reading
 * a post on a phone will not clear its marker on a desktop. That is a stated
 * limit, not an oversight - syncing it means a settings write per post opened,
 * and the write rate wants measuring against the ratelimiter before it goes
 * anywhere near `user_settings`. The failure mode meanwhile is a stale "New" on
 * a second device, which is the mild direction to be wrong in.
 */
export class ForumReads extends AbstractStore<"forumReads", TypeForumReads> {
  constructor(state: State) {
    super(state, "forumReads");
  }

  hydrate(): void {}

  default(): TypeForumReads {
    return { channels: {} };
  }

  clean(input: Partial<TypeForumReads>): TypeForumReads {
    const channels: Record<string, ForumReadRecord> = {};
    const source =
      input.channels && typeof input.channels === "object" ? input.channels : {};

    for (const [channelId, record] of Object.entries(source)) {
      if (!record || typeof record !== "object") continue;

      const seen: Record<string, string> = {};
      const rawSeen =
        record.seen && typeof record.seen === "object" ? record.seen : {};
      for (const [postId, messageId] of Object.entries(rawSeen)) {
        if (typeof messageId === "string" && messageId) seen[postId] = messageId;
      }

      channels[channelId] = {
        floor: typeof record.floor === "string" ? record.floor : "",
        seen,
        mentioned: Array.isArray(record.mentioned)
          ? record.mentioned.filter((id) => typeof id === "string")
          : [],
      };
    }

    return { channels };
  }

  /**
   * This member's record for a channel, if they have ever opened it.
   */
  record(channelId: string): ForumReadRecord | undefined {
    return this.get().channels[channelId];
  }

  /**
   * Start tracking a channel, taking the channel's own read marker as the
   * floor. Does nothing if the channel is already tracked - the floor must
   * never be re-seeded from an ack, which is the whole bug this replaced.
   */
  seed(channelId: string, floor: string | undefined): void {
    if (this.record(channelId)) return;
    this.set("channels", channelId, {
      floor: floor ?? "",
      seen: {},
      mentioned: [],
    });
  }

  /**
   * Record that a post has been read up to a given point.
   */
  markPostRead(channelId: string, postId: string, activityId: string): void {
    const record = this.record(channelId);
    if (!record) return;
    if (activityId.localeCompare(record.floor) <= 0) return;

    this.set("channels", channelId, "seen", postId, activityId);
    if (record.mentioned.includes(postId)) {
      this.set(
        "channels",
        channelId,
        "mentioned",
        record.mentioned.filter((id) => id !== postId),
      );
    }
  }

  /**
   * Note posts where the member has been mentioned, merging with what is
   * already known - the server hands these over once and then clears them.
   *
   * `activityId` is the id of the message that actually carries the mention
   * (the post's own id for a mention in the post itself, the reply's id for
   * a mention in a reply) - NOT the post's id, which can predate both the
   * floor and anything already read in it while the mention itself is brand
   * new. Comparing the mention's own recency, rather than gating on "has this
   * post ever been opened" or "was this post created before the floor", is
   * what lets a fresh mention re-flag a post the member already read, or an
   * old post that only just received one.
   */
  addMentions(
    channelId: string,
    mentions: { postId: string; activityId: string }[],
  ): void {
    const record = this.record(channelId);
    if (!record) return;

    const merged = new Set(record.mentioned);
    let added = false;
    for (const { postId, activityId } of mentions) {
      // The mention itself predates the floor - already acked away.
      if (activityId.localeCompare(record.floor) <= 0) continue;
      // The mention itself is not newer than what was already read in this
      // post - it was seen along with everything else at the time.
      const seenActivity = record.seen[postId];
      if (seenActivity && activityId.localeCompare(seenActivity) <= 0) {
        continue;
      }
      if (merged.has(postId)) continue;
      merged.add(postId);
      added = true;
    }

    if (added) this.set("channels", channelId, "mentioned", [...merged]);
  }

  /**
   * Everything in the channel is read: raise the floor and drop the per-post
   * entries it now covers. This is what stops `seen` growing without bound.
   */
  markChannelRead(channelId: string, floor: string): void {
    const record = this.record(channelId);
    if (!record) return;
    if (floor.localeCompare(record.floor) <= 0) return;

    const seen: Record<string, string> = {};
    for (const [postId, messageId] of Object.entries(record.seen)) {
      if (messageId.localeCompare(floor) > 0) seen[postId] = messageId;
    }

    this.set("channels", channelId, {
      floor,
      seen,
      mentioned: record.mentioned.filter((id) => !!seen[id]),
    });
  }
}
