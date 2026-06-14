import {
  type JSX,
  Accessor,
  Show,
  createContext,
  createMemo,
  createSignal,
  untrack,
  useContext,
} from "solid-js";
import { Motion, Presence } from "solid-motionone";

import { Rerun } from "@solid-primitives/keyed";

import { SettingsConfiguration, SettingsEntry, SettingsList } from ".";
import { SettingsContent } from "./_layout/Content";
import { SettingsSidebar } from "./_layout/Sidebar";

export interface SettingsProps {
  /**
   * Close settings
   */
  onClose?: () => void;

  /**
   * Settings context
   */
  context: never;
}

/**
 * Transition animation
 */
export type SettingsTransition = "normal" | "to-child" | "to-parent";

/**
 * Provide navigation to child components
 */
const SettingsNavigationContext = createContext<{
  page: Accessor<string | undefined>;
  navigate: (path: string | SettingsEntry) => void;
}>();

/**
 * Generic Settings component
 */
export function Settings(props: SettingsProps & SettingsConfiguration<never>) {
  const [page, setPage] = createSignal<undefined | string>(
    // eslint-disable-next-line
    (props.context as any)?.page,
  );
  const [transition, setTransition] =
    createSignal<SettingsTransition>("normal");

  /**
   * Navigate to a certain page
   */
  function navigate(entry: string | SettingsEntry) {
    let id;
    if (typeof entry === "object") {
      if (entry.onClick) {
        entry.onClick();
      } else if (entry.href) {
        window.open(entry.href, "_blank");
      } else if (entry.id) {
        id = entry.id;
      }
    } else {
      id = entry;
    }

    if (!id) return;

    const current = page();
    if (current?.startsWith(id)) {
      setTransition("to-parent");
    } else if (current && id.startsWith(current)) {
      setTransition("to-child");
    } else {
      setTransition("normal");
    }

    setPage(id);
  }

  const isMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;

  const ContentEl = () => (
    <Presence exitBeforeEnter>
      <Rerun on={page}>
        <Motion.div
          style={
            untrack(transition) === "normal"
              ? {}
              : { visibility: "hidden" }
          }
          ref={(el) =>
            untrack(transition) !== "normal" &&
            setTimeout(() => (el.style.visibility = "visible"), 250)
          }
          initial={
            transition() === "normal"
              ? { opacity: 0, y: 50 }
              : transition() === "to-child"
                ? { x: "100vw" }
                : { x: "-100vw" }
          }
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={
            transition() === "normal"
              ? undefined
              : transition() === "to-child"
                ? { x: "-100vw" }
                : { x: "100vw" }
          }
          transition={{ duration: 0.2, easing: [0.17, 0.67, 0.58, 0.98] }}
        >
          {props.render({ page }, props.context)}
        </Motion.div>
      </Rerun>
    </Presence>
  );

  return (
    <SettingsNavigationContext.Provider value={{ page, navigate }}>
      <MemoisedList context={props.context} list={props.list}>
        {(list) => (
          <Show
            when={isMobile()}
            fallback={
              <>
                <SettingsSidebar list={list} page={page} setPage={setPage} />
                <SettingsContent
                  page={page}
                  list={list}
                  title={props.title}
                  onClose={props.onClose}
                >
                  <ContentEl />
                </SettingsContent>
              </>
            }
          >
            {/* Mobile: sidebar list OR content page, never both */}
            <Show
              when={page()}
              fallback={
                <div style={{ width: "100%", "overflow-y": "auto" }}>
                  {/* Back / close row */}
                  <div style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    padding: "12px 16px",
                    "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
                    background: "var(--md-sys-color-surface-container)",
                    position: "sticky",
                    top: "0",
                    "z-index": "1",
                  }}>
                    <button
                      onClick={props.onClose}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        display: "flex", "align-items": "center", gap: "6px",
                        color: "var(--md-sys-color-on-surface)", "font-size": "16px",
                        "font-weight": "600", padding: "0",
                      }}
                    >
                      <span style={{ "font-family": "Material Symbols Outlined", "font-size": "22px" }}>close</span>
                      Settings
                    </button>
                  </div>
                  <SettingsSidebar list={list} page={page} setPage={setPage} />
                </div>
              }
            >
              <div style={{ width: "100%", display: "flex", "flex-direction": "column" }}>
                {/* Back row */}
                <div style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "8px",
                  padding: "12px 16px",
                  "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
                  background: "var(--md-sys-color-surface-container)",
                  "flex-shrink": "0",
                  position: "sticky",
                  top: "0",
                  "z-index": "1",
                }}>
                  <button
                    onClick={() => setPage(undefined)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", "align-items": "center", gap: "6px",
                      color: "var(--md-sys-color-on-surface)", "font-size": "16px",
                      "font-weight": "600", padding: "0", flex: "1",
                    }}
                  >
                    <span style={{ "font-family": "Material Symbols Outlined", "font-size": "22px" }}>arrow_back</span>
                    Settings
                  </button>
                  <button
                    onClick={props.onClose}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", "align-items": "center",
                      color: "var(--md-sys-color-on-surface-variant)", padding: "0",
                    }}
                  >
                    <span style={{ "font-family": "Material Symbols Outlined", "font-size": "22px" }}>close</span>
                  </button>
                </div>
                <SettingsContent
                  page={page}
                  list={list}
                  title={props.title}
                >
                  <ContentEl />
                </SettingsContent>
              </div>
            </Show>
          </Show>
        )}
      </MemoisedList>
    </SettingsNavigationContext.Provider>
  );
}

/**
 * Memoise the list but generate it within context
 */
function MemoisedList(props: {
  context: never;
  list: (context: never) => SettingsList<unknown>;
  children: (list: Accessor<SettingsList<unknown>>) => JSX.Element;
}) {
  /**
   * Generate list of categories / links
   */
  const list = createMemo(() => props.list(props.context));

  return <>{props.children(list)}</>;
}

/**
 * Use settings navigation context
 */
export const useSettingsNavigation = () =>
  useContext(SettingsNavigationContext)!;
