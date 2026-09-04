import { createSignal } from "solid-js";

import type { Client } from "stoat.js";

/**
 * The third-party embed gate.
 *
 * WHAT IT PREVENTS. SpecialEmbed rendered `<iframe src={embed.embedURL}>` with
 * no referrerpolicy, no sandbox and no allow, for YouTube, Spotify, Twitch,
 * SoundCloud, Bandcamp, Streamable and Lightspeed. Merely SCROLLING PAST a
 * message handed that provider the member's IP, User-Agent, Accept-Language,
 * `Referer: https://community.nac.social/`, which content, when - and, with no
 * sandbox, their third-party cookies, so a logged-in Spotify or YouTube account
 * is identified by name.
 *
 * That is the part that matters here: referer plus a logged-in account lets
 * Google or Spotify tie a REAL NAMED IDENTITY to "visits community.nac.social".
 * This repo already treats "this person is in the naturist community" as a
 * special-category disclosure - it is the reasoning behind the privacy portal
 * refusing to confirm membership. An embed handed the same fact to a third
 * party with no member action at all.
 *
 * Embed images and icons were never the problem: they already go through our
 * own january proxy. Only the player iframe leaked.
 *
 * WHY THIS IS PER PROVIDER, not one switch. Agreeing to load YouTube is not
 * agreeing to load Twitch. The choice a member actually makes is about a named
 * company, so that is the granularity the record has to keep - and it means
 * "remember this" cannot quietly widen into consent for providers they have
 * never been asked about.
 *
 * Related but deliberately separate from MediaConsent (member-posted imagery).
 * That gate has no external destination, so it offers no "open it elsewhere"
 * escape; here that escape IMPROVES privacy, because a plain link severs the
 * association with this community entirely.
 */

/** Ack keys are per provider: embed_provider_youtube, _spotify, and so on. */
export function embedAckKey(provider: string): string {
  return `embed_provider_${provider.toLowerCase()}`;
}

type Granted = Record<string, boolean>;

const [granted, setGranted] = createSignal<Granted>({});
const [loaded, setLoaded] = createSignal(false);

/**
 * Whether this provider may be loaded without asking.
 *
 * Unknown counts as NOT granted, and that default is the whole feature: the
 * cost of guessing wrong in the other direction is the leak itself, which has
 * already happened by the time the answer arrives.
 */
export function embedConsentGranted(provider: string): boolean {
  return granted()[embedAckKey(provider)] === true;
}

/** Has the account's position been read yet this session? */
export function embedConsentLoaded(): boolean {
  return loaded();
}

let inflight: Promise<void> | undefined;

/**
 * Load this account's per-provider positions.
 *
 * Note the asymmetry with MediaConsent.refreshMediaConsent, which ungates
 * entirely when the server is not enforcing consent. This one does NOT.
 *
 * That is deliberate. The imagery gate exists to record agreement against a
 * policy, so with no policy in force there is nothing to have agreed to and
 * gating is nonsense. This gate exists to stop DATA LEAVING to a third party,
 * and that harm is exactly the same whether or not a policy is published.
 * Blocking is therefore unconditional; only the REMEMBERING depends on there
 * being a policy to record against.
 */
export function refreshEmbedConsent(client: Client): Promise<void> {
  if (inflight) return inflight;

  inflight = client
    .fetchConsent()
    .then((consent) => {
      const next: Granted = {};
      for (const ack of consent.acks) {
        if (ack.ack_key.startsWith("embed_provider_") && ack.granted) {
          next[ack.ack_key] = true;
        }
      }
      setGranted(next);
      setLoaded(true);
    })
    .catch((error) => {
      // Not silent. A gate that failed to load looks identical to one that
      // decided to block, and the two need different fixes. Staying blocked is
      // the safe direction here: the member sees a card and a button, not a
      // leak they cannot undo.
      console.error("Failed to load embed consent state:", error);
      setLoaded(true);
    })
    .finally(() => {
      inflight = undefined;
    });

  return inflight;
}

/**
 * Allow this provider, and remember it if there is a policy to record against.
 *
 * Returns whether the choice was PERSISTED. It can legitimately fail to be -
 * recordConsentForCurrentPolicy throws when no policy is published, which is
 * the normal state before migration day - and when that happens the member
 * still gets to watch the thing they clicked, for this session only.
 *
 * Playing without being able to record is the right trade: the alternative is
 * refusing to play something the member explicitly asked for because of a
 * bookkeeping limitation they cannot see or fix. What must never happen is the
 * reverse - loading it without being asked.
 */
export async function grantEmbedConsent(
  client: Client,
  provider: string,
  remember: boolean,
): Promise<boolean> {
  const key = embedAckKey(provider);

  // Unblock immediately either way; this is a direct response to a click.
  setGranted((prev) => ({ ...prev, [key]: true }));

  if (!remember) return false;

  try {
    await client.recordConsentForCurrentPolicy([
      { ack_key: key, granted: true },
    ]);
    return true;
  } catch (error) {
    console.error("Could not persist embed consent for", provider, error);
    return false;
  }
}

/**
 * Withdraw it again.
 *
 * A withdrawal is a new row, never an edit - same rule as the imagery gate. A
 * gate that cannot be re-closed is not consent.
 */
export async function withdrawEmbedConsent(
  client: Client,
  provider: string,
): Promise<void> {
  const key = embedAckKey(provider);
  setGranted((prev) => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

  try {
    await client.recordConsentForCurrentPolicy([
      { ack_key: key, granted: false },
    ]);
  } catch (error) {
    console.error("Could not persist embed withdrawal for", provider, error);
  }
}

/** Drop cached state on logout, so the next account does not inherit it. */
export function resetEmbedConsent(): void {
  inflight = undefined;
  setGranted({});
  setLoaded(false);
}
