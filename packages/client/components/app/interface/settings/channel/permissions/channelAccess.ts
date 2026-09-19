import type { Client, Server, ServerRole } from "stoat.js";

export type RoleClass = "admin" | "member" | "free";

export const ROLE_CLASSES: RoleClass[] = ["admin", "member", "free"];

export const CLASS_LABEL: Record<RoleClass, string> = {
  admin: "Admin",
  member: "Member",
  free: "Free",
};

/**
 * Permissions that make sense on a single channel: View Channel through
 * Bypass Slowmode (bits 20-39). Server-wide powers (Manage Server, Kick, Ban,
 * ...) are never copied onto a channel.
 */
export const CHANNEL_SCOPE = ((1n << 40n) - 1n) & ~((1n << 20n) - 1n);

type AllowDeny = { a: bigint; d: bigint };

/**
 * What a role already grants in a channel, from its own settings plus its
 * class (bits the role sets itself win, the rest follow the class).
 *
 * Only allowed permissions are copied. A server-wide deny stays a server-wide
 * deny: copying it onto the channel would apply it later in the calculation
 * and could override a channel that deliberately re-grants the permission.
 */
export function roleChannelDefaults(
  server: Server,
  role: ServerRole,
): AllowDeny {
  const own: AllowDeny = {
    a: BigInt(role.permissions?.a ?? 0),
    d: BigInt(role.permissions?.d ?? 0),
  };

  let blended = own;
  if (role.class) {
    const cd = server.getClassDefault(role.class).permissions;
    const touched = own.a | own.d;
    blended = {
      a: (cd.a & ~touched) | own.a,
      d: (cd.d & ~touched) | own.d,
    };
  }

  return { a: blended.a & CHANNEL_SCOPE & ~blended.d, d: 0n };
}

/**
 * The per-channel template a class gets when it is switched on for a channel:
 * the class's own allowed channel-level permissions.
 */
export function classChannelTemplate(
  server: Server,
  roleClass: RoleClass,
): AllowDeny {
  const cd = server.getClassDefault(roleClass).permissions;
  return { a: cd.a & CHANNEL_SCOPE & ~cd.d, d: 0n };
}

export function classFollowsChannel(
  server: Server,
  roleClass: RoleClass,
  channelId: string,
) {
  return server.getClassDefault(roleClass).channelOverrides.has(channelId);
}

type RawClassDefault = {
  permissions: { a: number; d: number };
  channel_overrides?: Record<string, { a: number; d: number }>;
  max_message_length?: number | null;
};

/**
 * Switch classes on or off for one channel.
 *
 * The server replaces the whole class map on every save, so this starts from
 * what the server holds RIGHT NOW (not the locally cached copy, which may be
 * behind another admin's edit), changes only the requested channel entries,
 * and sends everything else back untouched. Classes the server has never
 * stored are left unstored unless they are being switched on.
 */
export async function setClassChannelTemplates(
  client: Client,
  server: Server,
  channelId: string,
  changes: Partial<Record<RoleClass, AllowDeny | null>>,
) {
  // The generated route types predate class_defaults, so read this one loosely.
  const api = client.api as unknown as {
    get(path: string): Promise<{
      class_defaults?: Record<string, RawClassDefault>;
    }>;
  };
  const fresh = await api.get(`/servers/${server.id}`);

  const all: Record<string, RawClassDefault> = {};
  for (const [cls, stored] of Object.entries(fresh.class_defaults ?? {})) {
    all[cls] = {
      ...stored,
      channel_overrides: { ...(stored.channel_overrides ?? {}) },
    };
  }

  for (const cls of ROLE_CLASSES) {
    if (!(cls in changes)) continue;
    const change = changes[cls];

    if (!all[cls]) {
      if (!change) continue;
      const builtIn = server.getClassDefault(cls);
      all[cls] = {
        permissions: {
          a: Number(builtIn.permissions.a),
          d: Number(builtIn.permissions.d),
        },
        channel_overrides: {},
        max_message_length: builtIn.maxMessageLength,
      };
    }

    const overrides = all[cls].channel_overrides!;
    if (change) {
      overrides[channelId] = { a: Number(change.a), d: Number(change.d) };
    } else {
      delete overrides[channelId];
    }
  }

  await server.setClassDefaults(
    all as unknown as Parameters<Server["setClassDefaults"]>[0],
  );
}

/**
 * The server answers "slow down" with a body carrying `retry_after` (seconds).
 * That is the only failure worth waiting out; anything else is a real error.
 */
function retryAfterMs(error: unknown): number | undefined {
  const seconds = (error as { retry_after?: unknown } | undefined)?.retry_after;
  return typeof seconds === "number"
    ? Math.ceil(seconds * 1000) + 250
    : undefined;
}

/**
 * Run requests one after another. Waits and retries when the server says to
 * slow down; any other error stops the run and is thrown, with how far it got.
 */
export async function inSequence<T>(
  items: T[],
  action: (item: T) => Promise<unknown>,
): Promise<{ done: number }> {
  let done = 0;

  for (const item of items) {
    for (let attempt = 0; ; attempt++) {
      try {
        await action(item);
        break;
      } catch (error) {
        const wait = retryAfterMs(error);
        if (wait === undefined || attempt >= 5) {
          throw Object.assign(
            error instanceof Error ? error : new Error(JSON.stringify(error)),
            { partial: `${done} of ${items.length} done before this stopped` },
          );
        }
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    done++;
  }

  return { done };
}
