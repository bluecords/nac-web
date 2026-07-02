import { Channel, Message } from "stoat.js";

/**
 * Fetch (nearly) all messages in a channel by paging with a `before` cursor.
 *
 * The forum views derive their post list and each post's replies by scanning
 * the channel's messages. A single `fetchMessages()` only returns the most
 * recent page (default limit), so any post whose root — or reply — falls
 * outside that window was silently dropped (e.g. a migrated forum showing only
 * 3 of 10 posts). Page through instead. Capped at MAX_PAGES so a very large
 * channel can't spin forever; older content beyond the cap won't appear (a
 * v1 limitation — a root-only backend query would be the real fix).
 */
const MAX_PAGES = 50;

export async function fetchAllMessages(channel: Channel): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await channel.fetchMessages({
      sort: "Latest",
      limit: 100,
      ...(before ? { before } : {}),
    });
    all.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  return all;
}
