import { Show, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { Text } from "../design";

interface Props {
  /** Reveal everything and record the decision */
  onConsent: () => Promise<void>;
}

/**
 * Same shape as Spoiler on purpose - a blurred overlay the member clicks
 * through - because that interaction already exists here and members already
 * understand it. The difference is what the click means: a spoiler is a
 * preference and forgets itself, this records consent against a specific
 * policy version and remembers it for the account.
 */
const Base = styled("div", {
  base: {
    zIndex: 1,

    cursor: "pointer",
    // Heavier than Spoiler's blur. A spoiler hides a punchline; this has to
    // leave nothing legible, because the whole point is that the member has not
    // agreed to see it yet.
    backdropFilter: "brightness(0.15) contrast(0.7) blur(40px)",
    // A real background as well as the blur, because the media behind this is
    // not rendered while the gate is up - there is nothing to blur, and a
    // backdrop filter over empty space would leave a transparent hole.
    background: "var(--md-sys-color-surface-container-high)",

    display: "grid",
    placeItems: "center",
    padding: "var(--gap-md)",

    "& div": {
      gap: "var(--gap-sm)",
      display: "flex",
      textAlign: "center",
      alignItems: "center",
      flexDirection: "column",

      // min(), not a flat 22em: an attachment on a phone can be narrower than
      // the chip, and a fixed max-width pushed the text off the side of the
      // image it belongs to.
      maxWidth: "min(22em, 100%)",
      overflowWrap: "anywhere",
      padding: "0.8em 1em",
      userSelect: "none",
      boxShadow: "0 0 8px #00000044",
      borderRadius: "var(--borderRadius-lg)",

      color: "var(--md-sys-color-inverse-on-surface)",
      background: "var(--md-sys-color-inverse-surface)",
    },
  },
});

/**
 * Blur member-posted imagery until this account has consented to seeing it.
 */
export function MediaConsentGate(props: Props) {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  function onClick() {
    if (busy()) return;
    setBusy(true);
    setFailed(false);

    props
      .onConsent()
      .catch((error) => {
        // Surfaced rather than swallowed: a gate that silently refuses to open
        // is indistinguishable from one that decided not to, and the member has
        // no way to tell which happened.
        console.error("Failed to record media consent:", error);
        setFailed(true);
      })
      .finally(() => setBusy(false));
  }

  return (
    <Base class="MediaConsentGate" onClick={onClick}>
      <div>
        <Text class="label">
          <Show
            when={failed()}
            fallback={
              <Show
                when={busy()}
                fallback={
                  <Trans>
                    This community includes simple non-sexual nude imagery. Tap
                    to agree to seeing it.
                  </Trans>
                }
              >
                <Trans>Saving…</Trans>
              </Show>
            }
          >
            <Trans>That didn't save. Tap to try again.</Trans>
          </Show>
        </Text>
      </div>
    </Base>
  );
}
