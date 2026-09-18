import type { Message } from "stoat.js";

import type { ForumReadRecord } from "./ForumReads";

/**
 * Per-post unread state.
 */
export type UnreadEntry = {
  isNew: boolean;
  newReplies: number;
  mentioned: boolean;
};

/**
 * Per-post activity the member has not seen yet, measured against `record`.
 *
 * A post is new if the post itself arrived after its cutoff, or any reply to
 * it did. ULIDs sort chronologically, so a plain string compare is the entire
 * test - no timestamps to parse and no clock to trust.
 *
 * Pure and framework-free on purpose: this is the function the "leave and
 * come back" trap has to be proven against, so the tested code and the
 * shipped code have to be the same function, not a re-description of it.
 */
export function computeUnreadInfo(
  messages: Message[],
  record: ForumReadRecord | undefined,
): Map<string, UnreadEntry> {
  const info = new Map<string, UnreadEntry>();
  if (!record || !record.floor) return info;

  const ids = new Set(
    messages.filter((m) => m.forumTitle).map((post) => post.id),
  );
  const mentioned = new Set(record.mentioned);

  // Each post has its own cutoff: whatever the member last saw IN that post,
  // or the channel floor if they have never opened it.
  const cutoffFor = (postId: string) => {
    const seen = record.seen[postId];
    return seen && seen.localeCompare(record.floor) > 0 ? seen : record.floor;
  };

  const entryFor = (postId: string) => {
    let entry = info.get(postId);
    if (!entry) {
      entry = {
        isNew: false,
        newReplies: 0,
        mentioned: mentioned.has(postId),
      };
      info.set(postId, entry);
    }
    return entry;
  };

  for (const postId of mentioned) {
    if (ids.has(postId)) entryFor(postId).isNew = true;
  }

  for (const message of messages) {
    if (message.forumTitle) {
      if (message.id.localeCompare(cutoffFor(message.id)) > 0) {
        entryFor(message.id).isNew = true;
      }
      continue;
    }

    // Only replies pointing at an actual post count towards that post - a
    // reply to a reply would otherwise create a phantom entry keyed on a
    // message that never appears in the list.
    for (const replyId of message.replyIds ?? []) {
      if (!ids.has(replyId)) continue;
      if (message.id.localeCompare(cutoffFor(replyId)) > 0) {
        const entry = entryFor(replyId);
        entry.newReplies += 1;
        entry.isNew = true;
      }
    }
  }

  return info;
}

/**
 * Whether every post `info` covers is read - the signal the floor-advance
 * effect uses to collapse per-post state back into a single cutoff.
 */
export function isChannelFullyRead(info: Map<string, UnreadEntry>): boolean {
  for (const entry of info.values()) {
    if (entry.isNew) return false;
  }
  return true;
}
