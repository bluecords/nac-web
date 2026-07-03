import { Channel, Client, Message } from "stoat.js";

/**
 * Fetch just the forum root posts (messages carrying a `forum_title`) in a
 * channel, paging with a `before` cursor.
 *
 * Uses the backend `forum_root` filter so replies are never fetched - the
 * efficient replacement for `fetchAllMessages`, which pulled every message
 * (replies included) just to derive the post list.
 *
 * `forum_root` is a new query param that stoat-api's generated client doesn't
 * know about yet (nac-server#10). Its request builder only forwards params in a
 * route's known query allow-list and drops the rest, so passing `forum_root`
 * through `channel.fetchMessages()` would silently strip it. Until stoat-api is
 * regenerated we build the path (with query) by hand and hydrate the result
 * the same way `fetchMessages` does. TODO: switch to the typed call once
 * stoat-api carries `forum_root`.
 */
const MAX_PAGES = 50;

// The raw API message shape `client.messages.getOrCreate` expects (stoat-api's
// APIMessage), derived so the hand-built request stays type-safe.
type RawMessage = Parameters<Client["messages"]["getOrCreate"]>[1];

export async function fetchForumPosts(
  client: Client,
  channel: Channel,
): Promise<Message[]> {
  const api = client.api as unknown as {
    get: (path: string) => Promise<RawMessage[]>;
  };

  const all: Message[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      forum_root: "true",
      sort: "Latest",
      limit: "100",
    });
    if (before) query.set("before", before);

    const batch = await api.get(
      `/channels/${channel.id}/messages?${query.toString()}`,
    );

    for (const message of batch) {
      all.push(client.messages.getOrCreate(message._id, message));
    }

    if (batch.length < 100) break;
    before = batch[batch.length - 1]._id;
  }

  return all;
}
