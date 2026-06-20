import { createMemo, For, Match, Show, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, Dialog, DialogProps, Text, UserStatus } from "@revolt/ui";

import { Modals } from "../types";

/**
 * List of all DM/Group conversations, unread first — guaranteed one-click
 * access regardless of whether the collapsible Home sidebar panel happens
 * to be open or closed.
 */
export function MessagesListModal(
  props: DialogProps & Modals & { type: "messages_list" },
) {
  const client = useClient();
  const state = useState();
  const navigate = useNavigate();

  const conversations = createMemo(() => {
    const all = state.ordering.orderedConversations(client());
    return [...all].sort((a, b) => Number(b.unread) - Number(a.unread));
  });

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Messages</Trans>}
      actions={[{ text: <Trans>Close</Trans> }]}
    >
      <Show
        when={conversations().length > 0}
        fallback={
          <Text>
            <Trans>No conversations yet.</Trans>
          </Text>
        }
      >
        <div style={{ "max-height": "400px", "overflow-y": "auto" }}>
          <For each={conversations()}>
            {(ch) => (
              <div
                onClick={() => {
                  navigate(`/channel/${ch.id}`);
                  props.onClose();
                }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "10px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  "border-radius": "4px",
                }}
              >
                <div style={{ position: "relative", "flex-shrink": "0" }}>
                  <Avatar
                    size={36}
                    src={
                      ch.type === "DirectMessage"
                        ? ch.recipient?.avatarURL ?? undefined
                        : ch.iconURL ?? undefined
                    }
                    fallback={
                      ch.type === "DirectMessage" ? ch.recipient?.username : ch.name
                    }
                  />
                  <Show when={ch.type === "DirectMessage"}>
                    <div
                      style={{ position: "absolute", bottom: "-1px", right: "-1px" }}
                    >
                      <UserStatus.Graphic
                        status={ch.recipient?.presence}
                        size="10px"
                      />
                    </div>
                  </Show>
                </div>
                <span
                  style={{
                    flex: "1",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                    "font-weight": ch.unread ? "600" : "400",
                  }}
                >
                  <Switch>
                    <Match when={ch.type === "Group"}>{ch.name}</Match>
                    <Match when={ch.type === "DirectMessage"}>
                      {ch.recipient?.serverNickname ?? ch.recipient?.displayName}
                    </Match>
                  </Switch>
                </span>
                <Show when={ch.unread}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      background: "var(--md-sys-color-primary)",
                      "flex-shrink": "0",
                    }}
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}
