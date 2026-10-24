import { Trans } from "@lingui-solid/solid/macro";
import { Show } from "solid-js";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import { Button } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Shown when you are the only person in the call. The music and the automatic
 * hang up live in `Voice.startAloneWatch`, so they keep going when this card is
 * not on screen.
 */
export function AloneInCallNotice() {
  const voice = useVoice();
  const { sounds } = useState();

  const time = () => {
    const left = voice.aloneSecondsLeft();
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  };

  return (
    <Show when={voice.alone()}>
      <Notice>
        <Show
          when={sounds.enabled("aloneInCall")}
          fallback={<Symbol>timer</Symbol>}
        >
          <Symbol>headphones</Symbol>
        </Show>
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
        <Button size="sm" variant="tonal" onPress={() => voice.stayAlone()}>
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
