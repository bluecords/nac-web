import { For, createMemo, createSignal, onMount } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import type { DiscordMemberSuggestion } from "stoat.js";

import { useClient, useClientLifecycle } from "@revolt/client";
import { Checkbox, Column, Dialog, DialogProps, Row, Text } from "@revolt/ui";

import MdPolicy from "@material-design-icons/svg/outlined/policy.svg?component-solid";

import { useModals } from "..";
import { Modals } from "../types";
import { DiscordIdentityPicker } from "./DiscordIdentityPicker";

/**
 * The four acts a member consents to, each recorded as its own row.
 *
 * UNBUNDLED ON PURPOSE. One "I agree to everything" tick is not consent to four
 * separate things, and the endpoint that stores these has no way to express a
 * single blanket agreement either - one row per key, by construction.
 *
 * The wording is approved copy. In particular "simple non-sexual" in the
 * imagery item is load-bearing rather than stylistic: it is the same
 * distinction the app-store position turns on, said in the members' own words.
 * Do not let a later wording pass quietly drop it.
 */
const CONSENT_ITEMS = [
  {
    key: "age_18_plus",
    label: () => <Trans>I am 18 or older.</Trans>,
    href: "https://terms.nac.social",
  },
  {
    key: "special_category_imagery",
    label: () => (
      // Three fragments rather than one <Trans> with a nested <strong>.
      // Measured in the browser: a <Trans> whose children are text/element/text
      // renders the element's content three times - "simple non-sexualsimple
      // non-sexualsimple non-sexual". Splitting it is worse for translators and
      // it is the trade taken deliberately: "simple non-sexual" is the wording
      // Bunjie added on purpose, and it has to render exactly once, emphasised.
      <>
        <Trans>I understand this community includes</Trans>{" "}
        <strong>
          <Trans>simple non-sexual</Trans>
        </strong>{" "}
        <Trans>nude imagery, and I consent to seeing it.</Trans>
      </>
    ),
    href: "https://guidelines.nac.social",
  },
  {
    key: "community_rules",
    label: () => (
      <Trans>
        I agree to the community rules, including not sharing anything from here
        outside it.
      </Trans>
    ),
    href: "https://guidelines.nac.social",
  },
  {
    key: "privacy_notice",
    label: () => <Trans>I've read how my data is handled.</Trans>,
    href: "https://privacy.nac.social",
  },
] as const;

export function PolicyChangeModal(
  props: DialogProps & Modals & { type: "policy_change" },
) {
  const { showError } = useModals();
  const client = useClient();
  const { logout } = useClientLifecycle();
  const [granted, setGranted] = createSignal<Record<string, boolean>>({});
  const [busy, setBusy] = createSignal(false);

  // The Discord identity prompt lives HERE, in the consent gate, and not in
  // signup. About forty members were already on NAC before it could have asked
  // them, so signup will never fire for them again - this gate is the one
  // screen every existing member is forced through, exactly once. `[RULED BY
  // BUNJIE]` 2026-09-06: "everyone is going to get prompted on the first login
  // to provide their user info from Discord so we can confirm match then."
  const [discordMember, setDiscordMember] = createSignal<
    DiscordMemberSuggestion | undefined
  >();
  const [skipDiscord, setSkipDiscord] = createSignal(false);
  const [confirmedName, setConfirmedName] = createSignal<string | undefined>();
  const [identityLoaded, setIdentityLoaded] = createSignal(false);

  onMount(async () => {
    try {
      const claim = await client().fetchMyDiscordIdentity();
      if (claim) {
        if (claim.confirmed_by && claim.confirmed_at) {
          setConfirmedName(claim.discord_display_name ?? claim.discord_username);
        } else {
          // A pending claim already answers the question. Re-showing an empty
          // picker would read as the answer having been lost.
          setDiscordMember({
            id: claim.discord_id,
            username: claim.discord_username,
            display_name: claim.discord_display_name,
            claimed: true,
          });
        }
      }
    } catch {
      // An API that cannot answer must not wall the member out of the app. The
      // gate still works; the prompt just cannot be pre-filled, and the skip
      // below is the honest way through.
      setSkipDiscord(true);
    } finally {
      setIdentityLoaded(true);
    }
  });

  // Consent is recorded against the LATEST policy, because that is the one the
  // server's gate measures against - a record naming a superseded policy would
  // be evidence of agreeing to the wrong document.
  const policy = createMemo(
    () =>
      [...props.changes].sort((a, b) =>
        a.created_time < b.created_time ? 1 : -1,
      )[0],
  );

  const allGranted = createMemo(() =>
    CONSENT_ITEMS.every((item) => granted()[item.key]),
  );

  // Answered EITHER by picking a name or by saying there is not one to pick.
  // Requiring a pick would trap anybody who never used Discord on a screen that
  // blocks the whole app; requiring nothing would waste the one moment every
  // member passes through.
  const discordAnswered = createMemo(
    () =>
      !!confirmedName() ||
      !!discordMember() ||
      (skipDiscord() && identityLoaded()),
  );

  function toggle(key: string) {
    setGranted((current) => ({ ...current, [key]: !current[key] }));
  }

  // Whether the server is actually restricting unconsented members, not just
  // whether a policy exists. The two are separate states and this modal has to
  // behave differently in each:
  //
  //   enforcing  -> dismissing it leaves a client that looks fine and fails at
  //                 every action, because clients compute permissions locally
  //                 and cannot see the consent check. So there is no dismiss;
  //                 the honest exit is to log out.
  //   not enforcing -> nothing is blocked, so trapping someone in an
  //                 unskippable wall would be a lie about the state of the
  //                 system - and would quietly turn publishing a policy into
  //                 switching the gate on.
  const enforcing = () => client()?.consentGateEnforcing ?? false;

  return (
    <Dialog
      icon={<MdPolicy />}
      show={props.show}
      // No click-away or Escape while the gate is live, for the same reason
      // there is no Close button.
      //
      // ⚠️ Dialog calls THIS on a successful action too, not only on dismissal -
      // it awaits an async `onClick` and then calls `onClose`. So while the gate
      // is enforcing, that path lands on the no-op and Continue can never close
      // the modal. That is why Continue is closed explicitly in its own handler
      // below instead of relying on Dialog to do it.
      onClose={enforcing() ? () => {} : props.onClose}
      title={<Trans>Before you continue</Trans>}
      actions={[
        enforcing()
          ? { text: <Trans>Log out</Trans>, onClick: () => logout() }
          : { text: <Trans>Close</Trans> },
        {
          text: <Trans>Continue</Trans>,
          // Every item, individually. A partial tick is a partial consent and
          // there is no partial state to record it into.
          isDisabled: !allGranted() || !discordAnswered() || busy(),
          async onClick() {
            setBusy(true);
            try {
              // The claim goes FIRST, and that order is load-bearing. Recording
              // consent is what closes this gate, and the gate never opens
              // again - so if the claim were second and failed, the answer
              // would be lost with no way back to the screen that asked. This
              // way a failed claim leaves the member here, able to try again.
              const member = discordMember();
              if (member && !confirmedName()) {
                await client()!.claimDiscordIdentity(member.id);
              }

              await props.recordConsent(
                policy(),
                CONSENT_ITEMS.map((item) => ({
                  ack_key: item.key,
                  granted: true,
                })),
              );

              // Close explicitly. Dialog would normally do this for us once the
              // async handler resolves, but it goes through the `onClose` above,
              // which is deliberately a no-op while the gate is enforcing - so
              // relying on it leaves the member looking at the same wall after a
              // successful submit, with no way out and no error to explain it.
              //
              // Reported by Bunjie 2026-09-07: "I filled it out, hit the continue
              // button which highlighted on press but the modal never went away."
              // He pressed it three times; the database shows three complete sets
              // of consent records, 4 and 6 seconds apart. Every press worked.
              props.onClose();
            } catch (error) {
              showError(error);
            } finally {
              setBusy(false);
            }
          },
        },
      ]}
    >
      <Column gap="lg">
        <Text class="label">
          <Trans>
            Please read and agree to each of these. Each one is separate — agree
            only to what you actually agree to.
          </Trans>
        </Text>

        <Column gap="lg">
          <For each={CONSENT_ITEMS}>
            {(item) => (
              // The label lives OUTSIDE the checkbox on purpose. Checkbox is an
              // mdui web component, and a <Trans> containing an element (the
              // <strong> on "simple non-sexual") rendered into its slot came out
              // duplicated three times - seen in the browser, not guessed at.
              // Keeping the rich text in a normal element renders it correctly
              // and gives the document link somewhere sensible to sit.
              <Row gap="md">
                {/* Pinned to the top rather than centred: these labels wrap to
                    three lines on a phone, and a box floating in the middle of
                    the text reads as belonging to the wrong line. */}
                <div style={{ "align-self": "flex-start" }}>
                  <Checkbox
                    checked={granted()[item.key] ?? false}
                    onChange={() => toggle(item.key)}
                  />
                </div>
                <Column gap="none" grow>
                  {/* The label toggles the box too - the text is most of the
                      hit area, and on a phone the box alone is a small target. */}
                  <div
                    style={{ cursor: "pointer" }}
                    onClick={() => toggle(item.key)}
                  >
                    <Text class="body">{item.label()}</Text>
                  </div>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    <Text class="label">
                      <Trans>Read this document</Trans>
                    </Text>
                  </a>
                </Column>
              </Row>
            )}
          </For>
        </Column>

        <DiscordIdentityPicker
          selected={discordMember()}
          onSelect={(member) => {
            setDiscordMember(member);
            if (member) setSkipDiscord(false);
          }}
          skipped={skipDiscord()}
          onSkip={(skipped) => {
            setSkipDiscord(skipped);
            if (skipped) setDiscordMember(undefined);
          }}
          confirmedName={confirmedName()}
        />

        <Text class="label">
          <Trans>
            You can withdraw any of these later in settings. Withdrawing removes
            access to the community until you agree again — it does not delete
            your account or anything you have posted.
          </Trans>
        </Text>
      </Column>
    </Dialog>
  );
}
