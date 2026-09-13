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
import { refreshEmbedConsent, resetEmbedConsent } from "./EmbedConsent";
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
  addIgnored,
  getIgnored,
  isIgnored,
  removeIgnored,
  toggleIgnored,
} from "./Ignored";
export { memberRoles, setMemberRole } from "./MemberRoleEdits";
export {
  grantMediaConsent,
  MEDIA_ACK_KEY,
  mediaConsentGranted,
  refreshMediaConsent,
  resetMediaConsent,
  withdrawMediaConsent,
} from "./MediaConsent";

export {
  embedAckKey,
  embedConsentGranted,
  embedConsentLoaded,
  grantEmbedConsent,
  refreshEmbedConsent,
  resetEmbedConsent,
  withdrawEmbedConsent,
} from "./EmbedConsent";
export { useNotifications } from "./NotificationsController";
export { SoundContext, SoundController, useSound } from "./Sounds";

const clientContext = createContext(null! as ClientController);

/**
 * Mount the modal controller
 */
export function ClientContext(props: { state: State; children: JSXElement }) {
  const { openModal, isOpen } = useModals();

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
          refreshEmbedConsent(client);
        } else if (!loggedIn) {
          resetMediaConsent();
          resetEmbedConsent();
        }
      },
    ),
  );

  createEffect(
    on(
      () => controller.lifecycle.policyAttentionRequired(),
      (attentionRequired) => {
        if (typeof attentionRequired !== "undefined") {
          // `policyChanges` is emitted from the READY handler, so it fires again
          // on every reconnect while the member is still unacknowledged - and
          // `openModal` appends unconditionally. Without this guard the gate
          // stacks a second copy of itself on top of the first: the member
          // completes the top one and is left staring at a duplicate they
          // cannot dismiss, because an enforcing gate has no Close button.
          //
          // Reported by Bunjie 2026-09-07, minutes after the gate went live:
          // "I had 2 popups. One in front of the other." A deploy had recreated
          // `events` underneath him. It is NOT specific to deploys - the comment
          // in Controller.ts about mobile browsers dropping the socket when
          // backgrounded describes exactly the same trigger, which on phones
          // happens constantly.
          //
          // Skip rather than replace: he may already have ticked boxes in the
          // open one, and the server verifies the policy hash on submit anyway,
          // so consent can never be recorded against the wrong document.
          if (isOpen("policy_change")) return;

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
