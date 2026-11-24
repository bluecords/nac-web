import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

import { styled } from "styled-system/jsx";

import { useNotifications } from "@revolt/client";
import { useState } from "@revolt/state";
import { Button, Text } from "@revolt/ui";

/**
 * "Notifications are off on this phone" banner.
 *
 * WHY: measured 2026-11-23, 34 of the 52 members who used NAC on a phone or
 * tablet in the previous 14 days had no push registration on that device, and
 * nothing in the app told them. Some never turned it on, some had the phone
 * refuse permission (Verna Yoder: "NAC does not have notification
 * permission"), iPhone Safari tabs cannot receive push at all, and some had a
 * registration the push service expired (Ryan Ash, 2026-11-15) - those stopped
 * opening NAC on the phone because the notifications stopped. Bunjie approved
 * the sketch 2026-11-23 ("Yes, build it").
 *
 * Phones and tablets only. The desktop app and desktop browsers are left
 * alone. Hidden for 7 days by "Not now" (per device), and it disappears by
 * itself once the device has a working registration.
 */

type Variant = "off" | "blocked" | "homescreen";

const DISMISS_KEY = "nac:notif-banner-dismissed-until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac with a touch screen is an iPad.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function isPhoneOrTablet(): boolean {
  if ((window as { native?: unknown }).native) return false;
  return isIOS() || /Android/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function dismissedUntil(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Banner component. Renders nothing on devices where push already works, on
 * desktops, and where the browser has no push support we could switch on.
 */
export function NotificationsOffBanner() {
  const state = useState();
  const { togglePushPermission } = useNotifications();

  const [variant, setVariant] = createSignal<Variant | null>(null);
  const [steps, setSteps] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [hiddenUntil, setHiddenUntil] = createSignal(dismissedUntil());

  async function check() {
    if (!isPhoneOrTablet()) return setVariant(null);

    // iPhone/iPad: Apple only delivers web push to a Home Screen app.
    if (isIOS() && !isStandalone()) return setVariant("homescreen");

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return setVariant(null);
    }

    if (Notification.permission === "denied") return setVariant("blocked");

    if (
      Notification.permission !== "granted" ||
      state.settings.pushNotificationsState !== "allowed"
    ) {
      return setVariant("off");
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL ?? undefined,
      );
      const subscription = await registration?.pushManager?.getSubscription();
      setVariant(subscription ? null : "off");
    } catch {
      // Cannot tell - stay quiet rather than nag over a check that failed.
      setVariant(null);
    }
  }

  onMount(() => {
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    onCleanup(() =>
      document.removeEventListener("visibilitychange", onVisible),
    );
  });

  function notNow() {
    const until = Date.now() + DISMISS_MS;
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {
      // Private mode: hide for this visit only.
    }
    setHiddenUntil(until);
  }

  async function turnOn() {
    if (busy()) return;
    setBusy(true);
    try {
      // togglePushPermission switches OFF when the setting already says
      // "allowed" - which is the state of a device whose registration was
      // lost. Reset it first so the tap always means "turn on".
      if (state.settings.pushNotificationsState === "allowed") {
        state.settings.pushNotificationsState = "default";
      }
      await togglePushPermission(true);
    } finally {
      setBusy(false);
      await check();
    }
  }

  const show = () => variant() !== null && Date.now() >= hiddenUntil();

  return (
    <Show when={show()}>
      <Banner role="status">
        <Text size="small">
          <strong>
            {variant() === "homescreen"
              ? "Add NAC to your Home Screen to get notifications"
              : "Notifications are off on this device"}
          </strong>
          <br />
          {variant() === "homescreen"
            ? "iPhone and iPad only send notifications to the Home Screen app."
            : variant() === "blocked"
              ? "Your phone is blocking notifications from NAC."
              : "You won't hear about replies or mentions."}
        </Text>

        <Show when={steps()}>
          <Steps>
            <For
              each={
                variant() === "homescreen"
                  ? [
                      "Tap the Share button (the square with an arrow pointing up).",
                      'Scroll down and tap "Add to Home Screen", then "Add".',
                      "Open NAC from your Home Screen and sign in.",
                      'Tap "Turn on" when this message appears there.',
                    ]
                  : [
                      "Open your phone's Settings app.",
                      "Go to Apps and find the app you open NAC with (NAC, or your browser such as Chrome).",
                      "Open its Notifications and turn them on.",
                      'Come back to NAC and tap "Turn on". The names of these menus can differ between phones.',
                    ]
              }
            >
              {(step) => (
                <li>
                  <Text size="small">{step}</Text>
                </li>
              )}
            </For>
          </Steps>
        </Show>

        <Buttons>
          <Button size="sm" variant="text" onPress={notNow}>
            Not now
          </Button>
          <Show when={variant() !== "off"}>
            <Button
              size="sm"
              variant="text"
              onPress={() => setSteps(!steps())}
            >
              {steps() ? "Hide steps" : "Show me how"}
            </Button>
          </Show>
          <Show when={variant() !== "homescreen"}>
            <Button size="sm" variant="filled" onPress={turnOn}>
              Turn on
            </Button>
          </Show>
        </Buttons>
      </Banner>
    </Show>
  );
}

const Banner = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    color: "var(--md-sys-color-on-secondary-container)",
    background: "var(--md-sys-color-secondary-container)",
  },
});

const Steps = styled("ol", {
  base: {
    margin: 0,
    paddingInlineStart: "1.25em",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
  },
});

const Buttons = styled("div", {
  base: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
  },
});
