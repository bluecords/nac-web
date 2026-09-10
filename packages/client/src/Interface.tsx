import { JSX, Match, Show, Switch, createEffect } from "solid-js";

import { Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { ChannelContextMenu, ServerContextMenu } from "@revolt/app";
import { MessageCache } from "@revolt/app/interface/channels/text/MessageCache";
import { Titlebar } from "@revolt/app/interface/desktop/Titlebar";
import { useClient, useClientLifecycle } from "@revolt/client";
import {
  rememberPendingInvite,
  resumePendingInvite,
} from "@revolt/common";
import { State } from "@revolt/client/Controller";
import { NotificationsWorker } from "@revolt/client/NotificationsWorker";
import { useModals } from "@revolt/modal";
import { Navigate, useBeforeLeave, useLocation } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import { Button, CircularProgress, Text } from "@revolt/ui";

import { MobileMembersOverlay } from "./interface/mobile/MobileMembersOverlay";
import { MobileMessagesOverlay } from "./interface/mobile/MobileMessagesOverlay";
import { MobileNavProvider } from "./interface/mobile/MobileNavContext";
import { Sidebar } from "./interface/Sidebar";
import {
  pendingUpdate,
  updateApply,
  updateReady,
} from "./serviceWorkerInterface";

/**
 * Application layout
 */
const Interface = (props: { children: JSX.Element }) => {
  const state = useState();
  const client = useClient();
  const { openModal, isOpen } = useModals();
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
      // Also stash the invite code somewhere the verify round-trip can't lose
      // it (localStorage, not the in-memory nextPath). This is the normal
      // path: click an invite link while logged out → bounced here to sign up.
      const inviteCode = pathname.match(/^\/invite\/([^/?#]+)/)?.[1];
      if (inviteCode) rememberPendingInvite(inviteCode);
      console.debug(
        "[Interface] not logged in — recorded nextPath:",
        pathname,
        "currently",
        lifecycle.state(),
      );
    }
  });

  // Finish an interrupted invite-join. `nextPath` only survives inside the tab
  // that opened `/invite/:code`; when signup completes through an emailed link
  // in a different tab/browser, the member lands with no server and nothing
  // retries. This joins them from a localStorage-stashed code once the client
  // is ready, on every authenticated load until it succeeds. See
  // resumePendingInvite.ts. (Bunjie, 2026-09-10: the heal timer is a net, this
  // shouldn't happen in the first place.)
  createEffect(() => {
    if (!isLoggedIn() || !lifecycle.loadedOnce()) return;
    if (!client()?.user) return;
    resumePendingInvite(client() as never);
  });

  // Apply a waiting update the moment it costs the member nothing.
  //
  // The worker has already taken over by this point, so the code is READY -
  // the only question is when to swap the page, and the answer is "not while
  // they are mid-sentence". Once nothing is typed-but-unsent and the outbox is
  // empty, reload without asking: there is nothing to lose and the banner has
  // already said it would.
  //
  // A message still in the outbox counts as unsent. Reloading then is exactly
  // the case his instruction was about - let the post complete first.
  createEffect(() => {
    if (!updateReady()) return;
    if (state.draft.hasAnyUnsent()) return;

    // The consent gate counts as "mid-sentence" too, and the draft check cannot
    // see it. It holds four tick-boxes and a Discord name the member searched
    // for and selected, none of it saved anywhere until they press Continue -
    // so a reload silently wipes the lot and re-opens the wall, blank.
    //
    // Reported by Bunjie 2026-09-07, testing the live gate while this session
    // was shipping fixes: "the page kept reloading in the background causing
    // the model to wipe and start over". Two deploys landed while he was
    // filling it in. It is not a deploy-only problem - the soft launch is
    // deliberately the period when members are mid-gate AND fixes are shipping.
    //
    // Scoped to this ONE modal on purpose, not "any modal open". Blocking
    // updates behind any open dialog is how a client gets stranded on a stale
    // build, which is the exact failure the worker-driven design exists to
    // prevent. The gate is the case that is both unskippable and full of
    // unsaved input - and passing it closes the modal, so the update applies
    // moments later anyway.
    if (isOpen("policy_change")) return;

    updateApply()();
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
        {/* An update NEVER interrupts. Bunjie, 2026-09-03: "leaving their
            unentered comment intact with a notice telling them that there was
            an update... let the post complete after the fact because 99.9% of
            whatever change has nothing to do with a post."

            So the new code is applied the moment nothing is typed-but-unsent,
            silently and with nothing lost, and until then this says so and
            leaves the decision with the member. */}
        <Show when={pendingUpdate() || updateReady()}>
          <UpdateBanner>
            <Text size="small">
              A new version is ready. Finish what you're typing — it'll update
              on its own once your message is sent.
            </Text>
            <Button
              variant="text"
              onPress={() => (pendingUpdate() ?? updateApply())()}
            >
              Refresh now
            </Button>
          </UpdateBanner>
        </Show>

        {/* Connection-lost notice. During a server update the API restarts and
            every client's socket drops for a few seconds — without a word for
            it, members read that as "the platform is broken" and post about it
            in public. Bunjie, 2026-09-10: "have a message when the server is
            getting an update so they have vis that they'll need to wait a few."
            Only shown after the first successful load, so it never covers the
            normal startup connect. */}
        <Show when={lifecycle.loadedOnce() && isDisconnected()}>
          <ReconnectBanner>
            <Text size="small">
              Reconnecting to NAC… if we're in the middle of an update this is
              normal — it'll be back in a moment.
            </Text>
          </ReconnectBanner>
        </Show>

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
 * Banner shown when a new app version is ready, prompting a manual refresh
 */
const UpdateBanner = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-md)",
    color: "var(--md-sys-color-on-primary-container)",
    background: "var(--md-sys-color-primary-container)",
  },
});

/**
 * Banner shown while the client is reconnecting (e.g. during a server update)
 */
const ReconnectBanner = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-sm) var(--gap-md)",
    color: "var(--md-sys-color-on-tertiary-container)",
    background: "var(--md-sys-color-tertiary-container)",
  },
});

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
