import {
  For,
  Show,
  Suspense,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { API, Channel, ServerMember } from "stoat.js";

import { Message } from "@revolt/app";
import { useModals } from "@revolt/modal";
import { Avatar, Button, CircularProgress, Row, UserStatus } from "@revolt/ui";

/**
 * Message search sidebar
 */
/** Wait this long after the last keystroke before asking the server for people. */
const PEOPLE_DEBOUNCE_MS = 250;

export function TextSearchSidebar(props: {
  channel: Channel;
  query: Omit<API.DataMessageSearch, "include_users">;
  /**
   * What to do when a person is chosen.
   *
   * Mobile passes its own handler so it can open the full-screen member
   * profile it already uses elsewhere. Desktop leaves it out and gets the
   * standard user-profile modal.
   */
  onSelectPerson?: (member: ServerMember) => void;
}) {
  const [sort, setSort] = createSignal<API.DataMessageSearch["sort"]>("Latest");
  const { openModal } = useModals();

  // People search lives HERE, not in the mobile overlay, because this is the
  // component BOTH surfaces render. The bug was reported with a DESKTOP
  // screenshot, and the earlier fix had only ever shipped on mobile - desktop
  // had no People section at all.
  //
  // Only runs for an actual text search: this same component also renders the
  // PINNED messages sidebar, which passes no `query` and must not sprout a
  // People heading.
  const term = () => (props.query.query ?? "").trim();
  const [people, setPeople] = createSignal<ServerMember[]>([]);

  createEffect(
    on(term, (t) => {
      if (!t) {
        setPeople([]);
        return;
      }

      const timer = setTimeout(async () => {
        try {
          const server = props.channel.server;
          if (!server) return;
          const { members } = await server.queryMembersExperimental(t);
          // Discard a response that arrived after the box moved on.
          if (term() === t) setPeople(members);
        } catch {
          // Never let a failed people lookup take the message results with it.
          setPeople([]);
        }
      }, PEOPLE_DEBOUNCE_MS);

      onCleanup(() => clearTimeout(timer));
    }),
  );

  /**
   * Open a person, however this surface prefers to.
   */
  function selectPerson(member: ServerMember) {
    if (props.onSelectPerson) return props.onSelectPerson(member);
    if (member.user) openModal({ type: "user_profile", user: member.user });
  }

  const query = useQuery(() => ({
    queryKey: ["search", props.channel.id, props.query, sort()],
    queryFn: () =>
      props.channel
        .searchWithUsers(
          props.query.sort
            ? props.query
            : {
                ...props.query,
                sort: sort(),
              },
        )
        .then((result) => result.messages),
  }));

  return (
    <>
      {/* Always show the People heading once a search is running, with an
          explicit "no matches" line. If the section simply vanished when
          nothing came back, "no people matched" and "people search is broken"
          would look identical - and for a while they genuinely were the same
          thing. A search surface must never fail silently. */}
      <Show when={term()}>
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
        <Show
          when={people().length > 0}
          fallback={
            <div
              style={{
                padding: "4px 16px 8px",
                "font-size": "13px",
                color: "var(--md-sys-color-on-surface-variant)",
              }}
            >
              No people match that name
            </div>
          }
        >
          <For each={people()}>
            {(member) => (
              <PersonRow member={member} onSelect={() => selectPerson(member)} />
            )}
          </For>
        </Show>
        <div
          style={{
            height: "1px",
            margin: "8px 0",
            background: "var(--md-sys-color-outline-variant)",
          }}
        />
      </Show>
      <Show when={!props.query.sort}>
        <Row justify="stretch">
          <Button
            group="connected-start"
            groupActive={sort() === "Relevance"}
            onPress={() => setSort("Relevance")}
          >
            <Trans>Relevance</Trans>
          </Button>
          <Button
            group="connected"
            groupActive={sort() === "Latest"}
            onPress={() => setSort("Latest")}
          >
            <Trans>Latest</Trans>
          </Button>
          <Button
            group="connected-end"
            groupActive={sort() === "Oldest"}
            onPress={() => setSort("Oldest")}
          >
            <Trans>Oldest</Trans>
          </Button>
        </Row>
      </Show>
      <Suspense fallback={<CircularProgress />}>
        <For each={query.data}>
          {(message) => (
            <a href={message.path}>
              <Message message={message} isLink />
            </a>
          )}
        </For>
      </Suspense>
    </>
  );
}

/**
 * One person in the search results.
 *
 * Deliberately the same avatar / presence / name shape the member list uses,
 * so people look the same wherever they are listed.
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
