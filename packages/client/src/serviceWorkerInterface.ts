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
      // Check for updates every hour
      setInterval(() => r!.update(), 36e5);
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
