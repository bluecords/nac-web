import { createSignal } from "solid-js";

import { registerSW } from "virtual:pwa-register";

const [pendingUpdate, setPendingUpdate] = createSignal<() => void>();
const [updateReady, setUpdateReady] = createSignal(false);

// Guards every location.reload() below against firing more than once per
// page instance. Nothing here previously stopped that: Interface.tsx's
// auto-apply effect re-runs whenever its OTHER dependencies change (e.g.
// state.draft.hasAnyUnsent() flipping) while updateReady() is already true,
// and location.reload() does not tear the page down instantly - there is a
// real window where a second call (from a re-run effect, or the banner's
// button racing the auto-apply) can still execute. This is the standard
// fix for exactly that class of PWA reload storm: reload() has to be called
// at most once, ever, per page instance.
let hasReloaded = false;

// A second guard, because the one above cannot see across page loads. Each
// reload creates a NEW page instance with `hasReloaded` false again, so if
// whatever asks for the reload is true on every fresh load, the page reloads
// forever. That is exactly what one member's phone did on 2026-09-24,
// 2026-09-29 and 2026-10-05: ~345 full page loads in ~87 seconds, ~4 a
// second, then it stopped by itself. The cause was never found by reading the
// code, so this does not wait for it: reloads are counted in localStorage
// (which survives a reload) and refused after MAX_RELOADS in RELOAD_WINDOW_MS.
// Worst case is now three quick reloads, not hundreds.
const RELOAD_LOG_KEY = "nac:reload-log";
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 60_000;

function recentReloads(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RELOAD_LOG_KEY) ?? "[]");
    const now = Date.now();
    return Array.isArray(raw)
      ? raw.filter((t) => typeof t === "number" && now - t < RELOAD_WINDOW_MS)
      : [];
  } catch {
    // Storage unavailable: treat as no history rather than blocking updates.
    return [];
  }
}

// Says WHY a reload happened, to our own server log and nowhere else. It is
// a POST with the reason in the address; nginx writes the line, nothing
// reads it, and it carries no member data. `grep nac-reload` on the web
// access log is how the next occurrence is explained instead of guessed at.
function reportReload(reason: string, blocked: boolean): void {
  try {
    navigator.sendBeacon(
      `/__nac-reload?reason=${encodeURIComponent(reason)}&blocked=${blocked ? 1 : 0}`,
    );
  } catch {
    // Diagnostics must never get in the way of an update.
  }
}

function reloadBudgetLeft(): boolean {
  return recentReloads().length < MAX_RELOADS;
}

function reloadOnce(reason: string): void {
  if (hasReloaded) return;
  hasReloaded = true;

  const recent = recentReloads();
  if (recent.length >= MAX_RELOADS) {
    reportReload(reason, true);
    console.warn(`Reload refused (${reason}): ${recent.length} in the last minute`);
    return;
  }

  try {
    localStorage.setItem(
      RELOAD_LOG_KEY,
      JSON.stringify([...recent, Date.now()]),
    );
  } catch {
    // Without storage the cross-load guard cannot count; the page guard holds.
  }
  reportReload(reason, false);
  location.reload();
}

// Which signal last said "an update is ready", so the reload can name it.
let updateReason = "unknown";

// Declared BEFORE the PROD block below, which assigns it during module
// evaluation. A `const` further down would be in its temporal dead zone at
// that point and throw on load - in the service worker wiring, which is about
// the worst place to put a startup crash.
const [updateApply, setUpdateApply] = createSignal<() => void>(
  () => reloadOnce("default"),
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
    setPendingUpdate(() => () => reloadOnce("upgrade-required-426"));
  }

  return response;
};

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    // Kept for the "prompt" contract, though the worker skip-waits itself so
    // this is belt and braces rather than the mechanism.
    onNeedRefresh() {
      updateReason = "need-refresh";
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
    updateReason = "controller-change";
    setUpdateReady(true);
  });

  // SELF-HEAL FOR A DEAD ICON FONT. Icons are ligatures of letters, so when the
  // font file cannot be fetched every icon is drawn as its own name ("menu",
  // "grid_3x3", "send"). Measured 2026-10-10: three phones asked for the OLD
  // font file (deleted on purpose, nac-web#236) from a stale page and got 404.
  // A new worker activating drops the old precache while an old page is still
  // open, and the reload that should follow did not fire for at least one
  // member (Ryan Ash, with screenshots). The page cannot be left like that, so
  // when the font fails it goes down the SAME path as an update: it says "an
  // update is ready", which Interface.tsx applies only once nothing is
  // typed-but-unsent and the consent gate is closed, through reloadOnce and
  // its per-minute budget.
  //
  // One attempt per ten minutes per tab session, so a phone with no signal at
  // all cannot reload-loop: the font fails the same way after the reload and
  // the second failure is ignored.
  const ICON_FONT_RETRY_MS = 10 * 60_000;
  const ICON_FONT_KEY = "nac:icon-font-heal";
  function iconFontFailed(faces: Iterable<FontFace>): boolean {
    for (const face of faces) {
      if (face.family.replace(/["']/g, "").startsWith("Material Symbols")) {
        return true;
      }
    }
    return false;
  }
  function healIconFont(): void {
    if (!navigator.onLine) return;
    try {
      const last = Number(sessionStorage.getItem(ICON_FONT_KEY) ?? 0);
      if (Date.now() - last < ICON_FONT_RETRY_MS) return;
      sessionStorage.setItem(ICON_FONT_KEY, String(Date.now()));
    } catch {
      // No sessionStorage: the per-minute reload budget is the only brake.
    }
    updateReason = "icon-font-failed";
    setUpdateReady(true);
  }
  document.fonts?.addEventListener("loadingerror", (e) => {
    if (iconFontFailed((e as FontFaceSetLoadEvent).fontfaces)) healIconFont();
  });
  // A failure that happened before the listener above existed.
  void document.fonts?.ready.then(() => {
    const failed: FontFace[] = [];
    document.fonts.forEach((face) => {
      if (face.status === "error") failed.push(face);
    });
    if (iconFontFailed(failed)) healIconFont();
  });

  // Expose the apply step for the banner's Refresh button. Calling updateSW
  // first is harmless when the worker has already taken over.
  setUpdateApply(() => () => {
    // updateSW(true) arms the plugin's own reload, which this file's counter
    // cannot see, so check the budget BEFORE arming it.
    if (hasReloaded) return;
    if (!reloadBudgetLeft()) {
      reloadOnce(`update:${updateReason}`);
      return;
    }

    void updateSW(true);
    reloadOnce(`update:${updateReason}`);
  });
}
