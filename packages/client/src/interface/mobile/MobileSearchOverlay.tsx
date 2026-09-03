import {
  For,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import { Channel, ServerMember } from "stoat.js";

import { Avatar, UserStatus } from "@revolt/ui";

import { TextSearchSidebar } from "../channels/text/TextSearchSidebar";
import { MobileMemberProfile } from "./MobileMemberProfile";
import { useMobileNav } from "./MobileNavContext";

/** Wait this long after the last keystroke before asking the server for people. */
const PEOPLE_DEBOUNCE_MS = 250;

/**
 * Full-screen search overlay for mobile — replaces the inline header search bar.
 */
export function MobileSearchOverlay(props: { channel: Channel }) {
  const { searchOpen, closeSearch } = useMobileNav();
  const [query, setQuery] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  // People results. Bunjie, 2026-09-02: "Search works for message content but
  // not users. If I typed 'RV' I saw a post about RVs. If I type a user-
  // nothing." That was not a regression - this overlay only ever searched
  // message text, and its own placeholder said so. Searching for a person is
  // the obvious thing to try in a search box, so it now does both.
  const [people, setPeople] = createSignal<ServerMember[]>([]);
  const [selectedMember, setSelectedMember] = createSignal<ServerMember | null>(
    null,
  );

  createEffect(
    on(query, (q) => {
      const term = q.trim();
      if (term.length < 1) {
        setPeople([]);
        return;
      }

      // Debounced: this hits the server on every keystroke otherwise.
      const timer = setTimeout(async () => {
        try {
          const server = props.channel.server;
          if (!server) return;
          const { members } = await server.queryMembersExperimental(term);
          // Ignore a response that arrived after the box moved on.
          if (query().trim() === term) setPeople(members);
        } catch {
          // A failed people lookup must never take the message results with
          // it - the half that already worked keeps working.
          setPeople([]);
        }
      }, PEOPLE_DEBOUNCE_MS);

      onCleanup(() => clearTimeout(timer));
    }),
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
            <Show when={people().length > 0}>
              <div
                style={{
                  "font-size": "12px",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.5px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  padding: "8px 16px 4px",
                }}
              >
                People
              </div>
              <For each={people()}>
                {(member) => (
                  <PersonRow
                    member={member}
                    onSelect={() => setSelectedMember(member)}
                  />
                )}
              </For>
              <div
                style={{
                  height: "1px",
                  margin: "8px 0",
                  background: "var(--md-sys-color-outline-variant)",
                }}
              />
            </Show>

            <TextSearchSidebar
              channel={props.channel}
              query={{ query: query().trim() }}
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

/**
 * One person in the search results.
 *
 * Deliberately the same shape as the row in MobileMembersOverlay - avatar,
 * presence dot, display name - so people look the same wherever they are
 * listed, rather than this becoming a second visual language for members.
 */
function PersonRow(props: { member: ServerMember; onSelect: () => void }) {
  const user = () => props.member.user!;
  const displayName = () =>
    props.member.nickname ?? user()?.displayName ?? user()?.username ?? "";

  return (
    <Show when={props.member.user}>
      <button
        style={{
          display: "flex",
          "align-items": "center",
          gap: "12px",
          padding: "8px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          "text-align": "left",
          color: user().online
            ? "var(--md-sys-color-on-surface)"
            : "var(--md-sys-color-on-surface-variant)",
        }}
        onClick={props.onSelect}
      >
        <Avatar
          size={36}
          src={props.member.avatarURL ?? user().avatarURL ?? undefined}
          fallback={displayName()}
          holepunch="bottom-right"
          overlay={<UserStatus.Graphic status={user().presence} />}
        />
        <span
          style={{
            "font-size": "14px",
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
          }}
        >
          {displayName()}
        </span>
      </button>
    </Show>
  );
}
