import { createSignal, For, Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useClient } from "@revolt/client";
import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

export function MoveToChannelModal(
  props: DialogProps & Modals & { type: "move_message" },
) {
  const client = useClient();
  const { showError } = useModals();
  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const server = () => props.message.server;

  /**
   * Only text and forum channels can receive a moved post, and the server
   * requires Manage Messages in the target as well as the source.
   */
  const canMoveTo = (ch: { type: string; havePermission: (p: "ManageMessages") => boolean }) =>
    (ch.type === "TextChannel" || ch.type === "ForumChannel") &&
    ch.havePermission("ManageMessages");

  const filteredCategories = () => {
    const q = query().toLowerCase().trim();
    const cats = server()?.orderedChannels ?? [];
    return cats
      .map((cat) => ({
        ...cat,
        channels: cat.channels.filter(
          (ch) => canMoveTo(ch) && (!q || ch.name?.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.channels.length > 0);
  };

  async function moveMessage() {
    const targetChannelId = selectedId();
    if (!targetChannelId) return;

    setLoading(true);
    try {
      // The server moves the whole post (a forum post takes its replies) and
      // keeps its author, reactions and attachments.
      //
      // Sent with fetch rather than client().api.post(): stoat-api only builds
      // a request body for routes in its typed route map and sends `{}` for
      // anything else, so the server refused this with a 422. Same base URL
      // and auth headers as every other call; the error is thrown as raw
      // response text, exactly as stoat-api does, so showError handles it the
      // same way.
      const api = client().api;
      const res = await fetch(
        `${api.config.baseURL}/channels/${props.message.channelId}/messages/${props.message.id}/move`,
        {
          method: "POST",
          headers: {
            ...api.config.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel: targetChannelId }),
        },
      );
      if (!res.ok) throw await res.text();

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
          isDisabled: !selectedId(),
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
          // These were --color-border-tertiary / --border-radius-md, which do
          // not exist. Measured in the browser: both resolved to "", so the
          // declarations were invalid and simply dropped. This whole modal was
          // written against a token set the app does not use - everything else
          // here is --md-sys-color-*. Note --borderRadius-md is camelCase.
          "border": "0.5px solid var(--md-sys-color-outline-variant)",
          "border-radius": "var(--borderRadius-md)",
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
                    color: "var(--md-sys-color-on-surface-variant)",
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
                      role="button"
                      tabindex="0"
                      aria-pressed={selectedId() === channel.id}
                      onClick={() => setSelectedId(channel.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(channel.id);
                        }
                      }}
                      style={{
                        padding: "8px 12px",
                        display: "flex",
                        "align-items": "center",
                        gap: "6px",
                        cursor: "pointer",
                        "border-radius": "4px",
                        // Was --color-background-info / --color-text-info /
                        // --color-text-primary. None of the three exist, so the
                        // selected row was styled identically to an unselected
                        // one: tapping a channel DID select it and showed no
                        // feedback at all, which reads as "nothing is clickable".
                        background:
                          selectedId() === channel.id
                            ? "var(--md-sys-color-secondary-container)"
                            : "transparent",
                        color:
                          selectedId() === channel.id
                            ? "var(--md-sys-color-on-secondary-container)"
                            : "var(--md-sys-color-on-surface)",
                        "font-weight":
                          selectedId() === channel.id ? "500" : "400",
                      }}
                    >
                      <span style={{ color: "var(--md-sys-color-on-surface-variant)", "flex-shrink": "0" }}>#</span>
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
