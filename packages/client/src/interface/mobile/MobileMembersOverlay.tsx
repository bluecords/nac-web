import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  on,
  createEffect,
} from "solid-js";

import { ServerMember } from "stoat.js";

import { useClient } from "@revolt/client";
import { useSmartParams } from "@revolt/routing";
import { Avatar, UserStatus } from "@revolt/ui";

import { MobileMemberProfile } from "./MobileMemberProfile";
import { useMobileNav } from "./MobileNavContext";

const LARGE_SERVERS = [
  "01F7ZSBSFHQ8TA81725KQCSDDP",
  "01G3PKD1YJ2H484MDX6KP9WRBN",
  "01K313D0VP0HPNG30DNZ4Q672H",
  "01J31CCMTYKFPGCM13VRP3B289",
  "01H2Y4Y97PW6584PHN1TAVN5WR",
  "01HVKQBBQ3DQVVNK3M8DHXV30D",
  "01GDS83RMZW89AV0BZG24NEXYC",
  "01J5W0XERBBGK77BMDVPZJ20JW",
];

/**
 * Full-screen members overlay for mobile.
 * Tap a member → full-screen profile. Back arrow → list. Back arrow → chat.
 */
export function MobileMembersOverlay() {
  const { membersOpen, closeMembers } = useMobileNav();
  const params = useSmartParams();
  const client = useClient();

  const [selectedMember, setSelectedMember] = createSignal<ServerMember | null>(
    null,
  );

  const channel = () => {
    const { channelId } = params();
    return channelId ? client()?.channels.get(channelId) : undefined;
  };

  createEffect(
    on(membersOpen, (open) => {
      if (!open) setSelectedMember(null);
    }),
  );

  return (
    <Show when={membersOpen()}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": "500",
          display: "flex",
          "flex-direction": "column",
        }}
      >
        <Switch>
          <Match when={selectedMember()}>
            <MobileMemberProfile
              member={selectedMember()!}
              onBack={() => setSelectedMember(null)}
              onNavigated={closeMembers}
            />
          </Match>
          <Match when={channel()?.type === "TextChannel"}>
            <MobileMemberList
              channel={channel()!}
              onSelect={setSelectedMember}
              onClose={closeMembers}
            />
          </Match>
        </Switch>
      </div>
    </Show>
  );
}

function MobileMemberList(props: {
  channel: NonNullable<ReturnType<ReturnType<typeof useClient>>["channels"]["get"]>;
  onSelect: (m: ServerMember) => void;
  onClose: () => void;
}) {
  const client = useClient();

  createEffect(
    on(
      () => props.channel.serverId,
      (serverId) =>
        props.channel.server?.syncMembers(
          LARGE_SERVERS.includes(serverId) ? true : false,
          200,
        ),
    ),
  );

  const members = createMemo(() => {
    const hoistedRoles = props.channel.server!.orderedRoles.filter(
      (r) => r.hoist,
    );
    const all = client().serverMembers.filter(
      (m) => m.id.server === props.channel.serverId,
    );

    const byRole: Record<string, ServerMember[]> = {
      default: [],
      offline: [],
    };
    hoistedRoles.forEach((r) => (byRole[r.id] = []));

    for (const m of all) {
      if (!m.user?.online) {
        byRole["offline"].push(m);
        continue;
      }
      let assigned = false;
      for (const role of hoistedRoles) {
        if (m.roles.includes(role.id)) {
          byRole[role.id].push(m);
          assigned = true;
          break;
        }
      }
      if (!assigned) byRole["default"].push(m);
    }

    type Entry =
      | { t: "header"; name: string; count: number }
      | { t: "member"; member: ServerMember };

    const entries: Entry[] = [];

    const groups = [
      ...hoistedRoles.map((r) => ({ name: r.name, id: r.id })),
      { name: "Online", id: "default" },
      { name: "Offline", id: "offline" },
    ];

    for (const g of groups) {
      const ms = (byRole[g.id] ?? []).sort(
        (a, b) =>
          (a.nickname ?? a.user?.displayName ?? "").localeCompare(
            b.nickname ?? b.user?.displayName ?? "",
          ),
      );
      if (!ms.length) continue;
      entries.push({ t: "header", name: g.name, count: ms.length });
      for (const m of ms) entries.push({ t: "member", member: m });
    }

    return entries;
  });

  const onlineCount = createMemo(
    () =>
      client().serverMembers.filter(
        (m) => m.id.server === props.channel.serverId && m.user?.online,
      ).length,
  );

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
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
          onClick={props.onClose}
          aria-label="Close members"
        >
          <span
            style={{
              "font-size": "24px",
              "font-family": "Material Symbols Outlined",
            }}
          >
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
        <span
          style={{
            "margin-left": "auto",
            "font-size": "13px",
            color: "var(--md-sys-color-on-surface-variant)",
          }}
        >
          {onlineCount()} online
        </span>
      </div>

      <div style={{ flex: "1", "overflow-y": "auto" }}>
        <For each={members()}>
          {(entry) => (
            <Switch>
              <Match when={entry.t === "header"}>
                <div
                  style={{
                    padding: "16px 16px 4px",
                    "font-size": "11px",
                    "font-weight": "600",
                    "letter-spacing": "0.08em",
                    "text-transform": "uppercase",
                    color: "var(--md-sys-color-on-surface-variant)",
                  }}
                >
                  {(entry as { name: string; count: number }).name}
                  {" – "}
                  {(entry as { count: number }).count}
                </div>
              </Match>
              <Match when={entry.t === "member"}>
                <MemberRow
                  member={(entry as { member: ServerMember }).member}
                  onSelect={props.onSelect}
                />
              </Match>
            </Switch>
          )}
        </For>
      </div>
    </div>
  );
}

function MemberRow(props: {
  member: ServerMember;
  onSelect: (m: ServerMember) => void;
}) {
  const user = () => props.member.user!;
  const displayName = () =>
    props.member.nickname ?? user().displayName ?? user().username;

  return (
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
      onClick={() => props.onSelect(props.member)}
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
  );
}
