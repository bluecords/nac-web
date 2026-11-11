import { For, Show, createSignal, onMount } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useState } from "@revolt/state";
import { Button, CircularProgress, Column, Row, Text } from "@revolt/ui";

import {
  type MemberFeedsAction,
  type MemberFeedsState,
  callMemberFeeds,
} from "../server/feeds/memberFeedsApi";

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
 * Settings > My feeds: members add their own blog / channel / podcast feed and
 * NACbot posts new items to a channel the admins allowed, crediting the member
 * with an @mention. NACbot stays the poster on purpose, so the post cannot be
 * mistaken for the member posting it themselves.
 *
 * Who may use this (NAC OG and above, not Basic), how many feeds, and which
 * channels are allowed are all decided by the workflow, not here.
 * `[RULED BY BUNJIE]` 2026-11-10.
 */
export function MyFeeds() {
  const state = useState();

  const [data, setData] = createSignal<MemberFeedsState>();
  const [error, setError] = createSignal<string>();
  const [denied, setDenied] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [label, setLabel] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [channelId, setChannelId] = createSignal("");

  async function run(body: MemberFeedsAction) {
    setBusy(true);
    setError(undefined);
    try {
      const next = await callMemberFeeds(state.auth.getSession()?.token, body);
      setData(next);
      if (!channelId() && next.allowedChannels[0]) {
        setChannelId(next.allowedChannels[0].id);
      }
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (body.action === "get" && /members, not Basic/.test(message)) {
        setDenied(true);
      } else {
        setError(message);
        // A failed change leaves the screen showing what we asked for, not what is
        // true (the checkbox): reload the real state.
        if (body.action !== "get") {
          try {
            setData(
              await callMemberFeeds(state.auth.getSession()?.token, {
                action: "get",
              }),
            );
          } catch {
            /* keep the error shown above */
          }
        }
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Admins are sent every member's feeds; this screen is only your own. */
  const mine = () =>
    (data()?.feeds ?? []).filter((f) => f.ownerId === data()?.me.id);

  onMount(() => void run({ action: "get" }));

  async function add() {
    const ok = await run({
      action: "add",
      label: label(),
      url: url().trim(),
      channelId: channelId(),
    });
    if (ok) {
      setLabel("");
      setUrl("");
    }
  }

  const channelName = (id: string) =>
    data()?.allowedChannels.find((c) => c.id === id)?.name ?? "a channel";

  return (
    <Column gap="lg">
      <Show when={denied()}>
        <Text class="body">
          <Trans>
            Adding feeds is for members. It opens up once your account is
            upgraded from Basic.
          </Trans>
        </Text>
      </Show>

      <Show when={!denied() && !data() && !error()}>
        <CircularProgress />
      </Show>

      <Show when={error() && !data() && !denied()}>
        <Text class="body">{error()}</Text>
        <Button group="standard" onPress={() => run({ action: "get" })}>
          <Trans>Try again</Trans>
        </Button>
      </Show>

      <Show when={data() && error()}>
        <div style={{ color: "var(--md-sys-color-error)" }}>
          <Text class="body">{error()}</Text>
        </div>
      </Show>

      <Show when={data()}>
        <Text class="body">
          <Trans>
            Add your blog, video channel or podcast. When you post something
            new, NACbot shares it in the channel you pick and mentions you as
            the author.
          </Trans>
        </Text>

        <Column gap="md">
          <For
            each={mine()}
            fallback={
              <Text class="label">
                <Trans>You haven't added a feed yet.</Trans>
              </Text>
            }
          >
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
                      disabled={
                        busy() ||
                        (feed.disabledBy === "admin" && !data()!.me.isAdmin)
                      }
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
                  <Text class="label">{feed.url}</Text>
                </div>
                <Text class="label">
                  <Trans>Posts to</Trans> {channelName(feed.channelId)}
                </Text>
              </Column>
            )}
          </For>
        </Column>

        <Show when={mine().length < data()!.maxPerMember || data()!.me.isAdmin}>
          <Column gap="sm">
            <Text class="title">
              <Trans>Add a feed</Trans>
            </Text>
            <input
              style={input}
              value={label()}
              maxLength={60}
              placeholder="Name, for example My blog"
              onInput={(e) => setLabel(e.currentTarget.value)}
            />
            <input
              style={input}
              value={url()}
              placeholder="https://example.com/feed"
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <select
              style={input}
              value={channelId()}
              onChange={(e) => setChannelId(e.currentTarget.value)}
            >
              <For each={data()!.allowedChannels}>
                {(c) => <option value={c.id}>{c.name}</option>}
              </For>
            </select>
            <Text class="label">
              <Trans>
                Use the feed address, which usually ends in /feed or /rss.
                NACbot only shares new posts from now on, not your old ones. Up
                to {data()!.maxPerMember} feeds each.
              </Trans>
            </Text>
            <Row>
              <Button
                group="standard"
                isDisabled={
                  busy() || !label().trim() || !url().trim() || !channelId()
                }
                onPress={add}
              >
                <Trans>Add feed</Trans>
              </Button>
            </Row>
          </Column>
        </Show>
      </Show>
    </Column>
  );
}
