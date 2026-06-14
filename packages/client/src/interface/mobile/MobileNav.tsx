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
  const { navOpen, openNav, closeNav, openMembers, editMode, setEditMode } = useMobileNav();
  const { openModal } = useModals();
  const params = useSmartParams();
  const client = useClient();
  const navigate = useNavigate();
  const favorites = getFavorites();

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
                {/* Compact server switcher row */}
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "8px 12px",
                    "overflow-x": "auto",
                    "flex-shrink": "0",
                    background: "var(--md-sys-color-surface-container)",
                    "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
                    scrollbarWidth: "none",
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
                        }}
                      >
                        <Avatar
                          size={36}
                          src={s.iconURL ?? undefined}
                          fallback={s.name}
                        />
                      </button>
                    )}
                  </For>
                </div>

                <div style={{ flex: "1", "min-height": "0", "overflow-y": "auto", position: "relative" }}>
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

                <div style={{
                  display: "flex",
                  "flex-direction": "column",
                  "flex-shrink": "0",
                  "border-top": "1px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container)",
                }}>
                  {/* Members + Edit row */}
                  <div style={{ display: "flex" }}>
                    <button
                      style={{
                        display: "flex",
                        "align-items": "center",
                        gap: "12px",
                        padding: "14px 16px",
                        background: "none",
                        border: "none",
                        color: "var(--md-sys-color-on-surface)",
                        cursor: "pointer",
                        "font-size": "15px",
                        "text-align": "left",
                        flex: "1",
                      }}
                      onClick={() => { closeNav(); openMembers(); }}
                    >
                      <span style={{ "font-size": "20px", "font-family": "Material Symbols Outlined" }}>group</span>
                      Members
                    </button>

                    <Show when={server()?.havePermission("ManageChannel")}>
                      <button
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "6px",
                          padding: "14px 16px",
                          background: editMode() ? "var(--md-sys-color-primary)" : "none",
                          border: "none",
                          color: editMode() ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                          "font-size": "13px",
                          "font-weight": "600",
                          "flex-shrink": "0",
                          "border-radius": editMode() ? "8px" : "0",
                          margin: editMode() ? "6px" : "0",
                        }}
                        onClick={() => setEditMode(!editMode())}
                      >
                        <span style={{ "font-size": "18px", "font-family": "Material Symbols Outlined" }}>
                          {editMode() ? "check" : "edit"}
                        </span>
                        {editMode() ? "Done" : "Edit"}
                      </button>
                    </Show>
                  </div>

                  {/* Settings row */}
                  <div style={{
                    display: "flex",
                    "border-top": "1px solid var(--md-sys-color-outline-variant)",
                  }}>
                    <Show when={server()?.orPermission("ManageServer", "ManageCustomisation", "ManageRole", "ManagePermissions")}>
                      <button
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "10px",
                          padding: "12px 16px",
                          background: "none",
                          border: "none",
                          color: "var(--md-sys-color-on-surface-variant)",
                          cursor: "pointer",
                          "font-size": "14px",
                          flex: "1",
                        }}
                        onClick={() => {
                          closeNav();
                          openModal({ type: "settings", config: "server", context: server()! });
                        }}
                      >
                        <span style={{ "font-size": "18px", "font-family": "Material Symbols Outlined" }}>settings</span>
                        Server Settings
                      </button>
                    </Show>
                  </div>
                </div>

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
              <Avatar size={36} src={s.iconURL ?? undefined} fallback={s.name} />
              <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                {s.name}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
