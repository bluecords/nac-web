import { For, Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import {
  Checkbox,
  Column,
  Dialog,
  DialogProps,
  Radio2,
  Text,
  Time,
} from "@revolt/ui";

import { NotificationState } from "../../state/stores/NotificationOptions";
import { Modals } from "../types";

/**
 * Whether a channel is one that can notify (text and forum channels)
 */
function isNotifying(channel: Channel) {
  return channel.type === "TextChannel" || channel.type === "ForumChannel";
}

/**
 * Notification settings for a whole server, Discord-style: mute, one choice
 * that applies to every channel, and a table of channels that keep their own
 * choice. This only edits the member's own saved preferences, which the
 * server already reads when deciding who gets a phone push.
 */
export function ServerNotificationsModal(
  props: DialogProps & Modals & { type: "server_notifications" },
) {
  const state = useState();
  const { t } = useLingui();

  const channels = () =>
    props.server.orderedChannels
      .flatMap((category) => category.channels)
      .filter(isNotifying);

  const hasOwnSetting = (channel: Channel) =>
    typeof state.notifications.getChannel(channel) !== "undefined" ||
    !!state.notifications.getChannelMute(channel);

  // channels shown in the table: the ones with a setting when this opened,
  // plus any added here (so a row does not vanish when its boxes are cleared)
  const [listed, setListed] = createSignal<string[]>(
    channels()
      .filter(hasOwnSetting)
      .map((channel) => channel.id),
  );

  const listedChannels = () =>
    channels().filter((channel) => listed().includes(channel.id));

  const addable = () =>
    channels().filter((channel) => !listed().includes(channel.id));

  const serverMuted = () => state.notifications.isMuted(props.server);

  /**
   * Choose a level for a channel; choosing the one already set goes back
   * to following the server
   */
  function toggleLevel(channel: Channel, level: NotificationState) {
    state.notifications.setChannel(
      channel,
      state.notifications.getChannel(channel) === level ? undefined : level,
    );
  }

  function toggleChannelMute(channel: Channel) {
    state.notifications.setChannelMute(
      channel,
      state.notifications.isChannelMuted(channel) ? undefined : {},
    );
  }

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Notification settings</Trans>}
      actions={[{ text: <Trans>Done</Trans> }]}
      minWidth={420}
    >
      <Column gap="lg">
        <Section>
          <Row>
            <Column gap="none">
              <Trans>Mute server</Trans>
              <Text class="label" size="small">
                <Show
                  when={state.notifications.getServerMute(props.server)?.until}
                  fallback={
                    <Trans>
                      No notifications from this server until you turn it back
                      on.
                    </Trans>
                  }
                >
                  <Trans>
                    Muted until{" "}
                    <Time
                      format="datetime"
                      value={
                        state.notifications.getServerMute(props.server)!.until
                      }
                    />
                  </Trans>
                </Show>
              </Text>
            </Column>
            <Checkbox
              checked={serverMuted()}
              onChange={(event) =>
                state.notifications.setServerMute(
                  props.server,
                  event.currentTarget.checked ? {} : undefined,
                )
              }
            />
          </Row>
        </Section>

        <Section>
          <Trans>For every channel in this server</Trans>
          <Choices>
            <Radio2
              value={state.notifications.computeForServer(props.server)}
              onChange={(event) =>
                state.notifications.setServer(
                  props.server,
                  event.currentTarget.value as NotificationState,
                )
              }
            >
              <Radio2.Option value="all">
                <Trans>All messages</Trans>
              </Radio2.Option>
              <Radio2.Option value="mention">
                <Trans>Only @mentions</Trans>
              </Radio2.Option>
              <Radio2.Option value="none">
                <Trans>Nothing</Trans>
              </Radio2.Option>
            </Radio2>
          </Choices>
          <Show when={!state.notifications.get().server[props.server.id]}>
            <Text class="label" size="small">
              <Trans>
                You haven't chosen one, so this is the server's default. Pick
                one to make it your own.
              </Trans>
            </Text>
          </Show>
          <Text class="label" size="small">
            <Trans>
              Applies to alerts in NAC and to push on your phone. Channels you
              set below keep their own choice.
            </Trans>
          </Text>
        </Section>

        <Section>
          <Trans>Channels with their own setting</Trans>
          <Text class="label" size="small">
            <Trans>Only channels you changed show here. Add more below.</Trans>
          </Text>

          <Table>
            <Cell label>
              <Trans>Channel</Trans>
            </Cell>
            <Cell label centered>
              <Trans>All</Trans>
            </Cell>
            <Cell label centered>
              <Trans>Mentions</Trans>
            </Cell>
            <Cell label centered>
              <Trans>Nothing</Trans>
            </Cell>
            <Cell label centered>
              <Trans>Mute</Trans>
            </Cell>

            <For each={listedChannels()}>
              {(channel) => (
                <>
                  <Cell>
                    <ChannelName># {channel.name}</ChannelName>
                  </Cell>
                  <For each={["all", "mention", "none"] as const}>
                    {(level) => (
                      <Cell centered>
                        <Checkbox
                          checked={
                            state.notifications.getChannel(channel) === level
                          }
                          onChange={() => toggleLevel(channel, level)}
                        />
                      </Cell>
                    )}
                  </For>
                  <Cell centered>
                    <Checkbox
                      checked={state.notifications.isChannelMuted(channel)}
                      onChange={() => toggleChannelMute(channel)}
                    />
                  </Cell>
                </>
              )}
            </For>
          </Table>

          <Show when={addable().length}>
            <ChannelPicker
              aria-label={t`Add a channel`}
              value=""
              onChange={(event) => {
                const id = event.currentTarget.value;
                if (id) setListed((list) => [...list, id]);
                event.currentTarget.value = "";
              }}
            >
              <option value="">{t`Add a channel…`}</option>
              <For each={addable()}>
                {(channel) => (
                  <option value={channel.id}>{channel.name}</option>
                )}
              </For>
            </ChannelPicker>
          </Show>
        </Section>
      </Column>
    </Dialog>
  );
}

const Section = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
  },
});

const Row = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-md)",
  },
});

const Choices = styled("div", {
  base: {
    "& mdui-radio-group": { display: "flex", flexDirection: "column" },
    "& mdui-radio": { display: "flex" },
  },
});

const Table = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) repeat(4, 3.1rem)",
    alignItems: "center",
  },
});

const Cell = styled("div", {
  base: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    paddingBlock: "var(--gap-xs)",
  },
  variants: {
    label: {
      true: { fontSize: "0.7rem", color: "var(--md-sys-color-outline)" },
    },
    centered: {
      true: { justifyContent: "center" },
    },
  },
});

const ChannelName = styled("span", {
  base: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
});

const ChannelPicker = styled("select", {
  base: {
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
  },
});
