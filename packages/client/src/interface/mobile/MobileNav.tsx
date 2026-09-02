import { For, JSX, Show, createMemo } from "solid-js";

import { Channel, Server as ServerI } from "stoat.js";

import {
  CategoryContextMenu,
  ChannelContextMenu,
  ServerSidebarContextMenu,
} from "@revolt/app";
import { getFavorites, useClient, useUser } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useNavigate, useSmartParams } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, Unreads, UserStatus } from "@revolt/ui";

import { ServerSidebar } from "../navigation/channels/ServerSidebar";
import { useMobileNav } from "./MobileNavContext";

/**
 * Mobile navigation — slide-in left overlay containing channel list,
 * Members button, and Favorites section.
 */
export function MobileNav(_props: {
  menuGenerator: (t: ServerI | Channel) => JSX.Directives["floating"];
}) {
  const { navOpen, openNav, closeNav, openMembers, openMessages, editMode, setEditMode } =
    useMobileNav();
  const { openModal } = useModals();
  const params = useSmartParams();
  const client = useClient();
  const user = useUser();
  const navigate = useNavigate();
  const favorites = getFavorites();
  const state = useState();

  const conversations = createMemo(() =>
    state.ordering.orderedConversations(client()),
  );

  const unreadDMCount = createMemo(
    () => conversations().filter((ch) => ch.unread).length,
  );

  const pendingFriendRequests = createMemo(
    () =>
      client()?.users.filter((u) => u.relationship === "Incoming").length ??
      0,
  );

  const server = createMemo(() =>
    params().serverId ? client()?.servers.get(params().serverId!) : undefined,
  );

  const orderedServers = createMemo(() => {
    const c = client();
    if (!c) return [];
    return [...c.servers.values()];
  });

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
      {/* Persistent hamburger — always visible on mobile so home screen has nav access */}
      <Show when={!navOpen()}>
        <button
          aria-label="Open navigation"
          style={{
            position: "fixed",
            top: "8px",
            left: "8px",
            "z-index": "350",
            background: "var(--md-sys-color-surface-container-high)",
            border: "none",
            "border-radius": "8px",
            width: "40px",
            height: "40px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            cursor: "pointer",
            "box-shadow": "0 2px 8px rgba(0,0,0,0.3)",
            color: "var(--md-sys-color-on-surface)",
          }}
          onClick={openNav}
        >
          <span style={{ "font-family": "Material Symbols Outlined", "font-size": "22px" }}>menu</span>
        </button>
      </Show>

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
            {/* User bar — split into two tap targets: profile/settings, and messages */}
            <div
              style={{
                display: "flex",
                "align-items": "center",
                background: "var(--md-sys-color-surface-container)",
                "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
                "flex-shrink": "0",
              }}
            >
              <button
                onClick={() => { closeNav(); openModal({ type: "settings", config: "user" }); }}
                aria-label="Open settings"
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "10px",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "text-align": "left",
                  flex: "1",
                  "min-width": "0",
                }}
              >
                <div style={{ position: "relative", "flex-shrink": "0" }}>
                  <Avatar
                    size={36}
                    src={user()?.animatedAvatarURL ?? undefined}
                    fallback={user()?.username}
                  />
                  <div style={{ position: "absolute", bottom: "-1px", right: "-1px" }}>
                    <UserStatus.Graphic status={user()?.presence} size="10px" />
                  </div>
                </div>
                <div style={{ "min-width": "0", flex: "1" }}>
                  <div style={{
                    "font-size": "14px",
                    "font-weight": "600",
                    color: "var(--md-sys-color-on-surface)",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}>
                    {user()?.displayName ?? user()?.username}
                  </div>
                  <div style={{
                    "font-size": "12px",
                    color: "var(--md-sys-color-on-surface-variant)",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}>
                    {user()?.username}
                  </div>
                </div>
                <span style={{
                  "font-family": "Material Symbols Outlined",
                  "font-size": "18px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  "flex-shrink": "0",
                }}>
                  manage_accounts
                </span>
              </button>
              <button
                onClick={() => { closeNav(); navigate("/friends"); }}
                aria-label="Open friends"
                style={{
                  position: "relative",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "flex-shrink": "0",
                }}
              >
                <span style={{
                  "font-family": "Material Symbols Outlined",
                  "font-size": "22px",
                  color: "var(--md-sys-color-on-surface-variant)",
                }}>
                  group
                </span>
                <Show when={pendingFriendRequests() > 0}>
                  <div style={{ position: "absolute", top: "4px", right: "4px" }}>
                    <Unreads.Graphic count={pendingFriendRequests()} unread />
                  </div>
                </Show>
              </button>
              <button
                onClick={() => { closeNav(); openMessages(); }}
                aria-label="Open messages"
                style={{
                  position: "relative",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  "flex-shrink": "0",
                }}
              >
                <span style={{
                  "font-family": "Material Symbols Outlined",
                  "font-size": "22px",
                  color: "var(--md-sys-color-on-surface-variant)",
                }}>
                  chat_bubble
                </span>
                <Show when={unreadDMCount() > 0}>
                  <div style={{ position: "absolute", top: "4px", right: "4px" }}>
                    <Unreads.Graphic count={unreadDMCount()} unread />
                  </div>
                </Show>
              </button>
            </div>

            <Show when={server()} fallback={
              <HomeNav
                servers={orderedServers()}
                onSelect={(s) => {
                  const firstChannel = [...s.channels.values()].find(
                    (ch) => ch.type === "TextChannel",
                  );
                  if (firstChannel) {
                    navigate(`/server/${s.id}/channel/${firstChannel.id}`);
                  } else {
                    navigate(`/server/${s.id}`);
                  }
                  closeNav();
                }}
              />
            }>
              <div style={{ flex: "1", "min-height": "0", display: "flex", "flex-direction": "column" }}>
                {/* Server switcher row — split into a scrollable server-icon
                    strip plus a fixed cluster of quick-action icons, so
                    Members/Server Settings/Favorites/Edit don't eat into
                    space meant for seeing channels. */}
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "flex-shrink": "0",
                    background: "var(--md-sys-color-surface-container)",
                    "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "8px",
                      padding: "8px 12px",
                      "overflow-x": "auto",
                      "min-width": "0",
                      flex: "1",
                      "scrollbar-width": "none",
                    }}
                  >
                    <For each={orderedServers()}>
                      {(s) => (
                        <button
                          title={s.name}
                          style={{
                            "flex-shrink": "0",
                            background: s.id === params().serverId
                              ? "var(--md-sys-color-primary-container)"
                              : "none",
                            border: s.id === params().serverId
                              ? "2px solid var(--md-sys-color-primary)"
                              : "2px solid transparent",
                            "border-radius": "12px",
                            padding: "2px",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            const firstChannel = [...s.channels.values()].find(
                              (ch) => ch.type === "TextChannel",
                            );
                            if (firstChannel) {
                              navigate(`/server/${s.id}/channel/${firstChannel.id}`);
                            } else {
                              navigate(`/server/${s.id}`);
                            }
                            // Same defect as the channel list: this switched
                            // server and left the drawer covering the result.
                            // Its twin handler above already did this.
                            closeNav();
                          }}
                        >
                          <Avatar
                            size={36}
                            src={s.iconURL ?? undefined}
                            fallback={s.name}
                            holepunch={s.mentions.length ? "top-right" : "none"}
                            overlay={
                              <Show when={s.mentions.length}>
                                <Unreads.Graphic count={s.mentions.length} unread />
                              </Show>
                            }
                          />
                        </button>
                      )}
                    </For>
                  </div>

                  {/* Quick-action icon cluster — pinned, doesn't scroll away */}
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "2px",
                      padding: "0 8px",
                      "flex-shrink": "0",
                      "border-left": "1px solid var(--md-sys-color-outline-variant)",
                    }}
                  >
                    <button
                      title="Members"
                      aria-label="Members"
                      onClick={() => { closeNav(); openMembers(); }}
                      style={{
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        padding: "8px",
                        background: "none",
                        border: "none",
                        color: "var(--md-sys-color-on-surface-variant)",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>group</span>
                    </button>
                    <Show when={favorites().length > 0}>
                      <button
                        title="Favorites"
                        aria-label="Favorites"
                        onClick={() => { closeNav(); openModal({ type: "favorites_list" }); }}
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                          padding: "8px",
                          background: "none",
                          border: "none",
                          color: "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>star</span>
                      </button>
                    </Show>
                    <Show when={server()?.orPermission("ManageServer", "ManageCustomisation", "ManageRole", "ManagePermissions")}>
                      <button
                        title="Server Settings"
                        aria-label="Server Settings"
                        onClick={() => { closeNav(); openModal({ type: "settings", config: "server", context: server()! }); }}
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                          padding: "8px",
                          background: "none",
                          border: "none",
                          color: "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>settings</span>
                      </button>
                    </Show>
                    <Show when={server()?.havePermission("ManageChannel")}>
                      <button
                        title={editMode() ? "Done reordering" : "Reorder channels"}
                        aria-label={editMode() ? "Done reordering" : "Reorder channels"}
                        onClick={() => setEditMode(!editMode())}
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                          padding: "8px",
                          background: editMode() ? "var(--md-sys-color-primary)" : "none",
                          border: "none",
                          color: editMode() ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                          "border-radius": editMode() ? "8px" : "0",
                        }}
                      >
                        <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>
                          {editMode() ? "check" : "edit"}
                        </span>
                      </button>
                    </Show>
                  </div>
                </div>

                <div
                  style={{ flex: "1", "min-height": "0", "overflow-y": "auto", position: "relative" }}
                  onClick={(e) => {
                    // Selecting a channel has to dismiss the drawer, or the
                    // channel you just picked stays hidden behind it and the
                    // only way out is a ~1/4in strip of background down the
                    // right edge. Reported by Bunjie 2026-09-01.
                    //
                    // Delegated here rather than threaded down as a callback:
                    // the entries live three components deep (ServerSidebar ->
                    // Category -> Entry) in a component desktop shares, and
                    // they render as real anchors. Catching the click at the
                    // container also handles tapping the channel you are
                    // ALREADY in, where the route never changes so watching
                    // params().channelId would miss it.
                    if (editMode()) return; // reordering: a drag must not close it
                    const target = e.target as HTMLElement | null;
                    if (target?.closest?.("a[href*='/channel/']")) closeNav();
                  }}
                >
                  <ServerSidebar
                    server={server()!}
                    channelId={params().channelId}
                    openServerInfo={openServerInfo}
                    openServerSettings={openServerSettings}
                    menuGenerator={menuGenerator}
                    lockReorder={!editMode()}
                  />
                  {/* Edit mode overlay banner */}
                  <Show when={editMode()}>
                    <div style={{
                      position: "absolute",
                      bottom: "0",
                      left: "0",
                      right: "0",
                      background: "var(--md-sys-color-primary-container)",
                      color: "var(--md-sys-color-on-primary-container)",
                      padding: "8px 16px",
                      "font-size": "12px",
                      "text-align": "center",
                      "font-weight": "500",
                    }}>
                      Drag channels to reorder
                    </div>
                  </Show>
                </div>

              </div>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}

function HomeNav(props: { servers: ServerI[]; onSelect: (s: ServerI) => void }) {
  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          padding: "16px",
          "font-size": "13px",
          "font-weight": "600",
          "letter-spacing": "0.06em",
          "text-transform": "uppercase",
          color: "var(--md-sys-color-on-surface-variant)",
          "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
        }}
      >
        Your Servers
      </div>
      <div style={{ flex: "1", "overflow-y": "auto" }}>
        <For each={props.servers}>
          {(s) => (
            <button
              style={{
                display: "flex",
                "align-items": "center",
                gap: "12px",
                padding: "10px 16px",
                background: "none",
                border: "none",
                cursor: "pointer",
                width: "100%",
                "text-align": "left",
                color: "var(--md-sys-color-on-surface)",
                "font-size": "15px",
              }}
              onClick={() => props.onSelect(s)}
            >
              <Avatar
                size={36}
                src={s.iconURL ?? undefined}
                fallback={s.name}
                holepunch={s.mentions.length ? "top-right" : "none"}
                overlay={
                  <Show when={s.mentions.length}>
                    <Unreads.Graphic count={s.mentions.length} unread />
                  </Show>
                }
              />
              <span style={{
                flex: "1",
                overflow: "hidden",
                "text-overflow": "ellipsis",
                "white-space": "nowrap",
              }}>
                {s.name}
              </span>
              <Show when={s.unread && !s.mentions.length}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  "border-radius": "50%",
                  background: "var(--md-sys-color-on-surface-variant)",
                  "flex-shrink": "0",
                }} />
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
