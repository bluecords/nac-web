import { Trans } from "@lingui-solid/solid/macro";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { styled } from "styled-system/jsx";

import { useSound } from "@revolt/client";
import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Button } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * How long you can sit alone in a call before we hang up for you
 */
export const AUTO_LEAVE_SECONDS = 10 * 60;

/**
 * Shown when you are the only person in the call: plays quiet music so you know
 * the call is still open, counts down, and leaves the call when it reaches zero.
 * Someone joining, or pressing Stay, resets it.
 */
export function AloneInCallNotice() {
  const voice = useVoice();
  const sound = useSound();
  const { sounds } = useState();

  const [secondsLeft, setSecondsLeft] = createSignal(AUTO_LEAVE_SECONDS);
  const [stays, setStays] = createSignal(0);

  createEffect(() => {
    // pressing Stay re-runs this effect, which starts the countdown again
    stays();

    if (!voice.alone()) return;

    // Count against the clock, not by ticks: browsers slow timers in background tabs.
    const deadline = Date.now() + AUTO_LEAVE_SECONDS * 1000;
    setSecondsLeft(AUTO_LEAVE_SECONDS);

    const stopMusic = sound.startLoop("aloneInCall");

    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);

      if (left <= 0) {
        voice.disconnect();
      }
    }, 1000);

    onCleanup(() => {
      clearInterval(timer);
      stopMusic();
    });
  });

  const time = () => {
    const minutes = Math.floor(secondsLeft() / 60);
    const seconds = String(secondsLeft() % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  return (
    <Show when={voice.alone()}>
      <Notice>
        <Symbol>{sounds.enabled("aloneInCall") ? "music_note" : "person"}</Symbol>
        <Message>
          <Show
            when={sounds.enabled("aloneInCall")}
            fallback={<Trans>You're the only one here.</Trans>}
          >
            <Trans>
              You're the only one here. Soft music is playing so you know the
              call is still open.
            </Trans>
          </Show>{" "}
          <Trans>Leaving in {time()}.</Trans>
        </Message>
        <Button size="sm" variant="tonal" onPress={() => setStays((n) => n + 1)}>
          <Trans>Stay</Trans>
        </Button>
      </Notice>
    </Show>
  );
}

const Notice = styled("div", {
  base: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    backgroundColor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
});

const Message = styled("div", {
  base: {
    flexGrow: 1,
    minWidth: 0,
  },
});
