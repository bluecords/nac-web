import { For, Show, createMemo, createSignal, onMount } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Server } from "stoat.js";

import { useClient } from "@revolt/client";
import { useState } from "@revolt/state";
import { Button, CircularProgress, Column, Row, Text } from "@revolt/ui";

import {
  type MemberFeedsAction,
  type MemberFeedsState,
  callMemberFeeds,
} from "./memberFeedsApi";

const input = {
  width: "100%",
  padding: "6px 8px",
  "border-radius": "6px",
  border: "1px solid var(--md-sys-color-outline-variant)",
  background: "var(--md-sys-color-surface-container-low)",
  color: "var(--md-sys-color-on-surface)",
  font: "inherit",
  "box-sizing": "border-box",
} as const;

/**
 * Admin side of member feeds: which channels feeds may post to, and every
 * member's feeds (switch off, remove, change who is credited). The channel list
 * is enforced by the workflow both when a feed is added and again every time it
 * posts, so an old feed cannot keep posting into a channel taken off the list.
 */
export function MemberFeedsAdmin(props: { server: Server }) {
  const state = useState();
  const client = useClient();

  const [data, setData] = createSignal<MemberFeedsState>();
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [addChannel, setAddChannel] = createSignal("");

  async function run(body: MemberFeedsAction) {
    setBusy(true);
    setError(undefined);
    try {
      setData(await callMemberFeeds(state.auth.getSession()?.token, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  onMount(() => void run({ action: "get" }));

  /** Every member, by name, for the "credit" picker. Same query the Members page uses. */
  const members = useQuery(() => ({
    queryKey: ["members", props.server.id],
    async queryFn() {
      await props.server.syncMembers(false);
      return client().serverMembers.filter(
        (member) => member.id.server === props.server.id,
      );
    },
  }));
  const people = createMemo(() =>
    (members.data ?? [])
      .filter((m) => m.user && !m.user.bot)
      .map((m) => ({ id: m.id.user, name: m.user!.username }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const nameOf = (id: string | null) =>
    id ? (people().find((p) => p.id === id)?.name ?? "unknown member") : "";

  /** Text channels not already on the list. */
  const candidates = createMemo(() => {
    const have = new Set((data()?.allowedChannels ?? []).map((c) => c.id));
    return props.server.channels
      .filter((c) => c.type === "TextChannel" && !have.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
  });
  const channelName = (id: string) =>
    data()?.allowedChannels.find((c) => c.id === id)?.name ?? "not allowed now";

  async function addAllowedChannel() {
    const c = candidates().find((x) => x.id === addChannel());
    if (!c) return;
    await run({
      action: "setChannels",
      channels: [...data()!.allowedChannels, c],
    });
    setAddChannel("");
  }

  return (
    <Column gap="lg">
      <Show when={!data() && !error()}>
        <CircularProgress />
      </Show>
      <Show when={error()}>
        <div style={{ color: "var(--md-sys-color-error)" }}>
          <Text class="body">{error()}</Text>
        </div>
      </Show>

      <Show when={data()}>
        <Column gap="sm">
          <Text class="title">
            <Trans>Channels feeds may post to</Trans>
          </Text>
          <Text class="label">
            <Trans>
              Members only see these when they add a feed. Taking one off stops
              feeds already pointed at it.
            </Trans>
          </Text>
          <Row gap="sm" align style={{ "flex-wrap": "wrap" }}>
            <For each={data()!.allowedChannels}>
              {(c) => (
                <Button
                  group="standard"
                  isDisabled={busy() || data()!.allowedChannels.length < 2}
                  onPress={() =>
                    run({
                      action: "setChannels",
                      channels: data()!.allowedChannels.filter(
                        (x) => x.id !== c.id,
                      ),
                    })
                  }
                >
                  {c.name} &#10005;
                </Button>
              )}
            </For>
          </Row>
          <Row gap="sm" align>
            <select
              style={{ ...input, "max-width": "260px" }}
              value={addChannel()}
              onChange={(e) => setAddChannel(e.currentTarget.value)}
            >
              <option value="">Add a channel…</option>
              <For each={candidates()}>
                {(c) => <option value={c.id}>{c.name}</option>}
              </For>
            </select>
            <Button
              group="standard"
              isDisabled={busy() || !addChannel()}
              onPress={addAllowedChannel}
            >
              <Trans>Add</Trans>
            </Button>
          </Row>
        </Column>

        <Column gap="md">
          <Text class="title">
            <Trans>Member feeds</Trans> ({data()!.feeds.length})
          </Text>
          <Text class="label">
            <Trans>
              New feeds start with the next check and only share items posted
              after that. "Credited member" is who NACbot mentions.
            </Trans>
          </Text>
          <For each={data()!.feeds}>
            {(feed) => (
              <Column
                gap="sm"
                style={{
                  padding: "12px",
                  "border-radius": "10px",
                  border: "1px solid var(--md-sys-color-outline-variant)",
                  opacity: feed.enabled ? "1" : "0.6",
                }}
              >
                <Row gap="md" align>
                  <label
                    style={{
                      display: "flex",
                      gap: "6px",
                      "align-items": "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={feed.enabled}
                      disabled={busy()}
                      onChange={(e) =>
                        run({
                          action: "update",
                          id: feed.id,
                          enabled: e.currentTarget.checked,
                        })
                      }
                    />
                    <Text class="label">
                      <Trans>On</Trans>
                    </Text>
                  </label>
                  <Text class="body">
                    <strong>{feed.label}</strong>
                  </Text>
                  <Button
                    group="standard"
                    isDisabled={busy()}
                    onPress={() => run({ action: "remove", id: feed.id })}
                  >
                    <Trans>Remove</Trans>
                  </Button>
                </Row>
                <div style={{ "word-break": "break-all" }}>
                  <Text class="label">
                    {feed.url} · {channelName(feed.channelId)}
                  </Text>
                </div>
                <Row gap="sm" align>
                  <Text class="label">
                    <Trans>Credited member</Trans>
                  </Text>
                  <select
                    style={{ ...input, "max-width": "260px" }}
                    disabled={busy()}
                    onChange={(e) =>
                      run({
                        action: "update",
                        id: feed.id,
                        ownerId: e.currentTarget.value || null,
                      })
                    }
                  >
                    <option value="" selected={!feed.ownerId}>
                      None (posts as the feed name)
                    </option>
                    <Show
                      when={
                        feed.ownerId &&
                        !people().some((p) => p.id === feed.ownerId)
                      }
                    >
                      <option value={feed.ownerId!} selected>
                        {nameOf(feed.ownerId)}
                      </option>
                    </Show>
                    <For each={people()}>
                      {(p) => (
                        <option value={p.id} selected={p.id === feed.ownerId}>
                          {p.name}
                        </option>
                      )}
                    </For>
                  </select>
                </Row>
              </Column>
            )}
          </For>
        </Column>
      </Show>
    </Column>
  );
}
