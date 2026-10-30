/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------------
// UPDATES. Read this before changing either line, or the app will silently
// stop updating again.
//
// THE BUG THIS FIXES, measured on a real handset 2026-09-03: a phone was
// running an asset bundle that 404s on the server, with a new worker parked in
// "waiting", while the network served the current build perfectly well.
//
// Why it deadlocked: `strategies: injectManifest` means WE own this file, and
// unlike generateSW the plugin does not inject skipWaiting() into it. Nothing
// here called it, and nothing in the page sent SKIP_WAITING either (under
// registerType "autoUpdate" the generated updateServiceWorker() is a no-op -
// `if (!auto) sendSkipWaitingMessage()`). So every new build installed, moved
// to "waiting", and stayed there until every tab for the origin was closed.
// On a phone that is never. The client was stuck on that build permanently.
//
// Why worker-driven and not a "new version, please refresh" prompt: a prompt
// runs in the OLD page. A client on a stale build - or on a build whose update
// code is itself broken, which is exactly what happened - can never be asked.
// The new worker deciding for itself is the only design that cannot strand
// anyone. Drafts survive the reload (state persists to IndexedDB via
// localforage), so the reload costs nothing a member has typed.
//
// The update banner in Interface.tsx is NOT dead code: the 426 Upgrade
// Required path in serviceWorkerInterface.ts still drives it.
self.skipWaiting();
self.addEventListener("activate", (event) => {
  // Take over already-open pages immediately. registerSW's "activated"
  // listener then reloads them onto the new build.
  event.waitUntil(self.clients.claim());
});
// ---------------------------------------------------------------------------

interface ChannelPartial {
  channel_type: string;
  name?: string;
}

interface StoatPushNotification {
  title?: string;
  author?: string;
  body: string;
  icon?: string;
  channel?: ChannelPartial;
  url?: string;
  /** Channel ID this notification is for; sent by the server as `tag`. */
  tag?: string;
}

/**
 * Is a focused window already showing this channel?
 *
 * pushd skips sessions it sees as currently connected (message.rs), but that
 * check can lag a live tab during a reconnect blip - the connection/push
 * area's most common failure shape. This asks the browser directly instead
 * of trusting the server's view of "connected", so a member already reading
 * the channel never gets an OS notification duplicating what's on screen.
 */
async function isChannelFocused(channelId: string): Promise<boolean> {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  return windows.some((client) => {
    if (!client.focused) return false;
    try {
      const segments = new URL(client.url).pathname.split("/");
      const i = segments.indexOf("channel");
      return i !== -1 && segments[i + 1] === channelId;
    } catch {
      // An unparsable client URL isn't this channel - it must not abort the
      // whole check, or one odd client (e.g. an about:blank window in the
      // list) would silently drop a real notification for everyone.
      return false;
    }
  });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/**
 * Take the member to the notification's target.
 *
 * `openWindow` alone is not enough for an installed app that is already
 * running: on Android it brings the existing window forward WITHOUT moving it
 * to the URL, so tapping a message notification left the member on whatever
 * they had open and they had to hunt for the chat (reported by members).
 * So: reuse a window of ours if one exists - focus it and navigate it - and
 * only open a new one when there is none, or when focusing/navigating fails.
 */
async function openNotificationTarget(target: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(target, self.registration.scope);
  } catch {
    return;
  }
  // The URL came from a push payload; never steer a window off our origin.
  if (url.origin !== self.location.origin) return;

  try {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const existing = windows.find((client) => {
      try {
        return new URL(client.url).origin === url.origin;
      } catch {
        return false;
      }
    });

    if (existing) {
      const focused = await existing.focus();
      if (focused.url !== url.href) await focused.navigate(url.href);
      return;
    }
  } catch {
    // focus()/navigate() can reject (e.g. a client we do not control). A new
    // window at the right URL is better than nothing happening.
  }

  await self.clients.openWindow(url.href);
}

const MARK_READ_ACTION = "mark-read";

/**
 * Pull the channel and message ids out of a message notification's URL
 * (`<app>/channel/<channel>/<message>`, optionally under `/server/<id>`).
 * Anything else - friend requests, the site root - has no message to mark.
 */
function parseMessageTarget(
  target: string,
): { channel: string; message: string } | undefined {
  try {
    const segments = new URL(target, self.registration.scope).pathname
      .split("/")
      .filter(Boolean);
    const i = segments.indexOf("channel");
    const channel = segments[i + 1];
    const message = segments[i + 2];
    if (i !== -1 && channel && message) return { channel, message };
  } catch {
    // not a URL we understand
  }
  return undefined;
}

/**
 * The saved session token, read straight from the IndexedDB record the page
 * writes (localforage: database "localforage", store "keyvaluepairs", key
 * "auth" - see components/state). A worker cannot reach the page's in-memory
 * state, and this is the only copy it can see. It reads only: it never
 * creates the database or its store (so it cannot disturb localforage's own
 * setup), and it resolves undefined on every failure.
 */
function readSessionToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("localforage");
      open.onerror = () => resolve(undefined);
      open.onupgradeneeded = () => {
        // The database did not exist: nothing is saved. Abort so the empty
        // database this open would create never persists.
        open.transaction?.abort();
      };
      open.onsuccess = () => {
        const db = open.result;
        try {
          const get = db
            .transaction("keyvaluepairs", "readonly")
            .objectStore("keyvaluepairs")
            .get("auth");
          get.onsuccess = () => {
            db.close();
            const token = get.result?.session?.token;
            resolve(typeof token === "string" ? token : undefined);
          };
          get.onerror = () => {
            db.close();
            resolve(undefined);
          };
        } catch {
          db.close();
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

/** Mark the notification's message (and everything before it) as read. */
async function markNotificationRead(target: string): Promise<boolean> {
  const ids = parseMessageTarget(target);
  if (!ids) return false;
  const token = await readSessionToken();
  if (!token) return false;

  try {
    const res = await fetch(
      `${self.location.origin}/api/channels/${encodeURIComponent(
        ids.channel,
      )}/ack/${encodeURIComponent(ids.message)}`,
      { method: "PUT", headers: { "x-session-token": token } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data;
  if (typeof target !== "string") return;

  if (event.action === MARK_READ_ACTION) {
    // If marking fails for any reason (signed out, offline, server error) the
    // notification is already gone, so open the chat rather than leave the
    // member with a tap that visibly did nothing.
    event.waitUntil(
      markNotificationRead(target).then((ok) =>
        ok ? undefined : openNotificationTarget(target),
      ),
    );
    return;
  }

  event.waitUntil(openNotificationTarget(target));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.text();

  const notification: StoatPushNotification = JSON.parse(payload);

  if (!notification.title) {
    if (notification.channel) {
      if (notification.channel.channel_type === "DirectMessage") {
        notification.title = notification.author || "NAC";
      } else {
        notification.title = `${notification.author} in ${notification.channel.name}`;
      }
    } else {
      notification.title = "NAC";
    }
  }

  notification.url ||= self.registration.scope;

  event.waitUntil(
    (async () => {
      if (notification.tag) {
        // If the focus check itself fails (e.g. matchAll rejects), fail open
        // and show the notification - a duplicate is recoverable, a real
        // notification silently dropped is not.
        try {
          if (await isChannelFocused(notification.tag)) return;
        } catch {
          // fall through to showNotification
        }
      }

      // Only message notifications get the button; friend requests and the
      // like have no message to mark. `actions` is not in the DOM lib's
      // NotificationOptions, hence the cast. Browsers without action support
      // (iOS) ignore it and show the plain notification.
      const options: NotificationOptions & {
        actions?: { action: string; title: string }[];
      } = {
        icon: notification.icon,
        body: notification.body,
        data: notification.url,
      };
      if (parseMessageTarget(notification.url ?? "")) {
        options.actions = [{ action: MARK_READ_ACTION, title: "Mark as read" }];
      }

      await self.registration.showNotification(
        notification.title || "NAC",
        options,
      );
    })(),
  );
});

cleanupOutdatedCaches();

// Generate list using scripts/locale.js
// TODO: update this
// prettier-ignore
const locale_keys = ["af","am","ar-dz","ar-kw","ar-ly","ar-ma","ar-sa","ar-tn","ar","az","be","bg","bi","bm","bn","bo","br","bs","ca","cs","cv","cy","da","de-at","de-ch","de","dv","el","en-au","en-ca","en-gb","en-ie","en-il","en-in","en-nz","en-sg","en-tt","en","eo","es-do","es-pr","es-us","es","et","eu","fa","fi","fo","fr-ca","fr-ch","fr","fy","ga","gd","gl","gom-latn","gu","he","hi","hr","ht","hu","hy-am","id","is","it-ch","it","ja","jv","ka","kk","km","kn","ko","ku","ky","lb","lo","lt","lv","me","mi","mk","ml","mn","mr","ms-my","ms","mt","my","nb","ne","nl-be","nl","nn","oc-lnc","pa-in","pl","pt-br","pt","ro","ru","rw","sd","se","si","sk","sl","sq","sr-cyrl","sr","ss","sv-fi","sv","sw","ta","te","tet","tg","th","tk","tl-ph","tlh","tr","tzl","tzm-latn","tzm","ug-cn","uk","ur","uz-latn","uz","vi","x-pseudo","yo","zh-cn","zh-hk","zh-tw","zh","ang","ar","az","be","bg","bn","bottom","br","ca","ca@valencia","ckb","contributors","cs","cy","da","de","de-CH","el","en","en-US","enchantment","enm","eo","es","et","eu","fa","fi","fil","fr","frm","ga","got","he","hi","hr","hu","id","it","ja","kmr","ko","la","lb","leet","li","lt","lv","mk","ml","ms","mt","nb-NO","nl","owo","peo","piglatin","pl","pr","pt_BR","pt_PT","ro","ro_MD","ru","si","sk","sl","sq","sr","sv","ta","te","th","tlh-qaak","tokipona","tr","uk","vec","vi","zh-Hans","zh-Hant"];

precacheAndRoute(
  self.__WB_MANIFEST.filter((entry) => {
    try {
      const url = typeof entry === "string" ? entry : entry.url;
      if (url.includes("-legacy")) return false;

      const fn = url.split("/").pop();
      if (fn) {
        if (fn.endsWith("css") && !isNaN(parseInt(fn.substring(0, 3)))) {
          return false;
        }

        for (const key of locale_keys) {
          if (fn.startsWith(`${key}.`)) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }),
);
