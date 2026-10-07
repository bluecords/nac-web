import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Server } from "stoat.js";

import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { Button, CircularProgress, Column, Row, Text } from "@revolt/ui";

/**
 * Admin page for the automated news feeds.
 *
 * The feeds, their keyword filters and the activity log live in the
 * `NAC Content - News Feed` n8n workflow (n8n static data is per-workflow, so
 * the admin API is in the same workflow). Every call carries the caller's NAC
 * session token; the workflow verifies it against NAC and requires a
 * `privileged` account, so this page being visible is a convenience and not
 * the access control.
 */
const ENDPOINT = "https://automate.bluecords.solutions/webhook/news-admin";

type Feed = {
  id?: string;
  source: string;
  url: string;
  enabled: boolean;
  maxPerRun: number;
  /** newline / comma separated, edited as text */
  requireText: string;
  blockText: string;
};

type Stat = {
  at: string;
  fetched: number;
  fresh: number;
  queued: number;
  filtered: number;
  error: string | null;
};

type Activity = {
  at: string;
  source: string;
  title: string;
  link: string;
  outcome: "queued" | "filtered";
  reason: string;
};

type ApiState = {
  feeds: {
    id: string;
    source: string;
    url: string;
    enabled: boolean;
    maxPerRun: number;
    require: string[];
    block: string[];
  }[];
  globalBlock: string[];
  stats: Record<string, Stat>;
  activity: Activity[];
  pending: number;
};

const toText = (list: string[]) => list.join("\n");
const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

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

export function Feeds(props: { server: Server }) {
  void props.server;
  const state = useState();
  const { showError } = useModals();

  const [tab, setTab] = createSignal<"sources" | "activity">("sources");
  const [feeds, setFeeds] = createSignal<Feed[]>([]);
  const [globalBlockText, setGlobalBlockText] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [filterSource, setFilterSource] = createSignal("");
  const [filterOutcome, setFilterOutcome] = createSignal("");

  async function call(body: Record<string, unknown>): Promise<ApiState> {
    const token = state.auth.getSession()?.token;
    if (!token) throw new Error("Not signed in.");
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as ApiState;
  }

  function adopt(data: ApiState) {
    setFeeds(
      data.feeds.map((f) => ({
        id: f.id,
        source: f.source,
        url: f.url,
        enabled: f.enabled,
        maxPerRun: f.maxPerRun,
        requireText: toText(f.require),
        blockText: toText(f.block),
      })),
    );
    setGlobalBlockText(toText(data.globalBlock));
    setDirty(false);
  }

  const data = useQuery(() => ({
    queryKey: ["news-feeds-admin"],
    queryFn: async () => {
      const result = await call({ action: "get" });
      adopt(result);
      return result;
    },
    retry: false,
    refetchOnWindowFocus: false,
  }));

  function edit(index: number, patch: Partial<Feed>) {
    setFeeds((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const result = await call({
        action: "save",
        feeds: feeds().map((f) => ({
          id: f.id,
          source: f.source,
          url: f.url,
          enabled: f.enabled,
          maxPerRun: f.maxPerRun,
          require: toList(f.requireText),
          block: toList(f.blockText),
        })),
        globalBlock: toList(globalBlockText()),
      });
      adopt(result);
      await data.refetch();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  }

  const activity = createMemo(() =>
    (data.data?.activity ?? []).filter(
      (a) =>
        (!filterSource() || a.source === filterSource()) &&
        (!filterOutcome() || a.outcome === filterOutcome()),
    ),
  );

  /** Share of recent items filtered, per source: shows which feed is the noise. */
  const volume = createMemo(() => {
    const counts: Record<string, { queued: number; filtered: number }> = {};
    for (const a of data.data?.activity ?? []) {
      counts[a.source] ??= { queued: 0, filtered: 0 };
      counts[a.source][a.outcome]++;
    }
    return Object.entries(counts).sort(
      (a, b) => b[1].queued + b[1].filtered - (a[1].queued + a[1].filtered),
    );
  });

  return (
    <Column gap="lg">
      <Column gap="sm">
        <Text class="title">
          <Trans>News feeds</Trans>
        </Text>
        <Text class="body">
          <Trans>
            Sources are checked hourly. An item must pass the filters below to
            reach the review queue; the cap keeps only the newest items per
            run. Nothing here posts publicly - approval is still a reaction in
            the queue channel.
          </Trans>
        </Text>
      </Column>

      <Show when={data.isLoading}>
        <CircularProgress />
      </Show>
      <Show when={data.isError}>
        <Text class="body">
          {(data.error as Error)?.message ?? "Could not load feeds."}
        </Text>
      </Show>

      <Show when={data.data}>
        <Row gap="md" align>
          <Button
            group="standard"
            onPress={() => setTab("sources")}
            isDisabled={tab() === "sources"}
          >
            <Trans>Sources</Trans>
          </Button>
          <Button
            group="standard"
            onPress={() => setTab("activity")}
            isDisabled={tab() === "activity"}
          >
            <Trans>Activity</Trans>
          </Button>
          <Text class="label">
            {data.data!.pending} awaiting review in the queue
          </Text>
        </Row>

        <Show when={tab() === "sources"}>
          <Column gap="md">
            <For each={feeds()}>
              {(feed, i) => {
                const stat = () => (feed.id ? data.data!.stats[feed.id] : undefined);
                return (
                  <Column gap="sm" style={{
                    padding: "12px",
                    "border-radius": "10px",
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    opacity: feed.enabled ? "1" : "0.6",
                  }}>
                    <Row gap="md" align>
                      <label style={{ display: "flex", gap: "6px", "align-items": "center" }}>
                        <input
                          type="checkbox"
                          checked={feed.enabled}
                          onChange={(e) => edit(i(), { enabled: e.currentTarget.checked })}
                        />
                        <Text class="label"><Trans>On</Trans></Text>
                      </label>
                      <input
                        style={{ ...input, "max-width": "220px" }}
                        value={feed.source}
                        placeholder="Name"
                        onInput={(e) => edit(i(), { source: e.currentTarget.value })}
                      />
                      <input
                        style={input}
                        value={feed.url}
                        placeholder="https://example.com/feed"
                        onInput={(e) => edit(i(), { url: e.currentTarget.value })}
                      />
                      <Button
                        group="standard"
                        onPress={() => {
                          setFeeds((l) => l.filter((_, n) => n !== i()));
                          setDirty(true);
                        }}
                      >
                        <Trans>Remove</Trans>
                      </Button>
                    </Row>

                    <Show
                      when={stat()}
                      fallback={
                        <Text class="label">
                          <Trans>Not fetched yet.</Trans>
                        </Text>
                      }
                    >
                      <Text class="label">
                        {stat()!.error
                          ? `Problem: ${stat()!.error}`
                          : `Last run ${ago(stat()!.at)}: ${stat()!.fetched} in feed, ${stat()!.fresh} new, ${stat()!.queued} queued, ${stat()!.filtered} filtered`}
                      </Text>
                    </Show>

                    <Row gap="md">
                      <Column gap="xs" grow>
                        <Text class="label">
                          <Trans>Must contain one of (empty = anything)</Trans>
                        </Text>
                        <textarea
                          rows="3"
                          style={input}
                          value={feed.requireText}
                          placeholder="naturist, nudist, nudity"
                          onInput={(e) => edit(i(), { requireText: e.currentTarget.value })}
                        />
                      </Column>
                      <Column gap="xs" grow>
                        <Text class="label">
                          <Trans>Never contains</Trans>
                        </Text>
                        <textarea
                          rows="3"
                          style={input}
                          value={feed.blockText}
                          placeholder="election, sponsored"
                          onInput={(e) => edit(i(), { blockText: e.currentTarget.value })}
                        />
                      </Column>
                      <Column gap="xs">
                        <Text class="label">
                          <Trans>Max per run</Trans>
                        </Text>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          style={{ ...input, width: "80px" }}
                          value={feed.maxPerRun}
                          onInput={(e) =>
                            edit(i(), { maxPerRun: parseInt(e.currentTarget.value, 10) || 0 })
                          }
                        />
                      </Column>
                    </Row>
                  </Column>
                );
              }}
            </For>

            <Button
              group="standard"
              onPress={() => {
                setFeeds((l) => [
                  ...l,
                  { source: "", url: "", enabled: true, maxPerRun: 3, requireText: "", blockText: "" },
                ]);
                setDirty(true);
              }}
            >
              <Trans>Add feed</Trans>
            </Button>

            <Column gap="xs">
              <Text class="label">
                <Trans>Blocked on every feed (title or summary contains)</Trans>
              </Text>
              <textarea
                rows="3"
                style={input}
                value={globalBlockText()}
                placeholder="giveaway, sponsored"
                onInput={(e) => {
                  setGlobalBlockText(e.currentTarget.value);
                  setDirty(true);
                }}
              />
              <Text class="label">
                <Trans>
                  Matching ignores case and also matches part of a word, so
                  "naturis" covers naturist and naturism.
                </Trans>
              </Text>
            </Column>

            <Row gap="md" align>
              <Button group="standard" isDisabled={!dirty() || saving()} onPress={save}>
                <Trans>Save changes</Trans>
              </Button>
              <Show when={dirty()}>
                <Text class="label"><Trans>Unsaved changes</Trans></Text>
              </Show>
            </Row>
          </Column>
        </Show>

        <Show when={tab() === "activity"}>
          <Column gap="md">
            <Show when={volume().length}>
              <Column gap="xs">
                <Text class="label"><Trans>Recent volume by source</Trans></Text>
                <For each={volume()}>
                  {([source, c]) => (
                    <Text class="body">
                      {source}: {c.queued + c.filtered} seen, {c.queued} queued, {c.filtered} filtered
                    </Text>
                  )}
                </For>
              </Column>
            </Show>
            <Row gap="md" align>
              <select style={{ ...input, width: "auto" }} onChange={(e) => setFilterSource(e.currentTarget.value)}>
                <option value="">All sources</option>
                <For each={volume()}>{([s]) => <option value={s}>{s}</option>}</For>
              </select>
              <select style={{ ...input, width: "auto" }} onChange={(e) => setFilterOutcome(e.currentTarget.value)}>
                <option value="">Queued and filtered</option>
                <option value="queued">Queued</option>
                <option value="filtered">Filtered</option>
              </select>
              <Button group="standard" onPress={() => data.refetch()}>
                <Trans>Refresh</Trans>
              </Button>
            </Row>
            <Show
              when={activity().length}
              fallback={
                <Text class="body">
                  <Trans>
                    Nothing yet. Items appear here after the next hourly run.
                  </Trans>
                </Text>
              }
            >
              <For each={activity()}>
                {(a) => (
                  <Column gap="none">
                    <Text class="body">
                      <a href={a.link} target="_blank" rel="noopener noreferrer">
                        {a.title}
                      </a>
                    </Text>
                    <Text class="label">
                      {a.source} - {ago(a.at)} -{" "}
                      {a.outcome === "queued" ? "queued for review" : `filtered (${a.reason})`}
                    </Text>
                  </Column>
                )}
              </For>
            </Show>
          </Column>
        </Show>
      </Show>
    </Column>
  );
}
