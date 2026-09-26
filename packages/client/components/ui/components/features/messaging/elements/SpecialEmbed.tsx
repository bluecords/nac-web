import { Show, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import type { WebsiteEmbed } from "stoat.js";
import { styled } from "styled-system/jsx";

import { embedConsentGranted, useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { SizedContent } from "@revolt/ui/components/utils";

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
 * through our own january proxy), a modal naming the provider on click, and the
 * player only after the member chooses to play it here (or opens it in their
 * own browser instead).
 *
 * THE REQUIREMENT IS THE GATE. Nothing may reach the provider before that
 * choice. What the provider learns AFTER it is stated in the consent modal, and
 * it deliberately includes that the member is on NAC: the owner does not mind a
 * provider seeing that NAC connected to it (2026-09-26); what mattered was not
 * exposing the member before they chose. The player used to be locked down
 * further after the choice (no referrer, and a sandbox that cut cookies). That
 * BROKE the players - measured 2026-09-26: YouTube rendered a black box and
 * SoundCloud and Twitch rendered blank - so it was relaxed. See the iframe.
 */
export function SpecialEmbed(props: { embed: WebsiteEmbed }) {
  const { openModal } = useModals();
  const client = useClient();
  const [playing, setPlaying] = createSignal(false);

  const provider = () => props.embed.specialContent!.type;

  /**
   * Preview thumbnail for the blocked card.
   *
   * YouTube blocks datacentre IPs from fetching the watch page itself, so
   * january never gets an og:image for these and `embed.image` is always
   * empty in production - not a per-video glitch, every YouTube embed we
   * have ever stored has the same gap. Fall back to YouTube's own static
   * thumbnail CDN, keyed off the video id we already have - the same id
   * `embedURL` already uses to build the real player src - and route it
   * through january like any other preview image, so this still sends
   * nothing to YouTube until the member agrees to play it.
   */
  const thumbnailURL = () => {
    if (props.embed.image?.proxiedURL) {
      return props.embed.image.proxiedURL;
    }

    const special = props.embed.specialContent;
    if (special?.type === "YouTube") {
      return client().proxyFile(
        `https://img.youtube.com/vi/${special.id}/sddefault.jpg`,
      );
    }

    return undefined;
  };

  /**
   * Determine the media size
   */
  function getSize() {
    const special = props.embed.specialContent!;

    // 16:9 unless a provider says otherwise. This used to start at 0 x 0, which
    // is invisible: fine for a type nobody renders, but a player that has no
    // case below (Streamable was one) then gets a blocked card you cannot see.
    let width = 1280,
      height = 720;
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
   * DENY BY DEFAULT: every embed that has a player URL is gated, not just the
   * providers someone remembered to list. A hand-kept list was the bug - it
   * left Streamable off, so a Streamable link loaded its player (and told
   * streamable.com the member's IP) the moment it scrolled into view, with no
   * choice at all (found by review, 2026-09-26). Special content with no player
   * URL, such as a GIF, never reaches an iframe: it renders nothing here.
   *
   * `playing` covers the session-only case: if there is no policy published,
   * the choice cannot be recorded, and refusing to play something the member
   * just explicitly asked for would be punishing them for a bookkeeping limit
   * they cannot see. The reverse - loading without being asked - is the thing
   * that must never happen, and does not.
   */
  const allowed = () => playing() || embedConsentGranted(provider());

  // No player URL (a GIF, or a type we do not embed) means no frame at all. A
  // frame with no src is about:blank and inherits THIS page's origin, which is
  // exactly what the sandbox below must never be given.
  return (
    <Show when={props.embed.embedURL}>
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
              <Show when={thumbnailURL()}>
                {/* Already proxied through january, so showing it sends nothing
                    to the provider. This is why a preview card can be offered at
                    all rather than a blank grey box. */}
                <Thumb src={thumbnailURL()!} alt="" />
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
            // The referrer is left at the browser default: the ORIGIN only,
            // never a path, so the provider is told the member is on NAC.
            // YouTube's player refuses to run without one - measured
            // 2026-09-26, with `no-referrer` it shows "Error 153, video player
            // configuration error". The consent modal says this in plain words.
            referrerpolicy="strict-origin-when-cross-origin"
            // allow-same-origin is required: without it the frame gets an
            // opaque origin and the players fail - YouTube renders a black box,
            // and SoundCloud and Twitch render blank (measured 2026-09-26). It
            // does NOT give the frame access to this page: the provider's
            // origin is not ours, so it stays cross-origin and cannot reach our
            // DOM, storage or cookies. That only holds while `src` is always a
            // provider URL, which the `when` on the outer Show guarantees.
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            src={props.embed.embedURL}
          />
        </Show>
      </SizedContent>
    </Show>
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
