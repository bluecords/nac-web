import { Show, createSignal } from "solid-js";

import { useClient } from "@revolt/client";
import { useSmartParams } from "@revolt/routing";

import { MemberSidebar } from "../channels/text/MemberSidebar";
import { toggleFavorite, isFavorite } from "./MobileFavorites";
import { useMobileNav } from "./MobileNavContext";

/**
 * Full-screen members overlay for mobile. Triggered from MobileNav Members button.
 */
export function MobileMembersOverlay() {
  const { membersOpen, closeMembers } = useMobileNav();
  const params = useSmartParams();
  const client = useClient();

  let scrollRef!: HTMLDivElement;

  const channel = () => {
    const { channelId } = params();
    return channelId ? client()?.channels.get(channelId) : undefined;
  };

  return (
    <Show when={membersOpen() && channel()}>
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
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            padding: "12px 16px",
            background: "var(--md-sys-color-surface-container)",
            "border-bottom": "1px solid var(--md-sys-color-outline-variant)",
            "flex-shrink": "0",
          }}
        >
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--md-sys-color-on-surface)",
              display: "flex",
              "align-items": "center",
              padding: "4px",
            }}
            onClick={closeMembers}
            aria-label="Close members"
          >
            <span style={{ "font-size": "24px", "font-family": "Material Symbols Outlined" }}>
              arrow_back
            </span>
          </button>
          <span
            style={{
              "font-size": "16px",
              "font-weight": "500",
              color: "var(--md-sys-color-on-surface)",
            }}
          >
            Members
          </span>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: "1",
            "min-height": "0",
            "overflow-y": "auto",
          }}
        >
          <Show when={scrollRef}>
            <MemberSidebar
              channel={channel()!}
              scrollTargetElement={scrollRef}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
}
