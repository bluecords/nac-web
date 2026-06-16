import { createSignal, For, Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useState } from "@revolt/state";
import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

export function MoveToChannelModal(
  props: DialogProps & Modals & { type: "move_message" },
) {
  const state = useState();
  const { showError } = useModals();
  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const server = () => props.message.server;

  const filteredCategories = () => {
    const q = query().toLowerCase().trim();
    const cats = server()?.orderedChannels ?? [];
    if (!q) return cats;
    return cats
      .map((cat) => ({
        ...cat,
        channels: cat.channels.filter((ch) =>
          ch.name?.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.channels.length > 0);
  };

  async function moveMessage() {
    const targetChannelId = selectedId();
    if (!targetChannelId) return;

    const token = state.auth.getSession()?.token;
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(
        "https://community.nac.social:3210/api/move-message",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": token,
          },
          body: JSON.stringify({
            messageId: props.message.id,
            sourceChannelId: props.message.channelId,
            targetChannelId,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error ?? "Failed to move message");
        return;
      }

      props.onClose();
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Move to channel</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Move</Trans>,
          onClick: moveMessage,
          disabled: !selectedId(),
        },
      ]}
      isDisabled={loading()}
    >
      <input
        type="text"
        placeholder="Search channels..."
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        style={{ "margin-bottom": "8px" }}
      />
      <div
        style={{
          "max-height": "320px",
          "overflow-y": "auto",
          "border": "0.5px solid var(--color-border-tertiary)",
          "border-radius": "var(--border-radius-md)",
        }}
      >
        <For each={filteredCategories()}>
          {(category) => (
            <>
              <Show when={category.title}>
                <div
                  style={{
                    padding: "8px 12px 4px",
                    "font-size": "11px",
                    "font-weight": "500",
                    color: "var(--color-text-tertiary)",
                    "letter-spacing": "0.05em",
                    "text-transform": "uppercase",
                  }}
                >
                  {category.title}
                </div>
              </Show>
              <For each={category.channels}>
                {(channel) => (
                  <Show when={channel.id !== props.message.channelId}>
                    <div
                      onClick={() => setSelectedId(channel.id)}
                      style={{
                        padding: "8px 12px",
                        display: "flex",
                        "align-items": "center",
                        gap: "6px",
                        cursor: "pointer",
                        "border-radius": "4px",
                        background:
                          selectedId() === channel.id
                            ? "var(--color-background-info)"
                            : "transparent",
                        color:
                          selectedId() === channel.id
                            ? "var(--color-text-info)"
                            : "var(--color-text-primary)",
                        "font-weight":
                          selectedId() === channel.id ? "500" : "400",
                      }}
                    >
                      <span style={{ color: "var(--color-text-secondary)", "flex-shrink": "0" }}>#</span>
                      {channel.name}
                    </div>
                  </Show>
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </Dialog>
  );
}
