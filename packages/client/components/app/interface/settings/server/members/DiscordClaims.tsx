import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Server } from "stoat.js";

import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import {
  Avatar,
  Button,
  CircularProgress,
  Column,
  Row,
  Text,
} from "@revolt/ui";

/**
 * The queue of "this Discord account is mine" claims, and the admin decision.
 *
 * WHY A HUMAN HAS TO PRESS A BUTTON
 * ---------------------------------
 * Confirming a claim is what makes re-attribution hand somebody edit and delete
 * rights over six years of another person's posts, and hands them the Discord
 * role that went with it. A member typing their own name is a claim, not proof.
 * `[RULED BY BUNJIE]`, decided long before this screen existed and re-confirmed
 * after a session re-asked it.
 *
 * `reattribute-archive.js` applies exactly the same test on its side: a row
 * counts only when it carries both `confirmed_by` and `confirmed_at`, and it
 * says out loud how many it ignored.
 */
/**
 * What NAC did for a member when their claim was confirmed. The server writes
 * `summary` as a finished sentence, so this screen shows it as is.
 */
type ClaimResult = {
  status: "done" | "waiting" | "needs_attention";
  summary: string;
};

export function DiscordClaims(props: { server: Server }) {
  const client = useClient();
  const { showError } = useModals();

  const [busy, setBusy] = createSignal<string | undefined>();
  // What the busy row is doing: handing over roles and posts, or undoing.
  const [busyGiving, setBusyGiving] = createSignal(false);

  const claims = useQuery(() => ({
    queryKey: ["discord-claims", props.server.id],
    queryFn: () => client().fetchDiscordClaims(props.server.id),
    retry: false,
  }));

  const pending = createMemo(
    () => claims.data?.filter((claim) => !claim.confirmed_at) ?? [],
  );
  const confirmed = createMemo(
    () => claims.data?.filter((claim) => claim.confirmed_at) ?? [],
  );

  async function act(discordId: string, confirm: boolean) {
    setBusy(discordId);
    setBusyGiving(confirm);
    try {
      if (confirm) {
        await client().confirmDiscordClaim(props.server.id, discordId);
      } else {
        await client().rejectDiscordClaim(props.server.id, discordId);
      }
      await claims.refetch();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(undefined);
    }
  }

  /**
   * The NAC account a claim points at.
   *
   * Falls back to the raw id rather than hiding the row: a claim pointing at an
   * account this client has not loaded is still a real claim, and a row that
   * silently disappears is worse than an ugly one.
   */
  function resultOf(claim: object): ClaimResult | undefined {
    return (claim as { fulfilment?: ClaimResult }).fulfilment;
  }

  /**
   * Run everything that follows a confirmation again for one member. Safe to
   * repeat: it only ever adds.
   */
  async function finishClaim(discordId: string) {
    setBusy(discordId);
    setBusyGiving(true);
    try {
      const { baseURL, headers } = client().api.config;
      const response = await fetch(
        `${baseURL}/servers/${props.server.id}/discord-claims/${discordId}/fulfil`,
        { method: "POST", headers },
      );
      if (!response.ok) throw new Error(`finishClaim: ${response.status}`);
      await claims.refetch();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(undefined);
    }
  }

  function nacUser(userId: string) {
    return client().users.get(userId);
  }

  function discordName(claim: { discord_username: string; discord_display_name?: string }) {
    return claim.discord_display_name &&
      claim.discord_display_name !== claim.discord_username
      ? `${claim.discord_display_name} (${claim.discord_username})`
      : claim.discord_username;
  }

  function row(claim: NonNullable<typeof claims.data>[number], decided: boolean) {
    const user = nacUser(claim.user);

    return (
      <Row gap="md" align>
        <Avatar
          src={user?.avatarURL}
          fallback={user?.displayName ?? claim.user}
          size={32}
        />

        <Column gap="none" grow>
          <Text class="body">
            {user?.displayName ?? claim.user}
            {" — "}
            <strong>{discordName(claim)}</strong>
          </Text>
          <Text class="label">
            <Show
              when={decided}
              fallback={<Trans>Waiting for you</Trans>}
            >
              <Trans>Confirmed</Trans>
            </Show>
          </Text>
          <Show when={busyGiving() && busy() === claim.discord_id}>
            <Text class="label">
              <Trans>Giving them their roles and posts…</Trans>
            </Text>
          </Show>
          <Show when={decided && resultOf(claim)}>
            <Text class="label">
              <span
                style={{
                  color:
                    resultOf(claim)!.status === "done"
                      ? undefined
                      : "var(--md-sys-color-error)",
                }}
              >
                {resultOf(claim)!.summary}
              </span>
            </Text>
          </Show>
        </Column>

        <Show when={decided && (!resultOf(claim) || resultOf(claim)!.status !== "done")}>
          <Button
            group="standard"
            isDisabled={busy() === claim.discord_id}
            onPress={() => finishClaim(claim.discord_id)}
          >
            <Show when={resultOf(claim)} fallback={<Trans>Give roles and posts</Trans>}>
              <Trans>Try again</Trans>
            </Show>
          </Button>
        </Show>

        <Show when={!decided}>
          <Button
            group="standard"
            isDisabled={busy() === claim.discord_id}
            onPress={() => act(claim.discord_id, true)}
          >
            <Trans>Confirm</Trans>
          </Button>
        </Show>
        <Button
          group="standard"
          isDisabled={busy() === claim.discord_id}
          onPress={() => act(claim.discord_id, false)}
        >
          <Show when={decided} fallback={<Trans>Reject</Trans>}>
            <Trans>Undo</Trans>
          </Show>
        </Button>
      </Row>
    );
  }

  return (
    <Column gap="lg">
      <Column gap="sm">
        <Text class="title">
          <Trans>Discord identities</Trans>
        </Text>
        <Text class="label">
          <Trans>
            Members tell us which Discord account was theirs. When you confirm
            one, NAC immediately gives that member their old posts and
            reactions and the roles they had on Discord, then tells you what it
            did — so confirm only what you actually recognise.
          </Trans>
        </Text>
      </Column>

      <Show when={claims.isLoading}>
        <CircularProgress />
      </Show>

      <Show when={claims.isError}>
        <Text class="label">
          <Trans>Could not load the claims. Try again in a moment.</Trans>
        </Text>
      </Show>

      <Show when={claims.data}>
        <Column gap="md">
          <Text class="label">
            <Trans>Waiting for you</Trans> ({pending().length})
          </Text>
          <Show
            when={pending().length}
            fallback={
              <Text class="body">
                <Trans>Nothing waiting.</Trans>
              </Text>
            }
          >
            <For each={pending()}>{(claim) => row(claim, false)}</For>
          </Show>
        </Column>

        <Column gap="md">
          <Text class="label">
            <Trans>Confirmed</Trans> ({confirmed().length})
          </Text>
          <For each={confirmed()}>{(claim) => row(claim, true)}</For>
        </Column>
      </Show>
    </Column>
  );
}
