import { For, Match, Show, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import dayjs from "dayjs";
import { Server } from "stoat.js";

import { useState } from "@revolt/state";
import { Column, Text, Time } from "@revolt/ui";

import MdAlternateEmail from "@material-design-icons/svg/outlined/alternate_email.svg?component-solid";
import MdNotificationsActive from "@material-design-icons/svg/outlined/notifications_active.svg?component-solid";
import MdNotificationsOff from "@material-design-icons/svg/outlined/notifications_off.svg?component-solid";

import MdDoNotDisturbOff from "@material-symbols/svg-400/outlined/do_not_disturb_off.svg?component-solid";
import MdDoNotDisturbOn from "@material-symbols/svg-400/outlined/do_not_disturb_on.svg?component-solid";
import MdNotificationSettings from "@material-symbols/svg-400/outlined/notification_settings.svg?component-solid";
import MdRadioButtonChecked from "@material-symbols/svg-400/outlined/radio_button_checked-fill.svg?component-solid";
import MdRadioButtonUnchecked from "@material-symbols/svg-400/outlined/radio_button_unchecked.svg?component-solid";

import { ContextMenuButton, ContextMenuSubMenu } from "../ContextMenu";

/**
 * Mute and notification choices for a whole category: the channels in it
 * follow, unless a channel has a choice of its own.
 */
export function CategoryNotificationContextMenu(props: {
  server: Server;
  categoryId: string;
}) {
  const state = useState();

  /**
   * What this category effectively gives: its own choice, else the server's
   */
  const effective = () =>
    state.notifications.getCategory(props.categoryId) ??
    state.notifications.computeForServer(props.server);

  return (
    <>
      <Show
        when={!state.notifications.isCategoryMuted(props.categoryId)}
        fallback={
          <ContextMenuButton
            onClick={() =>
              state.notifications.setCategoryMute(props.categoryId, undefined)
            }
            symbol={MdDoNotDisturbOff}
            _titleCase={false}
          >
            <Column gap="none">
              <Trans>Unmute Category</Trans>
              <Show
                when={
                  state.notifications.getCategoryMute(props.categoryId)?.until
                }
              >
                <Text class="label" size="small">
                  <Trans>
                    Muted until{" "}
                    <Time
                      format="datetime"
                      value={
                        state.notifications.getCategoryMute(props.categoryId)!
                          .until
                      }
                    />
                  </Trans>
                </Text>
              </Show>
            </Column>
          </ContextMenuButton>
        }
      >
        <ContextMenuSubMenu
          onClick={() =>
            state.notifications.setCategoryMute(props.categoryId, {})
          }
          buttonContent={<Trans>Mute Category</Trans>}
          symbol={MdDoNotDisturbOn}
        >
          <For
            each={
              [
                [15, <Trans>For 15 minutes</Trans>],
                [60, <Trans>For 1 hour</Trans>],
                [180, <Trans>For 3 hours</Trans>],
                [480, <Trans>For 8 hours</Trans>],
                [1440, <Trans>For 24 hours</Trans>],
                [undefined, <Trans>Until I turn it back on</Trans>],
              ] as const
            }
          >
            {([timeMin, i18n]) => (
              <ContextMenuButton
                onClick={() =>
                  state.notifications.setCategoryMute(props.categoryId, {
                    until: timeMin
                      ? +dayjs().add(timeMin, "minutes")
                      : undefined,
                  })
                }
                _titleCase={false}
              >
                {i18n}
              </ContextMenuButton>
            )}
          </For>
        </ContextMenuSubMenu>
      </Show>

      <ContextMenuSubMenu
        symbol={MdNotificationSettings}
        buttonContent={
          <Column gap="none">
            <Trans>Notification Settings</Trans>
            <Text class="label" size="small">
              <Switch fallback={<Trans>None</Trans>}>
                <Match when={effective() === "all"}>
                  <Trans>All Messages</Trans>
                </Match>
                <Match when={effective() === "mention"}>
                  <Trans>Mentions Only</Trans>
                </Match>
              </Switch>
            </Text>
          </Column>
        }
      >
        <ContextMenuButton
          onClick={() =>
            state.notifications.setCategory(props.categoryId, undefined)
          }
          actionSymbol={
            typeof state.notifications.getCategory(props.categoryId) ===
            "undefined"
              ? MdRadioButtonChecked
              : MdRadioButtonUnchecked
          }
        >
          <Column gap="none">
            <Trans>Server Default</Trans>
            <Text class="label" size="small">
              <Switch fallback={<Trans>None</Trans>}>
                <Match
                  when={
                    state.notifications.computeForServer(props.server) === "all"
                  }
                >
                  <Trans>All Messages</Trans>
                </Match>
                <Match
                  when={
                    state.notifications.computeForServer(props.server) ===
                    "mention"
                  }
                >
                  <Trans>Mentions Only</Trans>
                </Match>
              </Switch>
            </Text>
          </Column>
        </ContextMenuButton>

        <ContextMenuButton
          icon={MdNotificationsActive}
          onClick={() =>
            state.notifications.setCategory(props.categoryId, "all")
          }
          actionSymbol={
            state.notifications.getCategory(props.categoryId) === "all"
              ? MdRadioButtonChecked
              : MdRadioButtonUnchecked
          }
        >
          <Trans>All Messages</Trans>
        </ContextMenuButton>
        <ContextMenuButton
          icon={MdAlternateEmail}
          onClick={() =>
            state.notifications.setCategory(props.categoryId, "mention")
          }
          actionSymbol={
            state.notifications.getCategory(props.categoryId) === "mention"
              ? MdRadioButtonChecked
              : MdRadioButtonUnchecked
          }
        >
          <Trans>Mentions Only</Trans>
        </ContextMenuButton>
        <ContextMenuButton
          icon={MdNotificationsOff}
          onClick={() =>
            state.notifications.setCategory(props.categoryId, "none")
          }
          actionSymbol={
            state.notifications.getCategory(props.categoryId) === "none"
              ? MdRadioButtonChecked
              : MdRadioButtonUnchecked
          }
        >
          <Trans>None</Trans>
        </ContextMenuButton>
      </ContextMenuSubMenu>
    </>
  );
}
