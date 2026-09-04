import { Show, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import type { WebsiteEmbed } from "stoat.js";
import { styled } from "styled-system/jsx";

import { embedConsentGranted } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { SizedContent } from "@revolt/ui/components/utils";

/**
 * The providers this gate covers: the ones that load a real third-party
 * player in an iframe.
 *
 * Listed explicitly rather than gating everything that is not "None",
 * because TextEmbed routes GIF special content through here too - and a GIF
 * is served as an image through our own january proxy, leaks nothing, and
 * would have rendered an absurd "Play from GIF" card. Anything not named here
 * keeps the previous behaviour untouched.
 */
const GATED_PROVIDERS = new Set([
  "YouTube",
  "Twitch",
  "Lightspeed",
  "Spotify",
  "Soundcloud",
  "Bandcamp",
]);

/**
 * Third-party media embed, blocked until the member says otherwise.
 *
 * WHAT THIS USED TO DO. It rendered `<iframe src={embed.embedURL}>` with no
 * referrerpolicy, no sandbox and no allow. Scrolling past a message was enough
 * to hand YouTube/Spotify/Twitch/SoundCloud/Bandcamp/Lightspeed the member's IP,
 * User-Agent, Accept-Language, `Referer: https://community.nac.social/`, which
 * content and when - plus their third-party cookies, identifying a signed-in
 * account by name.
 *
 * Referer plus a signed-in account ties a REAL IDENTITY to "visits
 * community.nac.social". This repo treats that as special-category data - it is
 * why the privacy portal will not confirm membership - and an embed disclosed it
 * with no member action at all.
 *
 * Now: preview card by default (ZERO egress - the thumbnail already comes
 * through our own january proxy), a modal naming the provider on click, and a
 * hardened iframe only after the member agrees.
 */
export function SpecialEmbed(props: { embed: WebsiteEmbed }) {
  const { openModal } = useModals();
  const [playing, setPlaying] = createSignal(false);

  const provider = () => props.embed.specialContent!.type;

  /**
   * Determine the media size
   */
  function getSize() {
    const special = props.embed.specialContent!;

    let width = 0,
      height = 0;
    switch (special.type) {
      case "YouTube": {
        width = props.embed.video?.width ?? 1280;
        height = props.embed.video?.height ?? 720;
        break;
      }
      case "Twitch": {
        width = 1280;
        height = 720;
        break;
      }
      case "Lightspeed": {
        width = 1280;
        height = 720;
        break;
      }
      case "Spotify": {
        width = 420;
        height = 355;
        break;
      }
      case "Soundcloud": {
        width = 480;
        height = 460;
        break;
      }
      case "Bandcamp": {
        width = props.embed.video?.width ?? 1280;
        height = props.embed.video?.height ?? 720;
        break;
      }
    }

    return { width, height };
  }

  /**
   * May this player load right now?
   *
   * `playing` covers the session-only case: if there is no policy published,
   * the choice cannot be recorded, and refusing to play something the member
   * just explicitly asked for would be punishing them for a bookkeeping limit
   * they cannot see. The reverse - loading without being asked - is the thing
   * that must never happen, and does not.
   */
  const allowed = () =>
    !GATED_PROVIDERS.has(provider()) ||
    playing() ||
    embedConsentGranted(provider());

  return (
    <SizedContent width={getSize()?.width} height={getSize()?.height}>
      <Show
        when={allowed()}
        fallback={
          <Blocked
            type="button"
            onClick={() =>
              openModal({
                type: "embed_consent",
                provider: provider(),
                url: props.embed.originalUrl ?? props.embed.url ?? "",
                onPlay: () => setPlaying(true),
              })
            }
          >
            <Show when={props.embed.image?.proxiedURL}>
              {/* Already proxied through january, so showing it sends nothing
                  to the provider. This is why a preview card can be offered at
                  all rather than a blank grey box. */}
              <Thumb src={props.embed.image!.proxiedURL} alt="" />
            </Show>
            <Caption>
              <Trans>Play from {provider()}</Trans>
              <Sub>
                <Trans>
                  Blocked until you agree — loading it contacts {provider()}
                </Trans>
              </Sub>
            </Caption>
          </Blocked>
        }
      >
        <iframe
          loading="lazy"
          scrolling="no"
          allowfullscreen
          allowtransparency
          frameborder={0}
          // Do not tell the provider which page this was played from. The
          // referer is the field that tied a member to this community by name.
          referrerpolicy="no-referrer"
          // No allow-same-origin, so the frame gets an opaque origin and the
          // provider's third-party cookies do not reach it - a signed-in
          // account stays unlinked from playback here.
          //
          // KNOWN TRADE, stated rather than hidden: this breaks some players.
          // YouTube generally survives it; Spotify and Twitch may not. If one
          // does not work, the honest fix is "Open in your own browser" in the
          // consent modal - which is more private anyway - NOT quietly adding
          // allow-same-origin back and re-enabling the tracking.
          sandbox="allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox"
          src={props.embed.embedURL}
        />
      </Show>
    </SizedContent>
  );
}

const Blocked = styled("button", {
  base: {
    position: "relative",
    display: "flex",
    alignItems: "end",
    width: "100%",
    height: "100%",
    padding: 0,
    border: "none",
    cursor: "pointer",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",
    textAlign: "start",
  },
});

const Thumb = styled("img", {
  base: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    // Dimmed so the caption stays readable over any thumbnail, and so a
    // blocked player does not masquerade as a playing one.
    opacity: 0.55,
  },
});

const Caption = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    width: "100%",
    padding: "var(--gap-md)",
    background:
      "linear-gradient(to top, var(--md-sys-color-surface-container-high), transparent)",
  },
});

const Sub = styled("span", {
  base: {
    fontSize: "0.8rem",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
