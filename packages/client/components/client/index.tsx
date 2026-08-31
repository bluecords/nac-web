import {
  type JSXElement,
  Accessor,
  createContext,
  createEffect,
  on,
  onCleanup,
  useContext,
} from "solid-js";

import type { Client, User } from "stoat.js";

import { useModals } from "@revolt/modal";
import { fetchLatestChangelog } from "@revolt/modal/modals/Changelog";
import { State } from "@revolt/state";

import ClientController from "./Controller";
import { refreshMediaConsent, resetMediaConsent } from "./MediaConsent";

export type { default as ClientController } from "./Controller";

export {
  addFavorite,
  getFavorites,
  isFavorite,
  removeFavorite,
  toggleFavorite,
} from "./Favorites";
export type { Favorite } from "./Favorites";
export {
  grantMediaConsent,
  MEDIA_ACK_KEY,
  mediaConsentGranted,
  refreshMediaConsent,
  resetMediaConsent,
  withdrawMediaConsent,
} from "./MediaConsent";
export { useNotifications } from "./NotificationsController";
export { SoundContext, SoundController, useSound } from "./Sounds";

const clientContext = createContext(null! as ClientController);

/**
 * Mount the modal controller
 */
export function ClientContext(props: { state: State; children: JSXElement }) {
  const { openModal } = useModals();

  // eslint-disable-next-line solid/reactivity
  const controller = new ClientController(props.state);
  onCleanup(() => controller.dispose());

  let fetchedChangelog = false;
  createEffect(
    on(
      () => controller.isLoggedIn(),
      (loggedIn) => {
        if (!loggedIn || fetchedChangelog) return;
        fetchedChangelog = true;

        fetchLatestChangelog().then((changelog) => {
          if (!changelog) return;
          if (props.state["release-notes"].lastSeenId === changelog.id) return;

          props.state["release-notes"].markSeen(
            changelog.id,
            changelog.published_at,
          );

          openModal({
            type: "changelog",
            changelog,
          });
        });
      },
    ),
  );

  // The media gate needs to know what this account has already agreed to, and
  // the answer is server-side so it follows them across devices. Reset on
  // logout so the next account does not inherit the previous one's decision.
  //
  // Waits for the server CONFIGURATION as well as the session, because the
  // first thing the gate checks is whether consent is being enforced at all -
  // and before the config lands that reads as "no". Running too early would
  // ungate media on every page load, which is precisely what the gate exists
  // to prevent.
  createEffect(
    on(
      () => {
        const client = controller.getCurrentClient();
        return [controller.isLoggedIn(), client?.configured()] as const;
      },
      ([loggedIn, configured]) => {
        const client = controller.getCurrentClient();

        if (loggedIn && configured && client) {
          refreshMediaConsent(client);
        } else if (!loggedIn) {
          resetMediaConsent();
        }
      },
    ),
  );

  createEffect(
    on(
      () => controller.lifecycle.policyAttentionRequired(),
      (attentionRequired) => {
        if (typeof attentionRequired !== "undefined") {
          const [changes, acknowledge, recordConsent] = attentionRequired;

          openModal({
            type: "policy_change",
            changes,
            acknowledge,
            recordConsent,
          });
        }
      },
    ),
  );

  return (
    <clientContext.Provider value={controller}>
      {props.children}
    </clientContext.Provider>
  );
}

/**
 * Get various lifecycle objects
 * @returns Lifecycle information
 */
export function useClientLifecycle() {
  const { login, logout, selectUsername, lifecycle, isLoggedIn, isError } =
    useContext(clientContext);

  return {
    login,
    logout,
    selectUsername,
    lifecycle,
    isLoggedIn,
    isError,
  };
}

/**
 * Get the currently active client if one is available
 * @returns Client
 */
export function useClient(): Accessor<Client> {
  const controller = useContext(clientContext);
  return () => controller.getCurrentClient()!;
}

/**
 * Get the currently logged in user
 * @returns User
 */
export function useUser(): Accessor<User | undefined> {
  const controller = useContext(clientContext);
  return () => controller.getCurrentClient()!.user;
}

/**
 * Plain API client with no authentication
 * @returns API Client
 */
export function useApi() {
  return useContext(clientContext).api;
}

export const IS_DEV = import.meta.env.DEV;
