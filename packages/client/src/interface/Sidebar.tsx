import {
  Component,
  JSX,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
} from "solid-js";

import { Channel, Server as ServerI } from "stoat.js";

import {
  CategoryContextMenu,
  ChannelContextMenu,
  ServerSidebarContextMenu,
} from "@revolt/app";
import { useClient, useUser } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useLocation, useParams, useSmartParams } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";

import { MobileNav } from "./mobile/MobileNav";
import { useMobileNav } from "./mobile/MobileNavContext";
import { HomeSidebar, ServerList, ServerSidebar } from "./navigation";

/**
 * Left-most channel navigation sidebar
 */
export const Sidebar = (props: {
  /**
   * Menu generator TODO FIXME: remove
   */
  menuGenerator: (t: ServerI | Channel) => JSX.Directives["floating"];
}) => {
  const user = useUser();
  const state = useState();
  const client = useClient();
  const { openModal } = useModals();
  const { isMobile } = useMobileNav();

  const params = useParams<{ server: string }>();
  const location = useLocation();

  // Backfill the full member roster via REST. The WS Ready payload is the
  // only thing that ever populates client.serverMembers, and it can come
  // back incomplete for a given connection (confirmed: a member present and
  // correct via GET /servers/:id/members and in the DB was simply absent
  // from one user's local autocomplete/mention search space). fetchMembers()
  // already exists in stoat.js and hydrates the same collections the Ready
  // handler does — it was just never called anywhere in this app. Guarded by
  // a per-session Set so each server is only backfilled once, not on every
  // render.
  const fetchedMemberLists = new Set<string>();
  createEffect(() => {
    const serverId = params.server;
    if (!serverId || fetchedMemberLists.has(serverId)) return;
    fetchedMemberLists.add(serverId);

    const server = client()?.servers.get(serverId);
    server?.fetchMembers().catch((err) => {
      console.warn(
        "[Sidebar] fetchMembers backfill failed for server",
        serverId,
        err,
      );
      fetchedMemberLists.delete(serverId); // allow a retry on next visit
    });
  });

  return (
    <>
    <Show when={isMobile()}>
      <MobileNav menuGenerator={props.menuGenerator} />
    </Show>
    <Show when={!isMobile()}>
    <div style={{ display: "flex", "flex-shrink": 0 }}>
      <ServerList
        orderedServers={state.ordering.orderedServers(client())}
        setServerOrder={state.ordering.setServerOrder}
        unreadConversations={state.ordering
          .orderedConversations(client())
          .filter(
            // TODO: muting channels
            (channel) => channel.unread,
          )}
        user={user()!}
        selectedServer={() => params.server}
        onCreateOrJoinServer={() =>
          openModal({
            type: "create_or_join_server",
            client: client(),
          })
        }
        menuGenerator={props.menuGenerator}
      />
      <Show
        when={
          state.layout.getSectionState(LAYOUT_SECTIONS.PRIMARY_SIDEBAR, true) &&
          !location.pathname.startsWith("/discover")
        }
      >
        <Switch fallback={<Home />}>
          <Match when={params.server}>
            <Server />
          </Match>
        </Switch>
      </Show>
    </div>
    </Show>
    </>
  );
};

/**
 * Render sidebar for home
 */
const Home: Component = () => {
  const params = useSmartParams();
  const client = useClient();
  const state = useState();
  const conversations = createMemo(() =>
    state.ordering.orderedConversations(client()),
  );

  return (
    <HomeSidebar
      conversations={conversations}
      channelId={params().channelId}
      openSavedNotes={(navigate) => {
        // Check whether the saved messages channel exists already
        const channelId = [...client()!.channels.values()].find(
          (channel) => channel.type === "SavedMessages",
        )?.id;

        if (navigate) {
          if (channelId) {
            // Navigate if exists
            navigate(`/channel/${channelId}`);
          } else {
            // If not, try to create one but only if navigating
            client()!
              .user!.openDM()
              .then((channel) => navigate(`/channel/${channel.id}`));
          }
        }

        // Otherwise return channel ID if available
        return channelId;
      }}
    />
  );
};

/**
 * Render sidebar for a server
 */
const Server: Component = () => {
  const { openModal } = useModals();
  const params = useSmartParams();
  const client = useClient();

  /**
   * Resolve the server
   * @returns Server
   */
  const server = () => client()!.servers.get(params().serverId!)!;

  /**
   * Open the server information modal
   */
  function openServerInfo() {
    openModal({
      type: "server_info",
      server: server(),
    });
  }

  /**
   * Open the server settings modal
   */
  function openServerSettings() {
    openModal({
      type: "settings",
      config: "server",
      context: server(),
    });
  }

  return (
    <Show when={server()}>
      <ServerSidebar
        server={server()}
        channelId={params().channelId}
        openServerInfo={openServerInfo}
        openServerSettings={openServerSettings}
        menuGenerator={(target) => ({
          contextMenu: () =>
            target instanceof Channel ? (
              <ChannelContextMenu channel={target} />
            ) : target instanceof ServerI ? (
              <ServerSidebarContextMenu server={target} />
            ) : (
              <CategoryContextMenu server={server()} category={target} />
            ),
        })}
      />
    </Show>
  );
};
