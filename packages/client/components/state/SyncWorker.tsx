import { createEffect, on, onCleanup } from "solid-js";

import { ProtocolV1 } from "stoat.js/lib/events/v1";

import { useClient, useClientLifecycle } from "@revolt/client";

import { useState } from ".";

/**
 * Guards initialSync below. Module-level (not a variable inside SyncWorker)
 * so it survives this component being re-instantiated - a local variable
 * would reset to 0 on every fresh instance, same trap the changelog check a
 * few files over already documents. Confirmed live 2026-09-25, measured
 * directly against prod's nginx and events logs: a member's client
 * re-entered this effect and re-issued initialSync roughly ten times a
 * second for ~30s. #connectionFailures in Controller.ts can't see this
 * pattern either, since it resets on every reconnect that briefly succeeds -
 * but what actually re-enters this effect that fast is NOT confirmed; this
 * is a defence-in-depth rate limit on the observed symptom, not a fix for
 * one identified cause.
 *
 * Reset on logout (below) so a different account logging into the same tab
 * within the window still gets its own first sync, rather than silently
 * inheriting the previous account's cooldown.
 */
let lastInitialSyncAt = 0;
const MIN_RESYNC_INTERVAL_MS = 5_000;

/**
 * Manage synchronisation of settings to-from API
 */
export function SyncWorker() {
  const state = useState();
  const client = useClient();
  const { isLoggedIn } = useClientLifecycle();

  /**
   * Handle incoming events
   * @param event Event
   */
  function handleEvent(event: ProtocolV1["server"]) {
    if (event.type === "UserSettingsUpdate") {
      state.sync.consumeEvent(event.update);
    }
  }

  // sync REMOTE->LOCAL settings
  createEffect(
    on(
      () => isLoggedIn(),
      (isLoggedIn) => {
        if (isLoggedIn) {
          // Rate-limited, not one-shot: a genuine reconnect after minutes
          // offline SHOULD re-fetch (another device may have changed
          // settings meanwhile) - the fix is spacing, not disabling.
          const now = Date.now();
          if (now - lastInitialSyncAt >= MIN_RESYNC_INTERVAL_MS) {
            lastInitialSyncAt = now;
            state.sync.initialSync(client());
          }

          client().events.addListener("event", handleEvent);
          onCleanup(() => client().events.removeListener("event", handleEvent));
        } else {
          lastInitialSyncAt = 0;
        }
      },
    ),
  );

  // sync LOCAL->REMOTE settings
  createEffect(
    on(
      [() => state.sync.shouldSync, isLoggedIn],
      ([shouldSync, isLoggedIn]) =>
        shouldSync && isLoggedIn && state.sync.save(client()),
    ),
  );

  return null;
}
