/**
 * Logic for the "People" panel on a channel's access screen: letting an admin
 * give specific people a channel without handing them admin rights.
 *
 * WHY ROLES. A channel only stores a default and one setting per ROLE; there
 * are no per-person overrides. So each private channel gets one plain access
 * role ("Access: <channel>") that allows normal participation in that channel
 * and nothing else. Adding a person gives them the role; removing takes it
 * away. One place answers "who can see this channel?", and the people involved
 * never get server-wide or moderator powers from it (decided 2026-10-29).
 */

/** Marks the hidden role that belongs to a channel. */
export const ACCESS_ROLE_PREFIX = "Access: ";

/** Role names are limited to 32 characters. */
const MAX_ROLE_NAME = 32;

/**
 * What the access role allows in its channel: view, read history, send,
 * embeds, uploads and reactions. Deliberately NOT: manage channel / messages /
 * webhooks / permissions, invite others, bypass slowmode, mention everyone.
 */
export const PARTICIPATION_ALLOW =
  (1n << 20n) | // View Channel
  (1n << 21n) | // Read Message History
  (1n << 22n) | // Send Messages
  (1n << 26n) | // Send Embeds
  (1n << 27n) | // Upload Files
  (1n << 29n); // React

/** Name for a new access role. */
export function accessRoleName(channelName: string): string {
  return (ACCESS_ROLE_PREFIX + channelName).slice(0, MAX_ROLE_NAME);
}

/**
 * The access role that already belongs to this channel, if any: an
 * "Access: ..." role that has a setting on this channel. (Matched by having a
 * channel setting rather than by name, so renaming the channel never orphans
 * it.)
 */
export function findAccessRole<R extends { id: string; name: string }>(
  roles: R[],
  channelRoleIds: string[],
): R | undefined {
  const have = new Set(channelRoleIds);
  return roles.find(
    (role) => role.name.startsWith(ACCESS_ROLE_PREFIX) && have.has(role.id),
  );
}

/** Minimal member shape the search needs. */
export type Searchable = {
  id: { user: string };
  displayName?: string | null;
  user?: { username?: string | null } | null;
};

/**
 * People who could be added: not already holding the access role, matching
 * the search text on name, username or id. Empty search returns nobody (the
 * list is only for finding someone), capped so the panel stays short.
 */
export function addCandidates<M extends Searchable>(
  members: M[],
  holderIds: Set<string>,
  query: string,
  limit = 8,
): M[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return members
    .filter((m) => !holderIds.has(m.id.user))
    .filter(
      (m) =>
        (m.displayName ?? "").toLowerCase().includes(q) ||
        (m.user?.username ?? "").toLowerCase().includes(q) ||
        m.id.user.toLowerCase() === q,
    )
    .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""))
    .slice(0, limit);
}
