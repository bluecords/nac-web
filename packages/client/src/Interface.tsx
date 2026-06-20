import { JSX, Match, Switch, createEffect } from "solid-js";

import { Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { ChannelContextMenu, ServerContextMenu } from "@revolt/app";
import { MessageCache } from "@revolt/app/interface/channels/text/MessageCache";
import { Titlebar } from "@revolt/app/interface/desktop/Titlebar";
import { useClient, useClientLifecycle } from "@revolt/client";
import { State } from "@revolt/client/Controller";
import { NotificationsWorker } from "@revolt/client/NotificationsWorker";
import { useModals } from "@revolt/modal";
import { Navigate, useBeforeLeave, useLocation } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import { CircularProgress } from "@revolt/ui";

import { MobileMembersOverlay } from "./interface/mobile/MobileMembersOverlay";
import { MobileMessagesOverlay } from "./interface/mobile/MobileMessagesOverlay";
import { MobileNavProvider } from "./interface/mobile/MobileNavContext";
import { Sidebar } from "./interface/Sidebar";

/**
 * Application layout
 */
const Interface = (props: { children: JSX.Element }) => {
  const state = useState();
  const client = useClient();
  const { openModal } = useModals();
  const { isLoggedIn, lifecycle } = useClientLifecycle();
  const { pathname } = useLocation();

  useBeforeLeave((e) => {
    if (!e.defaultPrevented) {
      if (e.to === "/settings") {
        e.preventDefault();
        openModal({
          type: "settings",
          config: "user",
        });
      } else if (typeof e.to === "string") {
        state.layout.setLastActivePath(e.to);
      }
    }
  });

  createEffect(() => {
    if (!isLoggedIn()) {
      state.layout.setNextPath(pathname);
      console.debug(
        "[Interface] not logged in — recorded nextPath:",
        pathname,
        "currently",
        lifecycle.state(),
      );
    }
  });

  // Belt-and-suspenders: also record nextPath synchronously as part of
  // deciding to redirect, in the SAME expression that gates <Navigate>. This
  // removes any dependency on createEffect firing before the redirect — the
  // write happens in the exact tick the redirect is decided, no race possible.
  const recordNextPathAndRedirect = () => {
    state.layout.setNextPath(pathname);
    console.info(
      "[Interface] redirecting to /login, recorded nextPath:",
      pathname,
    );
    return true;
  };

  function isDisconnected() {
    return [
      State.Connecting,
      State.Disconnected,
      State.Reconnecting,
      State.Offline,
    ].includes(lifecycle.state());
  }

  return (
    <MobileNavProvider>
    <MessageCache client={client()}>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          height: "100%",
        }}
      >
        <Titlebar />
        <Switch fallback={<CircularProgress />}>
          <Match when={!isLoggedIn() && recordNextPathAndRedirect()}>
            <Navigate href="/login" />
          </Match>
          <Match when={lifecycle.loadedOnce()}>
            <Layout
              disconnected={isDisconnected()}
              style={{ "flex-grow": 1, "min-height": 0 }}
              onDragOver={(e) => {
                if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
              }}
              onDrop={(e) => e.preventDefault()}
            >
              <Sidebar
                menuGenerator={(target) => ({
                  contextMenu: () => {
                    return (
                      <>
                        {target instanceof Server ? (
                          <ServerContextMenu server={target} />
                        ) : (
                          <ChannelContextMenu channel={target} />
                        )}
                      </>
                    );
                  },
                })}
              />
              <Content
                sidebar={state.layout.getSectionState(
                  LAYOUT_SECTIONS.PRIMARY_SIDEBAR,
                  true,
                )}
              >
                {props.children}
              </Content>
            </Layout>
          </Match>
        </Switch>

        <NotificationsWorker />
        <MobileMembersOverlay />
        <MobileMessagesOverlay />
      </div>
    </MessageCache>
    </MobileNavProvider>
  );
};

/**
 * Parent container
 */
const Layout = styled("div", {
  base: {
    display: "flex",
    height: "100%",
    minWidth: 0,
  },
  variants: {
    disconnected: {
      true: {
        color: "var(--md-sys-color-on-primary-container)",
        background: "var(--md-sys-color-primary-container)",
      },
      false: {
        color: "var(--md-sys-color-outline)",
        background: "var(--md-sys-color-surface-container-high)",
      },
    },
  },
});

/**
 * Main content container
 */
const Content = styled("div", {
  base: {
    background: "var(--md-sys-color-surface-container-low)",

    display: "flex",
    width: "100%",
    minWidth: 0,
  },
  variants: {
    sidebar: {
      false: {
        borderTopLeftRadius: "var(--borderRadius-lg)",
        borderBottomLeftRadius: "var(--borderRadius-lg)",
        overflow: "hidden",
      },
    },
  },
});

export default Interface;
