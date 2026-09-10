/**
 * Finish an interrupted invite-join, using a code stashed in localStorage
 * rather than the in-memory `layout.nextPath`.
 *
 * THE BUG THIS EXISTS FOR
 * ----------------------
 * `/invite/:code` records the path as `nextPath` IN THE BROWSER TAB. Signup
 * then goes through an emailed verification link — and if that link opens
 * anywhere the original tab's state isn't (the mail app's in-app browser, a
 * second tab, a different browser), `nextPath` is gone. The member lands
 * signed in, in an empty app, and nothing ever tries to add them to the
 * server. `heal-orphan-members.js` sweeps them up on a timer, but Bunjie's
 * point (2026-09-10) stands: it should not happen in the first place.
 *
 * The server does not persist which invite an account used (`/auth/account/
 * create` treats `invite` as a gate check only — confirmed against a live
 * account doc), so this cannot be fixed server-side without forking Stoat.
 *
 * WHAT THIS DOES
 * -------------
 * `rememberPendingInvite(code)` is called the moment a code is seen — when an
 * unauthenticated visitor is bounced from `/invite/:code` to `/login`, and
 * again when the code is submitted on the Create Account form. It writes
 * `{ code, ts }` to localStorage (survives reloads, new tabs, the whole
 * verify round-trip — anything short of a different browser/device).
 *
 * `resumePendingInvite(client)` runs from `<Interface>` on every authenticated
 * load once the client is ready. If a pending code is stored and the member is
 * not already in that server, it joins them and clears the key. Dead/expired
 * codes are cleared too, so it never loops. Cross-device stragglers still fall
 * to the heal timer — a much smaller cohort than "verified in a second tab".
 */

const KEY = "nac::pendingInvite";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let inFlight = false;

/** Stash an invite code to be joined once the member is authenticated. */
export function rememberPendingInvite(code: string | undefined | null): void {
  if (!code || code === "undefined" || code === "null") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, ts: Date.now() }));
  } catch {
    /* private mode / blocked storage — nothing we can do, heal timer covers it */
  }
}

/** Forget any stored pending invite. */
export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function readPendingInvite(): string | undefined {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { code?: unknown; ts?: unknown };
    if (typeof parsed.code !== "string" || !parsed.code) {
      clearPendingInvite();
      return undefined;
    }
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > MAX_AGE_MS) {
      clearPendingInvite();
      return undefined;
    }
    return parsed.code;
  } catch {
    clearPendingInvite();
    return undefined;
  }
}

/**
 * If a pending invite is stored and the member isn't in that server yet, join
 * them. Safe to call repeatedly; a no-op when there's nothing to do.
 *
 * @param client a ready stoat.js Client (has `.user` and `.servers` populated)
 */
export async function resumePendingInvite(client: {
  servers: { has(id: string): boolean };
  api: {
    get(path: string): Promise<unknown>;
    post(path: string): Promise<unknown>;
  };
}): Promise<void> {
  if (inFlight) return;
  const code = readPendingInvite();
  if (!code) return;

  inFlight = true;
  try {
    let serverId: string | undefined;
    try {
      const invite = (await client.api.get(`/invites/${code}`)) as {
        server_id?: string;
      };
      serverId = invite?.server_id;
    } catch (err) {
      // Invalid / expired / revoked invite — never going to work, stop trying.
      console.warn(
        "[resumePendingInvite] invite lookup failed, clearing:",
        code,
        err,
      );
      clearPendingInvite();
      return;
    }

    if (serverId && client.servers.has(serverId)) {
      // Already a member — the join happened some other way. Done.
      clearPendingInvite();
      return;
    }

    try {
      await client.api.post(`/invites/${code}`);
      console.info("[resumePendingInvite] joined via stored invite:", code);
      clearPendingInvite();
    } catch (err) {
      const type = (err as { type?: string })?.type;
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (type === "AlreadyInServer" || status === 409) {
        clearPendingInvite();
        return;
      }
      // Transient (offline, 5xx, rate limit) — keep the key, try again next load.
      console.warn("[resumePendingInvite] join failed, will retry:", code, err);
    }
  } finally {
    inFlight = false;
  }
}
