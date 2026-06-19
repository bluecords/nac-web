/**
 * Configure contexts and render App
 */
import "./sentry";

import { JSX, onMount } from "solid-js";
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
import { ClientContext, SoundContext, useClient } from "@revolt/client";
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
import { Discover } from "./interface/Discover";
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
 * Open an invite link (/invite/:code) — handles the AUTHENTICATED case.
 *
 * Unauthenticated visitors never actually reach the body of this component:
 * `/invite/:code` is a child route of <Interface>, and Interface's own gate
 * (`<Match when={!isLoggedIn()}><Navigate href="/login"/></Match>`) redirects
 * before `props.children` (this component) ever mounts. Interface's generic
 * "remember where I was" effect already records this exact path as
 * `layout.nextPath` as part of that same redirect, so after the user logs in
 * or creates an account, `popNextPath()` (FlowLogin/FlowHome) brings them
 * straight back here — now authenticated. No separate carry-the-code-via-URL
 * mechanism is needed; a prior version of this added one (`?invite=`) and it
 * was redundant dead code on the primary path.
 *
 * The `if (!authed) return` below is a defensive no-op for the edge case of
 * a session expiring while this component is already mounted.
 */
function InviteRedirect() {
  const params = useParams();
  const client = useClient();
  const navigate = useNavigate();
  const { showError } = useModals();

  onMount(() => {
    // Capture the code ONCE, synchronously, and reuse this local everywhere
    // below. Do NOT re-read `params.code` inside the async .then() — useParams()
    // returns a reactive proxy tied to the current route match, and reading it
    // again after an await can come back undefined if the route has since
    // changed. That exact mismatch previously produced `POST /invites/undefined`.
    const code = params.code;
    if (!code || code === "undefined" || code === "null") {
      if (import.meta.env.DEV) {
        console.warn("[InviteRedirect] invalid invite code:", code);
      }
      navigate("/app", { replace: true });
      return;
    }

    let authed = false;
    try {
      authed = !!client()?.user;
    } catch {
      /* not logged in — Interface already redirected before we got here */
    }

    if (!authed) return;

    client()
      .api.get(`/invites/${code}`)
      .then(async (invite) => {
        try {
          await client().api.post(`/invites/${code}`);
        } catch {
          /* already a member (or transient) — fall through to the server */
        }
        navigate(
          `/server/${(invite as unknown as { server_id: string }).server_id}`,
        );
      })
      .catch(showError);
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
            <Route path="/discover/*" component={Discover} />
            <Route path="/settings" component={SettingsRedirect} />
            <Route path="/invite/:code" component={InviteRedirect} />
            <Route path="/bot/:code" component={BotRedirect} />
            <Route path="/friends" component={Friends} />
            <Route path="/server/:server/*">
              <Route path="/channel/:channel/*" component={ChannelPage} />
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
