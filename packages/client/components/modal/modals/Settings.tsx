import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";

import { Settings, SettingsConfigurations } from "@revolt/app";
import { DialogProps } from "@revolt/ui";

import { Modals } from "../types";

/**
 * Modal to display server information
 */
export function SettingsModal(
  props: DialogProps & Modals & { type: "settings" },
) {
  // eslint-disable-next-line solid/reactivity
  const config = SettingsConfigurations[props.config];

  // `100vh` resolves to a computed height of 0 in Android's WebView
  // (confirmed via live inspection: window.innerHeight reports correctly,
  // but the `position: fixed` wrapper's own computed height is 0px even
  // though it visually overflows and paints its content) -- taps land on
  // whatever's underneath instead of the settings UI. Track the real
  // viewport height in JS and apply it as an explicit px value instead.
  const [height, setHeight] = createSignal(window.innerHeight);

  onMount(() => {
    const update = () => setHeight(window.innerHeight);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    onCleanup(() => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    });
  });

  return (
    <Portal mount={document.getElementById("floating")!}>
      <div
        style={{
          "z-index": 100,
          position: "fixed",
          width: "100%",
          height: `${height()}px`,
          left: 0,
          top: 0,
          "pointer-events": "none",
        }}
      >
        <Presence>
          <Show when={props?.show}>
            <Motion.div
              style={{
                height: "100%",
                "pointer-events": "all",
                display: "flex",
                // Fallback values matter here specifically: this modal can
                // open before LoadTheme has finished applying the dynamic
                // Material You CSS variables to :root (e.g. a cold direct
                // load of /server/:id/settings via ServerSettingsRedirect,
                // see nac-web#39) -- an unresolved var() with no fallback
                // renders as fully transparent, not a default color, which
                // is what produced the see-through backdrop.
                color: "var(--md-sys-color-on-surface, #e3e2e6)",
                background:
                  "var(--md-sys-color-surface-container-highest, #2b2930)",
              }}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{
                duration: 0.3,
                easing: [0.17, 0.67, 0.58, 0.98],
              }}
            >
              <Settings
                onClose={props.onClose}
                render={config.render}
                title={config.title}
                list={config.list}
                context={props.context as never}
              />
            </Motion.div>
          </Show>
        </Presence>
      </div>
    </Portal>
  );
}
