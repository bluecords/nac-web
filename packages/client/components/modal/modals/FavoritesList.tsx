import { createMemo, For, Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { getFavorites, useClient } from "@revolt/client";
import { useNavigate } from "@revolt/routing";
import { Avatar, Dialog, DialogProps, Text, UserStatus } from "@revolt/ui";

import { Modals } from "../types";

/**
 * List of favorited users — opens their DM on click
 */
export function FavoritesListModal(
  props: DialogProps & Modals & { type: "favorites_list" },
) {
  const client = useClient();
  const navigate = useNavigate();
  const favorites = getFavorites();

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Favorites</Trans>}
      actions={[{ text: <Trans>Close</Trans> }]}
    >
      <Show
        when={favorites().length > 0}
        fallback={
          <Text>
            <Trans>You haven't favorited anyone yet.</Trans>
          </Text>
        }
      >
        <div
          style={{
            "max-height": "320px",
            "overflow-y": "auto",
          }}
        >
          <For each={favorites()}>
            {(fav) => {
              const dmChannel = createMemo(() =>
                [...(client()?.channels.values() ?? [])].find(
                  (ch) =>
                    ch.type === "DirectMessage" && ch.recipient?.id === fav.userId,
                ),
              );

              const user = createMemo(() => client()?.users.get(fav.userId));

              return (
                <div
                  onClick={async () => {
                    if (dmChannel()) {
                      navigate(`/channel/${dmChannel()!.id}`);
                    } else {
                      const u = user();
                      if (u) {
                        const ch = await u.openDM();
                        navigate(`/channel/${ch.id}`);
                      }
                    }
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
                      size={32}
                      src={fav.avatarURL ?? undefined}
                      fallback={fav.username}
                    />
                    <div
                      style={{ position: "absolute", bottom: "-1px", right: "-1px" }}
                    >
                      <UserStatus.Graphic status={user()?.presence} size="10px" />
                    </div>
                  </div>
                  <span
                    style={{
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {user()?.serverNickname ?? fav.username}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </Dialog>
  );
}
