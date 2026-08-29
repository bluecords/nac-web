/**
 * Configure contexts and render App
 */
import "./sentry";

import { JSX, createEffect, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";

import { attachDevtoolsOverlay } from "@solid-devtools/overlay";
import {
  Navigate,
  Route,
  Router,
  useNavigate,
  useParams,
} from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import "material-symbols";
import "mdui/mdui.css";
import { PublicBot } from "stoat.js";

import FlowCheck from "@revolt/auth/src/flows/FlowCheck";
import FlowConfirmReset from "@revolt/auth/src/flows/FlowConfirmReset";
import FlowCreate from "@revolt/auth/src/flows/FlowCreate";
import FlowDeleteAccount from "@revolt/auth/src/flows/FlowDelete";
import FlowHome from "@revolt/auth/src/flows/FlowHome";
import FlowLogin from "@revolt/auth/src/flows/FlowLogin";
import FlowResend from "@revolt/auth/src/flows/FlowResend";
import FlowReset from "@revolt/auth/src/flows/FlowReset";
import FlowVerify from "@revolt/auth/src/flows/FlowVerify";
import {
  ClientContext,
  SoundContext,
  useClient,
  useClientLifecycle,
} from "@revolt/client";
import { DeviceContext } from "@revolt/common";
import { I18nProvider } from "@revolt/i18n";
import { KeybindContext } from "@revolt/keybinds";
import { ModalContext, ModalRenderer, useModals } from "@revolt/modal";
import { VoiceContext } from "@revolt/rtc";
import { StateContext, SyncWorker, useState } from "@revolt/state";
import {
  FloatingManager,
  LoadTheme,
  SnackbarController,
  SnackbarProvider,
} from "@revolt/ui";

/* @refresh reload */
import "@revolt/ui/styles";

import AuthPage from "./Auth";
import Interface from "./Interface";
import "./index.css";
import { DevelopmentPage } from "./interface/Development";
import { Friends } from "./interface/Friends";
import { HomePage } from "./interface/Home";
import { ServerHome } from "./interface/ServerHome";
import { ChannelPage } from "./interface/channels/ChannelPage";
import "./serviceWorkerInterface";

attachDevtoolsOverlay();

/**
 * Redirect PWA start to the last active path
 */
function PWARedirect() {
  const state = useState();
  return <Navigate href={state.layout.getLastActivePath()} />;
}

/**
 * Open settings and redirect to last active path
 */
function SettingsRedirect() {
  const { openModal } = useModals();

  onMount(() => openModal({ type: "settings", config: "user" }));
  return <PWARedirect />;
}

/**
 * Open server settings (/server/:server/settings) and redirect to a clean
 * server URL so the modal doesn't reopen on every reload.
 *
 * Mirrors SettingsRedirect above, but for the server-scoped settings modal
 * (ServerContextMenu's openSettings()) instead of user settings -- added so
 * server settings is linkable/deep-linkable, not just reachable via a
 * client-side-only openModal() call from the context menu. See nac-web#35.
 */
function ServerSettingsRedirect() {
  const params = useParams();
  const client = useClient();
  const { openModal } = useModals();

  onMount(() => {
    const server = client()!.servers.get(params.server);
    if (server) {
      openModal({ type: "settings", config: "server", context: server });
    }
  });

  return <Navigate href={`/server/${params.server}`} />;
}

/**
 * Open an invite link (/invite/:code) — handles the AUTHENTICATED case.
 *
 * Unauthenticated visitors never actually reach the body of this component:
 * `/invite/:code` is a child route of <Interface>, and Interface's own gate
 * (`<Match when={!isLoggedIn()}><Navigate href="/login"/></Match>`) redirects
 * before `props.children` (this component) ever mounts. Interface's generic
 * "remember where I was" effect already records this exact path as
 * `layout.nextPath` as part of that same redirect, so after the user logs in
 * or creates an account, `popNextPath()` (FlowLogin/FlowHome) brings them
 * straight back here — now authenticated.
 *
 * This uses createEffect (not onMount) gated on isLoggedIn(), and retries
 * automatically rather than checking once and giving up: a one-shot onMount
 * check that ran before the user was fully ready would silently do nothing
 * forever (this happened — a test produced zero join attempts at all, no
 * error, nothing). Logged via console.info so a retest is verifiable from
 * the browser console even when nothing visibly happens.
 */
function InviteRedirect() {
  const params = useParams();
  const client = useClient();
  const { isLoggedIn, lifecycle } = useClientLifecycle();
  const navigate = useNavigate();
  const { showError } = useModals();
  const [attempted, setAttempted] = createSignal(false);

  createEffect(() => {
    if (attempted()) return;

    // Capture the code ONCE per attempt, synchronously, and reuse this local
    // everywhere below. Do NOT re-read `params.code` inside the async .then()
    // — useParams() returns a reactive proxy tied to the current route match,
    // and reading it again after an await can come back undefined if the
    // route has since changed. That exact mismatch previously produced
    // `POST /invites/undefined`.
    const code = params.code;
    if (!code || code === "undefined" || code === "null") {
      console.warn("[InviteRedirect] invalid invite code:", code);
      setAttempted(true);
      navigate("/app", { replace: true });
      return;
    }

    if (!isLoggedIn()) {
      console.info(
        "[InviteRedirect] not logged in yet, waiting — code:",
        code,
      );
      return; // effect re-runs automatically when isLoggedIn() flips true
    }

    // Gate on loadedOnce() (a real tracked signal, flips true only at
    // State.Connected) rather than reading client()?.user directly. A brand
    // new account's isLoggedIn() flips true earlier, at State.Connecting --
    // before the websocket sync has populated client().user -- so a plain
    // untracked read here would see no user, log "waiting", and then never
    // re-run (none of this effect's tracked deps change again), silently
    // dropping the join. Returning users don't hit this because their
    // client().user is already populated from cache by the time this effect
    // first runs. See nac-web#44 (regression of #10/#33).
    if (!lifecycle.loadedOnce()) {
      console.info(
        "[InviteRedirect] logged in but client not fully loaded yet, waiting — code:",
        code,
      );
      return;
    }

    if (!client()?.user) {
      console.warn(
        "[InviteRedirect] loadedOnce but client.user still missing — code:",
        code,
      );
      return;
    }

    setAttempted(true);
    console.info("[InviteRedirect] attempting join — code:", code);

    client()
      .api.get(`/invites/${code}`)
      .then(async (invite) => {
        try {
          await client().api.post(`/invites/${code}`);
          console.info("[InviteRedirect] join succeeded — code:", code);
        } catch (err) {
          console.info(
            "[InviteRedirect] join POST failed (likely already a member) — code:",
            code,
            err,
          );
        }
        navigate(
          `/server/${(invite as unknown as { server_id: string }).server_id}`,
        );
      })
      .catch((err) => {
        console.error("[InviteRedirect] GET /invites failed — code:", code, err);
        showError(err);
      });
  });

  return <PWARedirect />;
}

/**
 * Open bot invite and redirect to last active path
 */
function BotRedirect() {
  const params = useParams();
  const client = useClient();
  const { openModal, showError } = useModals();

  onMount(() => {
    if (params.code) {
      client()
        // TODO: add a helper to stoat.js for this
        .api.get(`/bots/${params.code as ""}/invite`)
        .then((invite) => new PublicBot(client(), invite))
        .then((invite) => openModal({ type: "add_bot", invite }))
        .catch(showError);
    }
  });

  return <PWARedirect />;
}

function MountContext(props: { children?: JSX.Element }) {
  const state = useState();

  /**
   * Tanstack Query client
   */
  const client = new QueryClient();

  /**
   * Snackbar controller
   */
  const snackbarController = new SnackbarController();

  return (
    <KeybindContext>
      <ModalContext>
        <ClientContext state={state}>
          <I18nProvider>
            <SoundContext>
              <VoiceContext>
                <QueryClientProvider client={client}>
                  <SnackbarProvider controller={snackbarController}>
                    {props.children}
                    <ModalRenderer />
                    <FloatingManager />
                  </SnackbarProvider>
                </QueryClientProvider>
              </VoiceContext>
            </SoundContext>
          </I18nProvider>
          <SyncWorker />
        </ClientContext>
      </ModalContext>
    </KeybindContext>
  );
}

render(
  () => (
    <DeviceContext>
      <StateContext>
        <Router root={MountContext}>
          <Route path="/login" component={AuthPage as never}>
            <Route path="/delete/:token" component={FlowDeleteAccount} />
            <Route path="/check" component={FlowCheck} />
            <Route path="/create" component={FlowCreate} />
            <Route path="/create/:code" component={FlowCreate} />
            <Route path="/auth" component={FlowLogin} />
            <Route path="/resend" component={FlowResend} />
            <Route path="/reset" component={FlowReset} />
            <Route path="/verify/:token" component={FlowVerify} />
            <Route path="/reset/:token" component={FlowConfirmReset} />
            <Route path="/*" component={FlowHome} />
          </Route>
          <Route path="/" component={Interface as never}>
            <Route path="/pwa" component={PWARedirect} />
            <Route path="/dev" component={DevelopmentPage} />
            <Route path="/settings" component={SettingsRedirect} />
            <Route path="/invite/:code" component={InviteRedirect} />
            <Route path="/bot/:code" component={BotRedirect} />
            <Route path="/friends" component={Friends} />
            <Route path="/server/:server/*">
              <Route path="/channel/:channel/*" component={ChannelPage} />
              <Route path="/settings" component={ServerSettingsRedirect} />
              <Route path="/*" component={ServerHome} />
            </Route>
            <Route path="/channel/:channel/*" component={ChannelPage} />
            <Route path="/*" component={HomePage} />
          </Route>
        </Router>

        <LoadTheme />
        {/* <ReportBug /> */}
      </StateContext>
    </DeviceContext>
  ),
  document.getElementById("root") as HTMLElement,
);
