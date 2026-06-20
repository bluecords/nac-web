import { For, Match, Show, Switch, createMemo } from "solid-js";

import { useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, UserStatus } from "@revolt/ui";

import { useMobileNav } from "./MobileNavContext";

/**
 * Full-screen messages overlay for mobile — lists all active DM/Group
 * conversations, unread first, since the slide-in nav has no room to
 * surface this on its own.
 */
export function MobileMessagesOverlay() {
  const { messagesOpen, closeMessages } = useMobileNav();
  const client = useClient();
  const state = useState();
  const navigate = useNavigate();

  const conversations = createMemo(() => {
    const all = state.ordering.orderedConversations(client());
    return [...all].sort((a, b) => Number(b.unread) - Number(a.unread));
  });

  return (
    <Show when={messagesOpen()}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "500",
          display: "flex",
          "flex-direction": "column",
          background: "var(--md-sys-color-surface-container-low)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            padding: "12px 16px",
            background: "var(--md-sys-color-surface-container)",
            "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
            "flex-shrink": "0",
          }}
        >
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--md-sys-color-on-surface)",
              display: "flex",
              "align-items": "center",
              padding: "4px",
            }}
            onClick={closeMessages}
            aria-label="Close messages"
          >
            <span
              style={{
                "font-size": "24px",
                "font-family": "Material Symbols Outlined",
              }}
            >
              arrow_back
            </span>
          </button>
          <span
            style={{
              "font-size": "16px",
              "font-weight": "500",
              color: "var(--md-sys-color-on-surface)",
            }}
          >
            Messages
          </span>
        </div>

        <div style={{ flex: "1", "overflow-y": "auto" }}>
          <Show
            when={conversations().length > 0}
            fallback={
              <div
                style={{
                  padding: "32px 16px",
                  "text-align": "center",
                  color: "var(--md-sys-color-on-surface-variant)",
                  "font-size": "14px",
                }}
              >
                No conversations yet.
              </div>
            }
          >
            <For each={conversations()}>
              {(ch) => (
                <button
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "12px",
                    padding: "10px 16px",
                    background: "none",
                    border: "none",
                    color: "var(--md-sys-color-on-surface)",
                    cursor: "pointer",
                    width: "100%",
                    "text-align": "left",
                    "font-size": "14px",
                  }}
                  onClick={() => {
                    closeMessages();
                    navigate(`/channel/${ch.id}`);
                  }}
                >
                  <div style={{ position: "relative", "flex-shrink": "0" }}>
                    <Avatar
                      size={40}
                      src={
                        ch.type === "DirectMessage"
                          ? ch.recipient?.avatarURL ?? undefined
                          : ch.iconURL ?? undefined
                      }
                      fallback={
                        ch.type === "DirectMessage"
                          ? ch.recipient?.username
                          : ch.name
                      }
                    />
                    <Show when={ch.type === "DirectMessage"}>
                      <div
                        style={{
                          position: "absolute",
                          bottom: "-1px",
                          right: "-1px",
                        }}
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
                        {ch.recipient?.serverNickname ??
                          ch.recipient?.displayName}
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
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
    </Show>
  );
}
