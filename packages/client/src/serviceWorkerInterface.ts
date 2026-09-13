import { createSignal } from "solid-js";

import { registerSW } from "virtual:pwa-register";

const [pendingUpdate, setPendingUpdate] = createSignal<() => void>();
const [updateReady, setUpdateReady] = createSignal(false);

// Declared BEFORE the PROD block below, which assigns it during module
// evaluation. A `const` further down would be in its temporal dead zone at
// that point and throw on load - in the service worker wiring, which is about
// the worst place to put a startup crash.
const [updateApply, setUpdateApply] = createSignal<() => void>(
  () => () => location.reload(),
);

export { pendingUpdate, updateApply, updateReady };

// The server can reject a request with 426 Upgrade Required if this build is
// below its configured minimum client version (same gate as the Android app,
// just enforced differently here - reloading the page IS the update for web,
// there's no separate app store build to push someone to). Reuse the exact
// same "refresh" banner the PWA update-available flow already shows, rather
// than inventing a second one - a full reload is the correct fix either way.
// This patches fetch globally (rather than the generated API client) since
// every API call already goes through it regardless of call site.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  if (response.status === 426 && !pendingUpdate()) {
    // NOTE THE DOUBLE ARROW. A Solid setter treats a function argument as an
    // UPDATER and calls it immediately, so `setPendingUpdate(() => reload())`
    // reloaded on the spot and stored undefined - the banner this comment
    // describes could never appear. To store a function you must return it.
    setPendingUpdate(() => () => location.reload());
  }

  return response;
};

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    // Kept for the "prompt" contract, though the worker skip-waits itself so
    // this is belt and braces rather than the mechanism.
    onNeedRefresh() {
      setUpdateReady(true);
    },
    onOfflineReady() {
      console.info("Ready to work offline =)");
    },
    onRegistered(r) {
      // A once-an-hour interval meant a real client-visible fix could sit
      // deployed for up to an hour before a session even checked for it -
      // measured live 2026-09-13: still on the old build >20 minutes after
      // deploy, on both a phone and a desktop browser, simply because
      // neither had hit the hourly tick yet. Down to 2 minutes, which is
      // cheap (one conditional-GET of a small worker script) and matches how
      // this app is actually used - short, frequent visits, not one long
      // session where an hourly check would eventually catch up anyway.
      setInterval(() => r!.update(), 2 * 60 * 1000);

      // The interval alone still leaves a real gap for how Bunjie actually
      // uses NAC ("I don't use it 5 minutes straight, I check quickly") -
      // a tab that's been backgrounded for an hour and gets glanced at for
      // 30 seconds may never hit the interval at all before it's closed
      // again. Check the instant it's actually being looked at instead.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") r!.update();
      });
    },
  });

  // THE UPDATE MODEL, and why it is neither of the two obvious ones.
  //
  // It used to be `registerType: "autoUpdate"`, whose registration reloads the
  // page the moment a new worker activates. That is reliable and rude: it can
  // yank the page out from under someone mid-sentence.
  //
  // The opposite - a pure prompt - was rejected earlier for a real reason: a
  // prompt runs in the OLD page, so a client on a stale or broken build can
  // never be asked. That is exactly how every client ended up frozen on a
  // bundle that 404s.
  //
  // So: the WORKER still decides (self.skipWaiting + clientsClaim, so nobody
  // can be stranded), and the PAGE decides WHEN to swap. Bunjie, 2026-09-03:
  //
  //   "leaving their unentered comment intact with a notice telling them that
  //    there was an update and to refresh... let the post complete after the
  //    fact because 99.9% of whatever change has nothing to do with a post."
  //
  // controllerchange is the honest signal that new code is serving this page.
  // Interface.tsx watches `updateReady` and applies it the moment nothing is
  // typed-but-unsent, showing the banner in the meantime. Nothing is lost and
  // nothing is interrupted.
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    setUpdateReady(true);
  });

  // Expose the apply step for the banner's Refresh button. Calling updateSW
  // first is harmless when the worker has already taken over.
  setUpdateApply(() => () => {
    void updateSW(true);
    location.reload();
  });
}
