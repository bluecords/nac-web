import { createSignal } from "solid-js";

import { registerSW } from "virtual:pwa-register";

const [pendingUpdate, setPendingUpdate] = createSignal<() => void>();

export { pendingUpdate };

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
    setPendingUpdate(() => void location.reload());
  }

  return response;
};

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      setPendingUpdate(() => void updateSW(true));
    },
    onOfflineReady() {
      console.info("Ready to work offline =)");
      // toast to users
    },
    onRegistered(r) {
      // registration = r;

      // Check for updates every hour
      setInterval(() => r!.update(), 36e5);
    },
  });
}
