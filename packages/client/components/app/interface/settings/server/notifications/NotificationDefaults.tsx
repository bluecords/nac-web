import { For, Show, createEffect, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { Channel, NotificationDefaults, Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { Button, Column, Radio2, Text } from "@revolt/ui";

type Level = "all" | "mention" | "none";

/**
 * Admin page: what members get for notifications when they have not chosen
 * their own. One level for the whole server, and a level per channel (for
 * example Announcements always sending to phones). A member's own choice always
 * wins over these.
 */
export function NotificationDefaultsPage(props: { server: Server }) {
  const { t } = useLingui();
  const { showError } = useModals();

  const saved = () => props.server.notificationDefaults;

  const [serverLevel, setServerLevel] = createSignal<"all" | "mention">(
    saved().server ?? "mention",
  );

  const [channelLevels, setChannelLevels] = createSignal<Record<string, Level>>(
    { ...(saved().channels ?? {}) },
  );
  // channels shown in the list: the ones with a default, plus any added here

  const [listed, setListed] = createSignal<string[]>(
    Object.keys(saved().channels ?? {}),
  );
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);
  // true once the admin has changed something on this page
  const [touched, setTouched] = createSignal(false);

  // Until the admin starts editing, follow what is saved, so another admin's
  // change (or this page's own save) shows up here instead of being overwritten
  createEffect(() => {
    const now = saved();
    if (touched()) return;

    setServerLevel(now.server ?? "mention");
    setChannelLevels({ ...(now.channels ?? {}) });
    setListed(Object.keys(now.channels ?? {}));
  });

  const channels = (): Channel[] =>
    props.server.orderedChannels
      .flatMap((category) => category.channels)
      .filter(
        (channel) =>
          channel.type === "TextChannel" || channel.type === "ForumChannel",
      );

  const listedChannels = () =>
    channels().filter((channel) => listed().includes(channel.id));
  const addable = () =>
    channels().filter((channel) => !listed().includes(channel.id));

  /** Only channels that still exist: a deleted channel's id is refused by the server */
  const liveOnly = (levels: Record<string, string>) => {
    const live = new Set(channels().map((channel) => channel.id));
    return Object.fromEntries(
      Object.entries(levels)
        .filter(([id]) => live.has(id))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  };

  const current = (): NotificationDefaults => ({
    server: serverLevel(),
    channels: liveOnly(channelLevels()) as NotificationDefaults["channels"],
  });

  const changed = () => {
    const before = saved();
    return (
      (before.server ?? "mention") !== serverLevel() ||
      JSON.stringify(liveOnly(before.channels ?? {})) !==
        JSON.stringify(current().channels)
    );
  };

  function setChannel(channel: Channel, value: string) {
    setDone(false);
    setTouched(true);
    setChannelLevels((levels) => {
      const next = { ...levels };
      if (value === "") delete next[channel.id];
      else next[channel.id] = value as Level;
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      await props.server.setNotificationDefaults(current());
      setTouched(false);
      setDone(true);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Column gap="lg">
      <Column gap="sm">
        <Text class="label">
          <Trans>Default for everyone</Trans>
        </Text>
        <Text class="body">
          <Trans>
            Used for members who have not chosen their own. Phone alerts follow
            it too. Anyone can change theirs at any time.
          </Trans>
        </Text>
        <Choices>
          <Radio2
            value={serverLevel()}
            onChange={(event) => {
              setDone(false);
              setTouched(true);
              setServerLevel(event.currentTarget.value as "all" | "mention");
            }}
          >
            <Radio2.Option value="all">
              <Trans>All messages</Trans>
            </Radio2.Option>
            <Radio2.Option value="mention">
              <Trans>Only @mentions</Trans>
            </Radio2.Option>
          </Radio2>
        </Choices>
        <Show when={serverLevel() === "all"}>
          <Text class="body">
            <Trans>
              All messages for the whole server sends every post to everyone's
              phone. Most communities turn it on for a few channels instead.
            </Trans>
          </Text>
        </Show>
      </Column>

      <Column gap="sm">
        <Text class="label">
          <Trans>Channel defaults</Trans>
        </Text>
        <Text class="body">
          <Trans>
            A channel can have its own default, such as Announcements always
            sending to phones.
          </Trans>
        </Text>

        <For each={listedChannels()}>
          {(channel) => (
            <Row>
              <ChannelName># {channel.name}</ChannelName>
              <Select
                aria-label={t`Default for this channel`}
                value={channelLevels()[channel.id] ?? ""}
                onChange={(event) =>
                  setChannel(channel, event.currentTarget.value)
                }
              >
                <option value="">{t`Server default`}</option>
                <option value="all">{t`All messages`}</option>
                <option value="mention">{t`Only @mentions`}</option>
                <option value="none">{t`Nothing`}</option>
              </Select>
            </Row>
          )}
        </For>

        <Show when={addable().length}>
          <Select
            aria-label={t`Add a channel`}
            value=""
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) {
                setTouched(true);
                setListed((list) => [...list, id]);
              }
              event.currentTarget.value = "";
            }}
          >
            <option value="">{t`Add a channel…`}</option>
            <For each={addable()}>
              {(channel) => <option value={channel.id}>{channel.name}</option>}
            </For>
          </Select>
        </Show>
      </Column>

      <Text class="body">
        <Trans>
          What each member gets, in order: their own choice (channel, then
          category, then server), then the channel default, then the server
          default, then Only @mentions. Anything a member chose themselves
          always wins.
        </Trans>
      </Text>

      <Row>
        <Button isDisabled={!changed() || busy()} onPress={save}>
          <Trans>Save</Trans>
        </Button>
        <Show when={done() && !changed()}>
          <Text class="label">
            <Trans>Saved</Trans>
          </Text>
        </Show>
      </Row>
    </Column>
  );
}

const Choices = styled("div", {
  base: {
    "& mdui-radio-group": { display: "flex", flexDirection: "column" },
    "& mdui-radio": { display: "flex" },
  },
});

const Row = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-md)",
    flexWrap: "wrap",
  },
});

const ChannelName = styled("span", {
  base: {
    flex: "1 1 8rem",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
});

const Select = styled("select", {
  base: {
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
  },
});
