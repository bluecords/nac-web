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

/** How many times one page is retried after a ratelimit answer before giving up. */
const MAX_RATELIMIT_RETRIES = 6;

/** Milliseconds to wait if `error` is a ratelimit response, else undefined.
 * stoat-api throws the response body as raw TEXT, JSON carrying `retry_after`. */
function retryAfter(error: unknown): number | undefined {
  let body = error;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  const wait = (body as { retry_after?: unknown } | null)?.retry_after;
  return typeof wait === "number" ? wait : undefined;
}

/**
 * One page, waiting out a 429 instead of failing. A channel with a long history
 * needs many pages back to back, and a hard reload (cold caches, everything else
 * loading at once) used to hit the per-channel message limit partway through.
 * The caller treats any error as an empty forum, so the member saw "No posts
 * yet" until a normal refresh happened to be gentler. Reported 2026-10-16.
 */
async function fetchPage(channel: Channel, before: string | undefined) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await channel.fetchMessages({
        sort: "Latest",
        limit: 100,
        ...(before ? { before } : {}),
      });
    } catch (error) {
      const wait = retryAfter(error);
      if (wait === undefined || attempt >= MAX_RATELIMIT_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, wait + 50));
    }
  }
}

export async function fetchAllMessages(channel: Channel): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchPage(channel, before);
    all.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  return all;
}
