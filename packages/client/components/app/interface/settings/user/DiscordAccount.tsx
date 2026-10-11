import { Match, Show, Switch, createSignal, onMount } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import type { DiscordMemberSuggestion } from "stoat.js";

import { useClient } from "@revolt/client";
import { Button, CircularProgress, Column, Text, useSnackbar } from "@revolt/ui";

import { DiscordIdentityPicker } from "../../../../modal/modals/DiscordIdentityPicker";

/** What this screen needs from a claim. */
type Claim = {
  discord_id: string;
  discord_username: string;
  discord_display_name?: string;
  confirmed_at?: string;
};

/**
 * Settings > Discord account: link the Discord account you used before NAC.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Discord picker lived ONLY in the consent gate, which a member sees once.
 * Everybody who got past that screen without choosing, or who made their account
 * before the picker existed, had no way to claim their Discord history afterwards:
 * the server routes (`/policy/discord/identity`) were there but nothing in the
 * app reached them. Measured 2026-10-11: 68 members had already passed the gate.
 * `[RULED BY BUNJIE]` 2026-10-11 ("Sounds like a solid plan").
 *
 * A claim is NOT a link. It is stored unconfirmed and does nothing until an admin
 * confirms it (Server Settings > Discord identities); typing a name is a claim,
 * not proof. Once confirmed it cannot be changed here, because changing it can
 * move real posts between accounts: an admin does that.
 */
export function DiscordAccount() {
  const client = useClient();
  const snackbar = useSnackbar();
  const { t } = useLingui();

  // undefined = loading, null = no claim yet
  const [claim, setClaim] = createSignal<Claim | null | undefined>(undefined);
  const [failed, setFailed] = createSignal(false);
  const [picked, setPicked] = createSignal<DiscordMemberSuggestion>();
  const [busy, setBusy] = createSignal(false);

  const say = (message: string) =>
    snackbar.show({ message, placement: "bottom", closeable: true });

  async function load() {
    setFailed(false);
    setClaim(undefined);
    try {
      setClaim(await client().fetchMyDiscordIdentity());
    } catch {
      setFailed(true);
    }
  }
  onMount(load);

  const name = (c: Claim) => c.discord_display_name ?? c.discord_username;

  async function link() {
    const member = picked();
    if (!member || busy()) return;
    setBusy(true);
    try {
      setClaim(await client().claimDiscordIdentity(member.id));
      setPicked(undefined);
      say(t`Sent to the admins to confirm`);
    } catch (error) {
      // The server's own words: somebody else already claimed that account, or
      // yours is already confirmed. Both need to be readable.
      say(
        error instanceof Error
          ? error.message
          : t`Couldn't link that account. Try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy()) return;
    setBusy(true);
    try {
      await client().withdrawDiscordIdentity();
      setClaim(null);
      say(t`Removed. You can pick a different account.`);
    } catch {
      say(t`Couldn't remove it. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Column gap="lg">
      <Text class="title" size="large">
        <Trans>Your Discord account</Trans>
      </Text>

      <Switch>
        <Match when={failed()}>
          <Text class="body">
            <Trans>Couldn't load your Discord link.</Trans>
          </Text>
          <Button group="standard" onPress={load}>
            <Trans>Try again</Trans>
          </Button>
        </Match>

        <Match when={claim() === undefined}>
          <CircularProgress />
        </Match>

        <Match when={claim()?.confirmed_at}>
          <Text class="body">
            <Trans>Linked to your Discord account</Trans>{" "}
            <strong>{claim() ? name(claim()!) : ""}</strong>
          </Text>
          <Text class="label">
            <Trans>
              Your old posts and roles are connected to this account. If this is
              wrong, ask an admin.
            </Trans>
          </Text>
        </Match>

        <Match when={claim()}>
          <Text class="body">
            <Trans>You linked</Trans>{" "}
            <strong>{claim() ? name(claim()!) : ""}</strong>
          </Text>
          <Text class="label">
            <Trans>
              An admin checks that it is really you. When they confirm it, your
              old posts and roles come back to you.
            </Trans>
          </Text>
          <Button group="standard" isDisabled={busy()} onPress={withdraw}>
            <Trans>Change or remove</Trans>
          </Button>
        </Match>

        <Match when={true}>
          <DiscordIdentityPicker
            selected={picked()}
            onSelect={setPicked}
            skipped={false}
            onSkip={() => undefined}
            hideSkip
          />
          <Show when={picked()}>
            <Button group="standard" isDisabled={busy()} onPress={link}>
              <Trans>Link this account</Trans>
            </Button>
          </Show>
        </Match>
      </Switch>
    </Column>
  );
}
