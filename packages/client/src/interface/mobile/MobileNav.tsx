import { For, JSX, Show, createMemo } from "solid-js";

import { Channel, Server as ServerI } from "stoat.js";

import {
  CategoryContextMenu,
  ChannelContextMenu,
  ServerSidebarContextMenu,
} from "@revolt/app";
import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useNavigate, useSmartParams } from "@revolt/routing";
import { Avatar, UserStatus } from "@revolt/ui";

import { ServerSidebar } from "../navigation/channels/ServerSidebar";
import { getFavorites } from "./MobileFavorites";
import { useMobileNav } from "./MobileNavContext";

/**
 * Mobile navigation — slide-in left overlay containing channel list,
 * Members button, and Favorites section.
 */
export function MobileNav(_props: {
  menuGenerator: (t: ServerI | Channel) => JSX.Directives["floating"];
}) {
  const { navOpen, closeNav, openMembers } = useMobileNav();
  const { openModal } = useModals();
  const params = useSmartParams();
  const client = useClient();
  const navigate = useNavigate();
  const favorites = getFavorites();

  const server = createMemo(() =>
    params().serverId ? client()?.servers.get(params().serverId!) : undefined,
  );

  function openServerInfo() {
    if (!server()) return;
    openModal({ type: "server_info", server: server()! });
  }

  function openServerSettings() {
    if (!server()) return;
    openModal({ type: "settings", config: "server", context: server()! });
  }

  const menuGenerator = (target: ServerI | Channel): JSX.Directives["floating"] => ({
    contextMenu: () =>
      target instanceof Channel ? (
        <ChannelContextMenu channel={target} />
      ) : target instanceof ServerI ? (
        <ServerSidebarContextMenu server={target} />
      ) : (
        <CategoryContextMenu server={server()!} category={target as never} />
      ),
  });

  return (
    <>
      <Show when={navOpen()}>
        <div
          style={{
            position: "fixed",
            inset: "0",
            "z-index": "400",
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0",
              background: "rgba(0,0,0,0.5)",
            }}
            onClick={closeNav}
          />

          <div
            style={{
              position: "relative",
              "z-index": "1",
              width: "min(320px, 85vw)",
              height: "100%",
              display: "flex",
              "flex-direction": "column",
              background: "var(--md-sys-color-surface-container-low)",
              overflow: "hidden",
            }}
          >
            <Show when={server()} fallback={<HomeNav />}>
              <div style={{ flex: "1", "min-height": "0", display: "flex", "flex-direction": "column" }}>
                <div style={{ flex: "1", "min-height": "0", overflow: "hidden" }}>
                  <ServerSidebar
                    server={server()!}
                    channelId={params().channelId}
                    openServerInfo={openServerInfo}
                    openServerSettings={openServerSettings}
                    menuGenerator={menuGenerator}
                  />
                </div>

                <button
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "12px",
                    padding: "14px 16px",
                    background: "var(--md-sys-color-surface-container)",
                    border: "none",
                    "border-top": "1px solid var(--md-sys-color-outline-variant)",
                    color: "var(--md-sys-color-on-surface)",
                    cursor: "pointer",
                    "font-size": "15px",
                    "text-align": "left",
                    width: "100%",
                    "flex-shrink": "0",
                  }}
                  onClick={() => {
                    closeNav();
                    openMembers();
                  }}
                >
                  <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>group</span>
                  Members
                </button>

                <Show when={favorites().length > 0}>
                  <div
                    style={{
                      "flex-shrink": "0",
                      "border-top": "1px solid var(--md-sys-color-outline-variant)",
                      background: "var(--md-sys-color-surface-container)",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 16px 4px",
                        "font-size": "11px",
                        "font-weight": "600",
                        "letter-spacing": "0.08em",
                        "text-transform": "uppercase",
                        color: "var(--md-sys-color-on-surface-variant)",
                      }}
                    >
                      Favorites
                    </div>
                    <For each={favorites()}>
                      {(fav) => {
                        const dmChannel = createMemo(() =>
                          [...(client()?.channels.values() ?? [])].find(
                            (ch) =>
                              ch.type === "DirectMessage" &&
                              ch.recipient?.id === fav.userId,
                          ),
                        );

                        const user = createMemo(() =>
                          client()?.users.get(fav.userId),
                        );

                        return (
                          <button
                            style={{
                              display: "flex",
                              "align-items": "center",
                              gap: "10px",
                              padding: "8px 16px",
                              background: "none",
                              border: "none",
                              color: "var(--md-sys-color-on-surface)",
                              cursor: "pointer",
                              width: "100%",
                              "text-align": "left",
                              "font-size": "14px",
                            }}
                            onClick={async () => {
                              closeNav();
                              if (dmChannel()) {
                                navigate(`/channel/${dmChannel()!.id}`);
                              } else {
                                const u = user();
                                if (u) {
                                  const ch = await u.openDM();
                                  navigate(`/channel/${ch.id}`);
                                }
                              }
                            }}
                          >
                            <div style={{ position: "relative", "flex-shrink": "0" }}>
                              <Avatar
                                size={32}
                                src={fav.avatarURL ?? undefined}
                                fallback={fav.username}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  bottom: "-1px",
                                  right: "-1px",
                                }}
                              >
                                <UserStatus.Graphic
                                  status={user()?.presence}
                                  size="10px"
                                />
                              </div>
                            </div>
                            <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                              {fav.username}
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}

function HomeNav() {
  return (
    <div style={{ padding: "16px", color: "var(--md-sys-color-on-surface)" }}>
      Naked as Created
    </div>
  );
}
