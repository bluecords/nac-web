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
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.notification.data === "string") {
    event.waitUntil(self.clients.openWindow(event.notification.data));
  }
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
    self.registration.showNotification(notification.title || "NAC", {
      icon: notification.icon,
      body: notification.body,
      data: notification.url,
    }),
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
