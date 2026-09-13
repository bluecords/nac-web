import { createStore, reconcile } from "solid-js/store";
import type { ServerMember } from "stoat.js";

/**
 * Role edits for one member, applied in order and never from a stale list.
 *
 * WHY THIS EXISTS. Bunjie watched role grants he made "keep changing"
 * (2026-09-12). Measured on the dev sandbox with request logging: quick ticks
 * on the Members page sent correct saves, but after the first one the server
 * answered 429 - member edits shared the 5-per-10s `servers` ratelimit bucket
 * with the page's own loading - and the client dropped them. The box stayed
 * ticked; the role was never saved. (The server now gives member routes their
 * own bucket too.)
 *
 * Two hazards handled here: the API only accepts a member's COMPLETE role
 * list, so saves must never be built from the client's last-known copy while
 * another save is in flight; and a ratelimited save must wait and retry, not
 * vanish. So: keep the list the user has asked for locally (the next tick
 * builds on it and the checkbox shows it), send saves one at a time per
 * member with the latest list, and retry after `retry_after` on a 429.
 */

const [wanted, setWanted] = createStore<Record<string, string[] | undefined>>({});
const queues = new Map<string, Promise<void>>();

const keyOf = (member: ServerMember) => `${member.id.server}:${member.id.user}`;

/** Milliseconds to wait if `error` is a ratelimit response, else undefined. */
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
 * The roles this member has, including edits still being saved.
 */
export function memberRoles(member: ServerMember): string[] {
  return wanted[keyOf(member)] ?? member.roles;
}

/**
 * Give or take one role, queued behind any save already in flight for this member.
 */
export function setMemberRole(
  member: ServerMember,
  roleId: string,
  on: boolean,
): Promise<void> {
  const key = keyOf(member);
  const current = memberRoles(member);
  if (current.includes(roleId) === on) return queues.get(key) ?? Promise.resolve();

  const next = on ? [...current, roleId] : current.filter((r) => r !== roleId);
  setWanted(key, reconcile(next));

  const run = (queues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      // Always the newest wanted list, so a burst of ticks collapses into
      // saves that each include everything asked for so far.
      // A 429 is not a failure, it is "not yet". stoat-api throws the response
      // body as raw TEXT (not parsed - see its request()), and a ratelimit
      // body is JSON carrying `retry_after` in milliseconds.
      // Before this, a save refused for speed was simply dropped - the box
      // stayed ticked and the role never saved.
      for (let attempt = 0; ; attempt++) {
        const roles = (wanted[key] ?? member.roles).filter((r) =>
          member.server ? member.server.roles.has(r) : true,
        );
        try {
          await member.edit({ roles });
          return;
        } catch (error) {
          const wait = retryAfter(error);
          if (wait === undefined || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, wait + 250));
        }
      }
    });

  queues.set(key, run);

  return run
    .catch((error) => {
      // A failed save: forget the local list so the UI falls back to what
      // the server really has, then let the caller show the error.
      if (queues.get(key) === run) setWanted(key, undefined);
      throw error;
    })
    .then(() => {
      if (queues.get(key) === run) {
        queues.delete(key);
        setWanted(key, undefined);
      }
    });
}
