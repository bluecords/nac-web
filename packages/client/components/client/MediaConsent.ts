import { Accessor, createSignal } from "solid-js";

import type { Client } from "stoat.js";

/**
 * The second consent gate: the moment a member first meets member-posted
 * imagery, rather than a box they ticked on day one.
 *
 * It does NOT replace the signup checkbox. That one establishes the lawful
 * basis before anything is processed; this one is contextual and specific -
 * the member agrees at the moment the thing actually happens, which is much
 * closer to what "specific, informed" is supposed to mean.
 *
 * Deliberately NOT the third-party embed gate. That one is about what leaks to
 * YouTube/Spotify/Twitch and offers "open it in your own browser" as an escape
 * hatch, because handing over a plain link there improves privacy by severing
 * the association. For member-posted imagery there is no external destination,
 * and a direct link would serve the image AROUND the gate instead of through
 * it - the opposite of the control. Same pattern, one option that only makes
 * sense on one side.
 */
export const MEDIA_ACK_KEY = "special_category_imagery_first_view";

type MediaConsentState =
  /** not asked yet - treated as gated, see below */
  | "unknown"
  /** asked, and this account has not granted it against the current policy */
  | "required"
  | "granted";

const [state, setState] = createSignal<MediaConsentState>("unknown");

// Defined at module scope rather than built inside the getter below: creating
// the closure per call reads as untracked reactivity to eslint, and there is no
// reason for each caller to get its own.
const isGranted: Accessor<boolean> = () => state() === "granted";

/**
 * Whether member-posted imagery may be shown without a gate.
 *
 * "unknown" counts as NOT granted on purpose. Defaulting the other way would
 * render the image first and gate it a moment later once the answer arrived,
 * which shows the member exactly the thing the gate exists to ask about.
 */
export function mediaConsentGranted(): Accessor<boolean> {
  return isGranted;
}

let inflight: Promise<void> | undefined;

/**
 * Load this account's position from the server.
 *
 * Server-side rather than remembered in the browser because the decision is
 * once per ACCOUNT and has to follow a member across devices - which was the
 * stated reasoning for the age checkbox too.
 *
 * On failure this stays gated, which is the opposite of the server-side
 * permission gate's fail-OPEN behaviour, and the asymmetry is deliberate: that
 * one's failure mode is every member losing access to everything, while this
 * one's is images staying blurred with a retry a click away. Failing safe is
 * cheap here and ruinous there.
 */
export function refreshMediaConsent(client: Client): Promise<void> {
  // If the server is not enforcing consent at all, there is nothing to gate
  // against and no request worth making.
  //
  // This is load-bearing, not an optimisation. Without it the gate fails
  // closed in two situations that are both NORMAL rather than exceptional:
  // an API that predates GET /policy/consent (404), and a server with no
  // policy published yet (also 404, because there is no policy in force to
  // measure against). In either case every image and video in the community
  // would sit behind a button that errors. Gating media because no policy
  // exists is nonsense - there is nothing to have consented to.
  //
  // It also keeps the whole feature behind ONE switch, so it deploys dark and
  // is turned on deliberately, same as the permission gate.
  if (!client.consentGateEnforcing) {
    setState("granted");
    return Promise.resolve();
  }

  if (inflight) return inflight;

  inflight = client
    .fetchConsent()
    .then((consent) => {
      const hasGranted = consent.acks.some(
        (ack) => ack.ack_key === MEDIA_ACK_KEY && ack.granted,
      );

      setState(hasGranted ? "granted" : "required");
    })
    .catch((error) => {
      // Not silent: a gate that quietly fails to load looks identical to one
      // that decided to block, and the two need different fixes.
      console.error("Failed to load media consent state:", error);
      setState("required");
    })
    .finally(() => {
      inflight = undefined;
    });

  return inflight;
}

/**
 * Record consent for member-posted imagery, then unblur.
 *
 * Recorded against whatever policy is in force, with its version and hash, so
 * a policy change re-gates this exactly like the first-login gate. An
 * unrecorded gate proves nothing, and this is the act most worth being able to
 * demonstrate.
 */
export async function grantMediaConsent(client: Client): Promise<void> {
  await client.recordConsentForCurrentPolicy([
    { ack_key: MEDIA_ACK_KEY, granted: true },
  ]);

  setState("granted");
}

/**
 * Withdraw it again.
 *
 * A withdrawal is a new row, never an edit, and it returns the account to the
 * same state as never having granted - so the gate simply closes again. A gate
 * you cannot re-close is not consent.
 */
export async function withdrawMediaConsent(client: Client): Promise<void> {
  await client.recordConsentForCurrentPolicy([
    { ack_key: MEDIA_ACK_KEY, granted: false },
  ]);

  setState("required");
}

/**
 * Drop cached state on logout, so the next account does not inherit it.
 */
export function resetMediaConsent(): void {
  inflight = undefined;
  setState("unknown");
}
