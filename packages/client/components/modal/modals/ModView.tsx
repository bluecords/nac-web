import { For, Show, createMemo } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import type { Permission } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { Avatar, Column, Dialog, DialogProps, Row, Text } from "@revolt/ui";

import { Modals } from "../types";

/**
 * A curated subset of the full permission list - the ones that actually
 * describe what a member can do TO the server or other members, not every
 * channel-level bit (send messages, react, connect to voice, ...). Mirrors
 * what Discord's own "Mod Permissions" summary line is trying to show.
 */
const MOD_PERMISSIONS: {
  key: keyof typeof Permission;
  label: () => string;
}[] = [
  { key: "ManageServer", label: () => "Manage Server" },
  { key: "ManageChannel", label: () => "Manage Channels" },
  { key: "ManageRole", label: () => "Manage Roles" },
  { key: "ManagePermissions", label: () => "Manage Permissions" },
  { key: "KickMembers", label: () => "Kick Members" },
  { key: "BanMembers", label: () => "Ban Members" },
  { key: "TimeoutMembers", label: () => "Timeout Members" },
  { key: "AssignRoles", label: () => "Assign Roles" },
  { key: "ManageNicknames", label: () => "Manage Nicknames" },
  { key: "ManageMessages", label: () => "Manage Messages" },
];

/**
 * Read-only per-member moderation summary - Bunjie's reference was Discord's
 * "Mod View" side panel. Everything on it is real, live data from what NAC
 * already tracks: roles, permissions computed from those roles, join date,
 * and (when the viewer has ManageServer) who invited them.
 *
 * DELIBERATELY DOES NOT SHOW message/link/media counts or an audit log -
 * neither exists anywhere in stoatchat today (no aggregation query, no audit
 * log subsystem at all). That section says so plainly instead of showing
 * fabricated or silently-zero numbers.
 */
export function ModViewModal(
  props: DialogProps & Modals & { type: "mod_view" },
) {
  const { openModal } = useModals();

  const isOwner = () => props.member.server?.ownerId === props.member.id.user;

  const grantedPermissions = createMemo(() =>
    isOwner()
      ? []
      : MOD_PERMISSIONS.filter((p) =>
          props.member.hasPermission(props.member.server!, p.key),
        ),
  );

  return (
    <Dialog
      minWidth={440}
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Mod View</Trans>}
      actions={[{ text: <Trans>Close</Trans> }]}
    >
      <Column gap="lg">
        <Row align gap="md">
          <Avatar src={props.member.animatedAvatarURL} size={56} />
          <Column gap="none">
            <Text class="title" size="small">
              {props.member.displayName}
            </Text>
            <Muted>{props.member.user?.username}</Muted>
          </Column>
        </Row>

        <Section>
          <SectionTitle>
            <Trans>Roles</Trans>
          </SectionTitle>
          <Show
            when={props.member.orderedRoles.length}
            fallback={
              <Muted>
                <Trans>no role assigned</Trans>
              </Muted>
            }
          >
            <Row gap="xs" wrap>
              <For each={props.member.orderedRoles}>
                {(role) => (
                  <Chip>
                    <Show when={role.colour}>
                      <Swatch style={{ background: role.colour! }} />
                    </Show>
                    {role.name}
                  </Chip>
                )}
              </For>
            </Row>
          </Show>
          <ManageLink
            type="button"
            onClick={() =>
              openModal({ type: "user_profile_roles", member: props.member })
            }
          >
            <Trans>Manage roles</Trans>
          </ManageLink>
        </Section>

        <Section>
          <SectionTitle>
            <Trans>Mod Permissions</Trans>
          </SectionTitle>
          <Show
            when={!isOwner()}
            fallback={
              <Text class="body">
                <Trans>Server Owner - has every permission</Trans>
              </Text>
            }
          >
            <Show
              when={grantedPermissions().length}
              fallback={
                <Muted>
                  <Trans>No server-management permissions</Trans>
                </Muted>
              }
            >
              <Row gap="xs" wrap>
                <For each={grantedPermissions()}>
                  {(perm) => <Chip>{perm.label()}</Chip>}
                </For>
              </Row>
            </Show>
          </Show>
        </Section>

        <Section>
          <SectionTitle>
            <Trans>Account</Trans>
          </SectionTitle>
          <Row align gap="md" wrap>
            <Field>
              <FieldLabel>
                <Trans>Server Join Date</Trans>
              </FieldLabel>
              <Text class="body">
                {props.member.joinedAt
                  ? props.member.joinedAt.toLocaleDateString()
                  : "—"}
              </Text>
            </Field>
            <Field>
              <FieldLabel>
                <Trans>Join Method</Trans>
              </FieldLabel>
              <Text class="body">
                {props.invitedByName ?? <Trans>no invite used</Trans>}
              </Text>
            </Field>
          </Row>
        </Section>

        <Section>
          <SectionTitle>
            <Trans>Server Activity</Trans>
          </SectionTitle>
          <Muted>
            <Trans>
              Message, link and media counts aren't available yet - NAC doesn't
              track per-member activity totals today. This section is a
              placeholder for when that's built, not a live "0".
            </Trans>
          </Muted>
        </Section>
      </Column>
    </Dialog>
  );
}

const Section = styled("div", {
  base: { display: "flex", flexDirection: "column", gap: "6px" },
});

const SectionTitle = styled("div", {
  base: {
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Field = styled("div", {
  base: { display: "flex", flexDirection: "column", gap: "2px" },
});

const FieldLabel = styled("span", {
  base: {
    fontSize: "10.5px",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Muted = styled("span", {
  base: {
    color: "var(--md-sys-color-on-surface-variant)",
    fontSize: "12px",
  },
});

const Chip = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "11.5px",
    fontWeight: 600,
    padding: "2px 9px",
    borderRadius: "999px",
    border: "1px solid var(--md-sys-color-outline-variant)",
    color: "var(--md-sys-color-on-surface-variant)",
    whiteSpace: "nowrap",
  },
});

const Swatch = styled("span", {
  base: { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0 },
});

const ManageLink = styled("button", {
  base: {
    alignSelf: "flex-start",
    font: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--md-sys-color-primary)",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",

    "&:hover": { textDecoration: "underline" },
  },
});
