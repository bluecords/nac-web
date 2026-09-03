import {
  Show,
  createEffect,
  createSignal,
  on,
  onMount,
} from "solid-js";

import { Channel, ServerMember } from "stoat.js";

import { TextSearchSidebar } from "../channels/text/TextSearchSidebar";
import { MobileMemberProfile } from "./MobileMemberProfile";
import { useMobileNav } from "./MobileNavContext";

/**
 * Full-screen search overlay for mobile — replaces the inline header search bar.
 */
export function MobileSearchOverlay(props: { channel: Channel }) {
  const { searchOpen, closeSearch } = useMobileNav();
  const [query, setQuery] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const [selectedMember, setSelectedMember] = createSignal<ServerMember | null>(
    null,
  );

  createEffect(
    on(searchOpen, (open) => {
      if (!open) setSelectedMember(null);
    }),
  );

  onMount(() => {
    if (searchOpen()) inputRef?.focus();
  });

  return (
    <Show when={searchOpen()}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "500",
          display: "flex",
          "flex-direction": "column",
          background: "var(--md-sys-color-surface-container-low)",
        }}
      >
        {/* Search bar row */}
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            padding: "8px 12px",
            "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
            background: "var(--md-sys-color-surface-container)",
            "flex-shrink": "0",
          }}
        >
          <span
            style={{
              "font-family": "Material Symbols Outlined",
              "font-size": "22px",
              color: "var(--md-sys-color-on-surface-variant)",
              "flex-shrink": "0",
            }}
          >
            search
          </span>
          <input
            ref={inputRef}
            autofocus
            placeholder="Search messages and people..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            style={{
              flex: "1",
              height: "40px",
              background: "none",
              border: "none",
              outline: "none",
              "font-size": "16px",
              color: "var(--md-sys-color-on-surface)",
            }}
          />
          <button
            onClick={() => { setQuery(""); closeSearch(); }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              "flex-shrink": "0",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              color: "var(--md-sys-color-on-surface-variant)",
            }}
          >
            <span style={{ "font-family": "Material Symbols Outlined", "font-size": "22px" }}>
              close
            </span>
          </button>
        </div>

        {/* Results */}
        <div
          style={{ flex: "1", "overflow-y": "auto", padding: "8px" }}
          onClick={(e) => {
            // Same defect the channel drawer had (nac-web#110): TextSearchSidebar
            // renders each hit as <a href={message.path}>, so tapping a result
            // jumps to the message and leaves this full-screen overlay sitting
            // on top of it. Found by auditing the mobile overlays after Bunjie
            // reported the drawer, not by him hitting it.
            //
            // Delegated for the same reason: TextSearchSidebar is shared with
            // desktop, where dismissing would be wrong.
            const target = e.target as HTMLElement | null;
            if (target?.closest?.("a[href]")) {
              setQuery("");
              closeSearch();
            }
          }}
        >
          <Show when={query().trim().length > 0} fallback={
            <div style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              height: "100%",
              color: "var(--md-sys-color-on-surface-variant)",
              "font-size": "14px",
            }}>
              Type to search messages and people
            </div>
          }>
            {/* People search lives in TextSearchSidebar, which desktop renders
                too - so both surfaces get it from one implementation. This
                overlay only supplies what is mobile-specific: opening the
                full-screen member profile instead of the profile modal. */}
            <TextSearchSidebar
              channel={props.channel}
              query={{ query: query().trim() }}
              onSelectPerson={setSelectedMember}
            />
          </Show>
        </div>

        {/* Tapping a person opens the same full-screen profile the members
            list opens, rather than inventing a second way to look at someone. */}
        <Show when={selectedMember()}>
          {(member) => (
            <div
              style={{
                position: "absolute",
                inset: "0",
                display: "flex",
                "flex-direction": "column",
                background: "var(--md-sys-color-surface-container-low)",
              }}
            >
              <MobileMemberProfile
                member={member()}
                onBack={() => setSelectedMember(null)}
                onNavigated={() => {
                  setQuery("");
                  closeSearch();
                }}
              />
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}

