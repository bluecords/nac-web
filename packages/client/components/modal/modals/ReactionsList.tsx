import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { Emoji } from "@revolt/markdown";
import { useUsers } from "@revolt/markdown/users";
import { Avatar, Dialog, DialogProps, Text } from "@revolt/ui";

import { Modals } from "../types";

/** How many people to render at a time; more load as the list is scrolled. */
const PAGE = 40;

/**
 * Who reacted to a message: one chip per emoji, then the people for the
 * chosen emoji. Rows render in pages so a reaction with hundreds of
 * people only looks up the users actually scrolled to.
 */
export function ReactionsListModal(
  props: DialogProps & Modals & { type: "reactions_list" },
) {
  const reactions = () =>
    props.message.reactions as never as Map<string, Set<string>>;
  const keys = createMemo(() => [...reactions().keys()]);

  // eslint-disable-next-line solid/reactivity -- only the initial choice
  const [picked, setPicked] = createSignal<string | undefined>(props.emoji);
  const [limit, setLimit] = createSignal(PAGE);

  // Fall back to the first emoji if the chosen one was removed meanwhile.
  const current = () => {
    const p = picked();
    return p && keys().includes(p) ? p : keys()[0];
  };
  const people = createMemo(() => [
    ...(reactions().get(current() ?? "") ?? []),
  ]);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Reactions</Trans>}
      actions={[{ text: <Trans>Close</Trans> }]}
    >
      <Show
        when={keys().length}
        fallback={
          <Text>
            <Trans>No reactions on this message.</Trans>
          </Text>
        }
      >
        <div
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            gap: "8px",
            "margin-bottom": "12px",
          }}
        >
          <For each={keys()}>
            {(key) => (
              <button
                type="button"
                onClick={() => {
                  setPicked(key);
                  setLimit(PAGE);
                }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "6px",
                  padding: "4px 10px",
                  "border-radius": "16px",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  background:
                    key === current()
                      ? "var(--md-sys-color-secondary-container)"
                      : "var(--md-sys-color-surface-container-high)",
                }}
              >
                <Emoji emoji={key} /> {reactions().get(key)?.size ?? 0}
              </button>
            )}
          </For>
        </div>
        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) {
              setLimit((l) => Math.min(l + PAGE, people().length));
            }
          }}
          style={{
            "max-height": "min(50vh, 360px)",
            "overflow-y": "auto",
          }}
        >
          <For each={people().slice(0, limit())}>
            {(id) => <Person id={id} />}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}

/**
 * One person; looks the user up when first rendered
 */
function Person(props: { id: string }) {
  const info = useUsers(() => [props.id]);
  const user = () => info()[0];

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "10px",
        padding: "6px 8px",
      }}
    >
      <Avatar
        size={32}
        src={user()?.avatar}
        fallback={user()?.username ?? "?"}
      />
      <div style={{ "min-width": "0" }}>
        <div
          style={{
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
          }}
        >
          {user()?.username ?? <Trans>Unknown user</Trans>}
        </div>
        <Show when={user()?.user?.username}>
          <Text class="label" size="small">
            {user()?.user?.username}
          </Text>
        </Show>
      </div>
    </div>
  );
}
