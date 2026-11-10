/**
 * Client for the Member Feeds API (the `NAC Content - Member Feeds` n8n workflow).
 *
 * Every call carries the caller's NAC session token. The workflow verifies it
 * against NAC itself, reads the caller's server roles, and decides what they may
 * do; nothing here is the access control, it only shapes the request. Who may add
 * feeds, which channels are allowed, and who owns a feed are all enforced there.
 */
export const MEMBER_FEEDS_ENDPOINT =
  "https://automate.bluecords.solutions/webhook/member-feeds";

export type MemberFeed = {
  id: string;
  label: string;
  url: string;
  channelId: string;
  /** NAC user id credited with an @mention on each post, or null for none. */
  ownerId: string | null;
  enabled: boolean;
  createdAt: string | null;
};

export type AllowedChannel = { id: string; name: string };

export type MemberFeedsState = {
  me: { id: string; isAdmin: boolean };
  maxPerMember: number;
  allowedChannels: AllowedChannel[];
  feeds: MemberFeed[];
};

export type MemberFeedsAction =
  | { action: "get" }
  | {
      action: "add";
      label: string;
      url: string;
      channelId: string;
      ownerId?: string;
    }
  | {
      action: "update";
      id: string;
      label?: string;
      enabled?: boolean;
      channelId?: string;
      ownerId?: string | null;
    }
  | { action: "remove"; id: string }
  | { action: "setChannels"; channels: AllowedChannel[] };

export async function callMemberFeeds(
  token: string | undefined,
  body: MemberFeedsAction,
): Promise<MemberFeedsState> {
  if (!token) throw new Error("Not signed in.");
  const res = await fetch(MEMBER_FEEDS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as MemberFeedsState;
}
