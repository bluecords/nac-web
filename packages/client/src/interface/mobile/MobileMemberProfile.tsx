import { For, Show, createMemo } from "solid-js";

import { ServerMember } from "stoat.js";

import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { Avatar, UserStatus } from "@revolt/ui";

import { addFavorite, isFavorite, removeFavorite } from "./MobileFavorites";

interface Props {
  member: ServerMember;
  onBack: () => void;
  onNavigated: () => void;
}

/**
 * Full-screen member profile for mobile.
 */
export function MobileMemberProfile(props: Props) {
  const { openModal } = useModals();
  const navigate = useNavigate();
  const client = useClient();

  const user = () => props.member.user!;
  const server = () => props.member.server!;

  const displayName = () =>
    props.member.nickname ?? user().displayName ?? user().username;

  const roles = createMemo(() =>
    props.member.roles
      .map((id) => server().roles?.get(id))
      .filter(Boolean)
      .sort((a, b) => (b!.rank ?? 0) - (a!.rank ?? 0)),
  );

  const canEditRoles = () =>
    server().owner?.self ||
    (server().havePermission("AssignRoles") &&
      props.member.inferiorTo(server().member!));

  const canKick = () =>
    !user().self &&
    server().havePermission("KickMembers") &&
    props.member.inferiorTo(server().member!);

  const canBan = () =>
    !user().self &&
    server().havePermission("BanMembers") &&
    props.member.inferiorTo(server().member!);

  const favorited = () => isFavorite(user().id);

  function openDm() {
    user()
      .openDM()
      .then((ch) => {
        props.onNavigated();
        navigate(`/channel/${ch.id}`);
      });
  }

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        background: "var(--md-sys-color-surface-container-low)",
        overflow: "hidden",
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
          onClick={props.onBack}
          aria-label="Back to members"
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
            flex: "1",
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
          }}
        >
          {displayName()}
        </span>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: favorited()
              ? "var(--md-sys-color-primary)"
              : "var(--md-sys-color-on-surface-variant)",
            "font-size": "24px",
            "font-family": "Material Symbols Outlined",
            padding: "4px",
          }}
          onClick={() => {
            if (favorited()) {
              removeFavorite(user().id);
            } else {
              addFavorite({
                userId: user().id,
                username: displayName(),
                avatarURL: user().avatarURL ?? null,
              });
            }
          }}
          aria-label={favorited() ? "Remove from favorites" : "Add to favorites"}
        >
          {favorited() ? "star" : "star_border"}
        </button>
      </div>

      <div style={{ flex: "1", "overflow-y": "auto" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, var(--md-sys-color-primary-container), var(--md-sys-color-surface-container-high))",
            padding: "32px 16px 24px",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: "12px",
          }}
        >
          <div style={{ position: "relative" }}>
            <Avatar
              size={80}
              src={props.member.avatarURL ?? user().avatarURL ?? undefined}
              fallback={displayName()}
              holepunch="bottom-right"
              overlay={<UserStatus.Graphic status={user().presence} />}
            />
          </div>
          <div style={{ "text-align": "center" }}>
            <div
              style={{
                "font-size": "20px",
                "font-weight": "600",
                color: "var(--md-sys-color-on-surface)",
              }}
            >
              {displayName()}
            </div>
            <Show when={props.member.nickname}>
              <div
                style={{
                  "font-size": "13px",
                  color: "var(--md-sys-color-on-surface-variant)",
                  "margin-top": "2px",
                }}
              >
                @{user().username}
              </div>
            </Show>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "16px",
            "flex-wrap": "wrap",
          }}
        >
          <Show when={!user().self}>
            <ActionButton onClick={openDm} icon="chat">
              Message
            </ActionButton>
          </Show>
          <Show when={canEditRoles()}>
            <ActionButton
              onClick={() =>
                openModal({ type: "user_profile_roles", member: props.member })
              }
              icon="assignment_ind"
            >
              Edit Roles
            </ActionButton>
          </Show>
          <Show when={canKick()}>
            <ActionButton
              onClick={() =>
                openModal({ type: "kick_member", member: props.member })
              }
              icon="person_remove"
              destructive
            >
              Kick
            </ActionButton>
          </Show>
          <Show when={canBan()}>
            <ActionButton
              onClick={() =>
                openModal({ type: "ban_member", member: props.member })
              }
              icon="block"
              destructive
            >
              Ban
            </ActionButton>
          </Show>
        </div>

        <Show when={roles().length > 0}>
          <Section title="Roles">
            <div
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: "8px",
                padding: "0 16px 16px",
              }}
            >
              <For each={roles()}>
                {(role) => (
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "6px",
                      padding: "4px 10px",
                      "border-radius": "12px",
                      background: "var(--md-sys-color-surface-container-high)",
                      "font-size": "13px",
                      color: "var(--md-sys-color-on-surface)",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        "border-radius": "50%",
                        background: role?.colour ?? "var(--md-sys-color-outline)",
                        "flex-shrink": "0",
                      }}
                    />
                    {role?.name}
                  </div>
                )}
              </For>
            </div>
          </Section>
        </Show>

        <Section title="Joined">
          <div
            style={{
              padding: "0 16px 16px",
              display: "flex",
              "flex-direction": "column",
              gap: "8px",
            }}
          >
            <JoinRow label="NAC" date={user().createdAt} />
            <Show when={props.member.joinedAt}>
              <JoinRow label="Naked as Created" date={props.member.joinedAt!} />
            </Show>
          </div>
        </Section>
      </div>
    </div>
  );
}

function ActionButton(props: {
  onClick: () => void;
  icon: string;
  destructive?: boolean;
  children: string;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "6px",
        padding: "10px 16px",
        "border-radius": "20px",
        border: "none",
        cursor: "pointer",
        "font-size": "14px",
        "font-weight": "500",
        background: props.destructive
          ? "var(--md-sys-color-error-container)"
          : "var(--md-sys-color-surface-container-high)",
        color: props.destructive
          ? "var(--md-sys-color-on-error-container)"
          : "var(--md-sys-color-on-surface)",
      }}
    >
      <span
        style={{
          "font-size": "18px",
          "font-family": "Material Symbols Outlined",
        }}
      >
        {props.icon}
      </span>
      {props.children}
    </button>
  );
}

function Section(props: { title: string; children: any }) {
  return (
    <div>
      <div
        style={{
          padding: "8px 16px 6px",
          "font-size": "11px",
          "font-weight": "600",
          "letter-spacing": "0.08em",
          "text-transform": "uppercase",
          color: "var(--md-sys-color-on-surface-variant)",
        }}
      >
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function JoinRow(props: { label: string; date: Date }) {
  const formatted = () =>
    props.date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div
      style={{
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        "font-size": "14px",
        color: "var(--md-sys-color-on-surface)",
      }}
    >
      <span style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
        {props.label}
      </span>
      <span>{formatted()}</span>
    </div>
  );
}
