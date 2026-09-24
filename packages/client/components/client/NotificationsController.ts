import { useLingui } from "@lingui-solid/solid/macro";

import { Client } from "stoat.js";

import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { useSnackbar } from "@revolt/ui";

import { IS_DEV, useClient } from ".";

export function useNotifications() {
  const { settings } = useState();
  const { t } = useLingui();
  const getClient = useClient();
  const snackbar = useSnackbar();
  const { showError } = useModals();

  const supportsNotification = "Notification" in window;

  const onDeny = async (showModal?: boolean) => {
    settings.resetNotificationsState("denied");
    if (showModal) {
      showError(
        t`Failed to enable notifications. Stoat does not have notification permission.`,
      );
    }
    await killServiceWorkerSubscription(getClient());
  };

  const notificationStateMismatch = (): boolean => {
    const areNotificationsAllowed =
      settings.desktopNotificationsState === "allowed" ||
      settings.pushNotificationsState === "allowed";

    const notificationPermissionGranted =
      !supportsNotification || Notification.permission === "granted";

    return areNotificationsAllowed && !notificationPermissionGranted;
  };

  const initNotifications = async () => {
    if (
      settings.desktopNotificationsState === "default" ||
      notificationStateMismatch()
    ) {
      // We do this before permission checking because the constructor will still work fine if we don't have permission.
      if (supportsNotification) {
        try {
          const noti = new Notification(
            "This is what notifications will look like. You shouldn't see this for long.",
            { silent: true },
          );
          // Close the notification just after showing
          // On very slow desktop systems, 100 ms just isn't long enough. Skill issue I guess.
          noti.addEventListener("show", () =>
            setTimeout(() => noti.close(), 100),
          );
        } catch {
          // An error means not supported.
          settings.desktopNotificationsState = "unsupported";
        }
      } else {
        settings.desktopNotificationsState = "unsupported";
      }

      if (supportsNotification) {
        if ((await Notification.requestPermission()) === "granted") {
          settings.desktopNotificationsState = "allowed";
          await enablePushSubscription();
        } else {
          await onDeny();
        }
      } else {
        await enablePushSubscription();
      }
    } else {
      await resyncPushSubscription();
    }
  };

  /**
   * Re-register an already-enabled push subscription with the server.
   * pushd deletes a session's subscription when the push service reports it
   * dead, and nothing else would ever send a replacement - the device goes
   * silent while still showing push as enabled. Safe to call often.
   */
  const resyncPushSubscription = async () => {
    if (
      settings.pushNotificationsState !== "allowed" ||
      (supportsNotification && Notification.permission !== "granted")
    ) {
      return;
    }

    try {
      await setUpServiceWorkerSubscription(getClient(), true);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleNotificationPermission = async (modalOnDeny?: boolean) => {
    if (settings.desktopNotificationsState !== "allowed") {
      if ((await Notification.requestPermission()) === "granted") {
        settings.desktopNotificationsState = "allowed";
      } else {
        await onDeny(modalOnDeny);
      }
    } else {
      settings.desktopNotificationsState = "denied";
    }
  };

  const enablePushSubscription = async () => {
    settings.pushNotificationsState = "allowed";
    try {
      await setUpServiceWorkerSubscription(getClient());
    } catch (e) {
      console.error(e);
      snackbar.show({
        message: t`Failed to enable push notifications. Please try again later.`,
      });
      settings.pushNotificationsState = "default";
    }
  };

  const togglePushPermission = async (modalOnDeny?: boolean) => {
    if (settings.pushNotificationsState !== "allowed") {
      if (supportsNotification) {
        if ((await Notification.requestPermission()) === "granted") {
          await enablePushSubscription();
        } else {
          await onDeny(modalOnDeny);
        }
      } else {
        // On safari mobile, just enable push notifications.
        await enablePushSubscription();
      }
    } else {
      settings.pushNotificationsState = "denied";
      await killServiceWorkerSubscription(getClient());
    }
  };

  return {
    toggleNotificationPermission,
    togglePushPermission,
    initNotifications,
    resyncPushSubscription,
  };
}

async function setUpServiceWorkerSubscription(
  client: Client,
  rotateIfStale = false,
) {
  if (IS_DEV) {
    console.log("Skipping push worker in dev.");
    return;
  }

  if (!client.configured() || !client.configuration) {
    throw "Client not configured";
  }

  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL ?? undefined,
  );
  if (!registration) {
    throw "Failed to get service worker";
  }

  let subscription = await registration.pushManager.getSubscription();
  let rotated = false;

  // The browser can keep handing back an endpoint the push service has
  // already expired, so re-posting it would only get it pruned again.
  // Swap it for a fresh one weekly. Never on Apple: Safari may refuse
  // subscribe() away from a tap, which would leave the device with nothing.
  if (
    rotateIfStale &&
    subscription &&
    !subscription.endpoint.includes(".push.apple.com") &&
    subscriptionIsStale()
  ) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
    rotated = true;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: client.configuration!.vapid,
    });
    markSubscriptionFresh();
  }

  const body = {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64URL(
      subscription.getKey("p256dh") || new ArrayBuffer(),
    ),
    auth: arrayBufferToBase64URL(
      subscription.getKey("auth") || new ArrayBuffer(),
    ),
  };

  // Not fatal: every later start and foreground re-posts it.
  client.api.post("/push/subscribe", body).catch(console.error);

  // pushd prunes by session, not endpoint: a late failure report for the
  // endpoint we just dropped would delete the new one. Post it again after.
  if (rotated) {
    setTimeout(
      () => client.api.post("/push/subscribe", body).catch(console.error),
      60 * 1000,
    );
  }
}

const SUBSCRIPTION_CREATED_KEY = "nac:push-subscription-created";
const SUBSCRIPTION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function subscriptionIsStale(): boolean {
  try {
    const created = Number(localStorage.getItem(SUBSCRIPTION_CREATED_KEY));
    return !created || Date.now() - created > SUBSCRIPTION_MAX_AGE;
  } catch {
    return false;
  }
}

function markSubscriptionFresh() {
  try {
    localStorage.setItem(SUBSCRIPTION_CREATED_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: the subscription still works, it just won't rotate.
  }
}

function arrayBufferToBase64URL(buffer: ArrayBuffer): string {
  const intArray = new Uint8Array(buffer);
  // Todo: Upon upgrading the target of this repo, use Uint8Array.prototype.toBase64() instead of this.
  const binaryString = [...intArray.values()]
    .map((byte) => String.fromCodePoint(byte))
    .join("");
  const base64String = btoa(binaryString);
  return base64String
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Exported for the client controller. Don't use this unless you have to. */
export async function killServiceWorkerSubscription(client: Client) {
  if (IS_DEV) {
    console.log("Skipping killing push worker in dev.");
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL ?? undefined,
  );
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (await subscription?.unsubscribe()) {
    await client.api.post("/push/unsubscribe");
  }
}
