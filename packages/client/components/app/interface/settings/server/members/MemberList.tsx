import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { Server, ServerMember, ServerRole } from "stoat.js";
import { styled } from "styled-system/jsx";

import { isIgnored, toggleIgnored, useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import {
  Avatar,
  Button,
  Checkbox,
  CircularProgress,
  Column,
  Row,
  Text,
  TextField,
} from "@revolt/ui";

/**
 * Every member of the server, on one screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * There was no way for an admin to see the membership at all. The `Members`
 * entry in Server Settings was `hidden: true` with no case in the render
 * switch - upstream stubbed it and never built it. The member sidebar is
 * per-channel by design, and most NAC channels deny view by default, so the
 * owner's own account showed three people.
 *
 * NO PAGINATION, DELIBERATELY. `DataTable` pages at twelve rows, which fights
 * the two things this screen is for: seeing everyone at once, and selecting
 * seventy-one people to give them a role in one action. At this size the whole
 * membership is one fetch and one scroll.
 *
 * SEARCH IS CLIENT-SIDE, ALSO DELIBERATELY. The list is already loaded, so
 * filtering here is instant and sidesteps the server-side member search
 * entirely - the same search that was case-sensitive and matched nobody until
 * recently.
 */
export function MemberList(props: { server: Server }) {
  const { t } = useLingui();
  const client = useClient();
  const navigate = useNavigate();
  const { openModal, showError } = useModals();

  const [search, setSearch] = createSignal("");
  const [roleFilter, setRoleFilter] = createSignal<string>("");
  const [sort, setSort] = createSignal<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [nickname, setNickname] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  // Which member's role popover is open, if any. Self-contained rather than
  // routed through the shared `use:floating` context-menu system: that
  // positions at the mouse cursor for a right-click-style menu, this needs
  // to anchor under a specific button and stay open across several toggles.
  // Settings is also rendered inside a modal, which nothing using
  // `use:floating` had been exercised from before - closing here directly
  // avoids depending on that interaction at all.
  const [roleMenuFor, setRoleMenuFor] = createSignal<string>();

  // Same self-contained pattern as `roleMenuFor` above, for the per-row
  // "..." actions menu - not the shared `use:floating` menu system, for the
  // same reason (see the comment on `roleMenuFor`).
  const [actionsMenuFor, setActionsMenuFor] = createSignal<string>();

  // Viewport coordinates for whichever popover is open, captured from the
  // trigger button at the moment it's clicked.
  //
  // WHY THIS EXISTS: both popovers used to be `position: absolute` inside
  // the row, which put them at the mercy of every scrollable ancestor
  // between the row and the viewport. That's not one container - the
  // Members table has its own horizontal-scroll wrapper AND the whole
  // Settings pane is `use:scrollable` (overflow-y: auto) so long settings
  // pages can scroll internally. A search that narrows the table to one row
  // shrinks the table wrapper to that row's height; a row anywhere but the
  // very top of the settings pane leaves too little room below it in the
  // pane's own scroll box. Either one clips the popover to a sliver -
  // reported live as "the roles list looks covered up." Fixing one
  // ancestor's overflow (tried first) only ever moves the bug to the next
  // one up.
  //
  // The actual fix: portal the popover to `#floating` - the same top-layer
  // mount `SettingsModal` itself already uses to sit above the app - and
  // position it `fixed` from the button's own `getBoundingClientRect()`.
  // `fixed` positioning is resolved against the viewport, not any scrolling
  // ancestor, so there is no container left to clip it.
  //
  // `fixed` still measures from the viewport, not the page - a row near the
  // bottom of a short browser window is a real case here, since the
  // Settings modal is one fixed-height view with no page scroll of its own.
  // Opening downward from a trigger that's already near the bottom would
  // just move the cutoff from "clipped by a container" to "runs off the
  // bottom of the screen with nothing to scroll." `verticalAnchor` picks
  // `top` (open down) when there's reasonable room below the button, and
  // `bottom` (open up, anchored to the button's top edge) when there isn't -
  // `bottom` positioning needs no estimate of the popover's real height,
  // since the box just grows upward from a fixed edge instead.
  type VerticalAnchor = { top: number; bottom: undefined } | { top: undefined; bottom: number };

  function verticalAnchor(rect: DOMRect, minSpaceBelow: number): VerticalAnchor {
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < minSpaceBelow && rect.top > spaceBelow) {
      return { top: undefined, bottom: window.innerHeight - rect.top + 4 };
    }
    return { top: rect.bottom + 4, bottom: undefined };
  }

  const [roleMenuAnchor, setRoleMenuAnchor] = createSignal<
    VerticalAnchor & { left: number }
  >();
  const [actionsMenuAnchor, setActionsMenuAnchor] = createSignal<
    VerticalAnchor & { right: number }
  >();

  function onDocumentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (roleMenuFor() && !target.closest("[data-role-menu-root]")) {
      setRoleMenuFor(undefined);
    }
    if (actionsMenuFor() && !target.closest("[data-actions-menu-root]")) {
      setActionsMenuFor(undefined);
    }
  }
  onMount(() => document.addEventListener("click", onDocumentClick, true));
  onCleanup(() => document.removeEventListener("click", onDocumentClick, true));

  const members = useQuery(() => ({
    queryKey: ["members", props.server.id],
    async queryFn() {
      // `false` means do NOT exclude offline members. The sidebar's own sync
      // excludes them, which is exactly why the membership looked tiny.
      await props.server.syncMembers(false);
      return client().serverMembers.filter(
        (member) => member.id.server === props.server.id,
      );
    },
  }));

  /**
   * Who invited whom.
   *
   * A SEPARATE request because it is a separate permission: the member object
   * goes to everyone in the server, so the inviter is served only to someone
   * holding ManageServer. A failure here must not take the whole screen down -
   * the column simply stays blank.
   */
  const attribution = useQuery(() => ({
    queryKey: ["member-attribution", props.server.id],
    queryFn: () => props.server.fetchMemberAttribution(),
    retry: false,
  }));

  const attributionByUser = createMemo(() => {
    const map = new Map<
      string,
      { invited_by?: string; invite_code?: string }
    >();
    for (const row of attribution.data ?? []) map.set(row.user, row);
    return map;
  });

  const roles = createMemo(() =>
    [...props.server.roles.values()].sort(
      (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
    ),
  );

  const shown = createMemo(() => {
    const term = search().trim().toLowerCase();
    const role = roleFilter();

    let list = (members.data ?? []).filter((member) => {
      if (term) {
        const haystack = [
          member.displayName,
          member.user?.username,
          member.nickname,
          member.id.user,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (role === "__none") return member.roles.length === 0;
      if (role) return member.roles.includes(role);
      return true;
    });

    const mode = sort();
    list = [...list].sort((a, b) => {
      if (mode === "name") {
        return (a.displayName ?? "").localeCompare(b.displayName ?? "");
      }
      const at = a.joinedAt?.getTime() ?? 0;
      const bt = b.joinedAt?.getTime() ?? 0;
      return mode === "oldest" ? at - bt : bt - at;
    });

    return list;
  });

  const noRoleCount = createMemo(
    () => (members.data ?? []).filter((m) => m.roles.length === 0).length,
  );

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllShown(checked: boolean) {
    const ids = shown().map((m) => m.id.user);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const selectedMembers = () =>
    (members.data ?? []).filter((m) => selected().has(m.id.user));

  /**
   * Apply the same change to everyone selected.
   *
   * Sequential rather than concurrent on purpose: seventy-one parallel member
   * edits is a burst the API rate limiter will start rejecting partway
   * through, which would leave the operation half-applied with no record of
   * where it stopped. A failure here reports how far it got.
   */
  async function bulk(
    describe: string,
    apply: (member: ServerMember) => Promise<void>,
  ) {
    const targets = selectedMembers();
    if (!targets.length) return;
    setBusy(true);
    let done = 0;
    try {
      for (const member of targets) {
        await apply(member);
        done++;
      }
      setSelected(new Set<string>());
      members.refetch();
    } catch (error) {
      showError(
        `${describe}: applied to ${done} of ${targets.length} before failing. ` +
          `Re-selecting and running it again is safe - the ones already done ` +
          `will not change.`,
      );
      members.refetch();
    } finally {
      setBusy(false);
    }
  }

  function addRole(roleId: string) {
    return bulk(t`Adding the role`, async (member) => {
      if (member.roles.includes(roleId)) return;
      await member.edit({ roles: [...member.roles, roleId] });
    });
  }

  function removeRole(roleId: string) {
    return bulk(t`Removing the role`, async (member) => {
      if (!member.roles.includes(roleId)) return;
      await member.edit({ roles: member.roles.filter((r) => r !== roleId) });
    });
  }

  /**
   * Toggle one role on one member directly, no selection required.
   *
   * The bulk bar above is for "change many at once" - it stayed exactly as
   * it was. This is the other half Bunjie asked for: the previous version
   * had no faster path for "just give this one person Admin-F" than
   * checking their box, then reaching for the bulk-bar dropdown.
   */
  async function toggleMemberRole(
    member: ServerMember,
    roleId: string,
    checked: boolean,
  ) {
    if (checked === member.roles.includes(roleId)) return;
    const roles = checked
      ? [...member.roles, roleId]
      : member.roles.filter((r) => r !== roleId);
    try {
      await member.edit({ roles });
      members.refetch();
    } catch (error) {
      showError(error);
    }
  }

  function applyNickname() {
    const value = nickname().trim();
    return bulk(t`Setting the nickname`, async (member) => {
      if (value) await member.edit({ nickname: value });
      else await member.edit({ remove: ["Nickname"] });
    }).then(() => setNickname(""));
  }

  function displayInviter(userId: string) {
    const row = attributionByUser().get(userId);
    if (!row?.invited_by) return null;
    const inviter = (members.data ?? []).find(
      (m) => m.id.user === row.invited_by,
    );
    return inviter?.displayName ?? row.invited_by;
  }

  /**
   * Permission gates for the per-row menu. Mirror `UserContextMenu`'s
   * `canEditIdentity`/`canEditRoles`/`canKick`/`canBan` exactly - those are
   * the already-correct checks; this list just adds the two NEW actions
   * (timeout, transfer ownership) that didn't exist anywhere before tonight.
   */
  function canEditIdentity(member: ServerMember) {
    return (
      (props.server.havePermission("ManageNicknames") ||
        props.server.havePermission("RemoveAvatars")) &&
      member.inferiorTo(props.server.member!)
    );
  }

  function canEditRoles(member: ServerMember) {
    return (
      props.server.owner?.self ||
      (props.server.havePermission("AssignRoles") &&
        member.inferiorTo(props.server.member!))
    );
  }

  function canKick(member: ServerMember) {
    return (
      !member.user?.self &&
      props.server.havePermission("KickMembers") &&
      member.inferiorTo(props.server.member!)
    );
  }

  function canBan(member: ServerMember) {
    return (
      !member.user?.self &&
      props.server.havePermission("BanMembers") &&
      member.inferiorTo(props.server.member!)
    );
  }

  function canTimeout(member: ServerMember) {
    return (
      !member.user?.self &&
      props.server.havePermission("TimeoutMembers") &&
      member.inferiorTo(props.server.member!) &&
      // The server refuses to timeout anyone who themselves holds
      // TimeoutMembers - an anti-escalation rule independent of rank
      // (member_edit.rs: `IsElevated` if the TARGET has this permission).
      // Caught by clicking Timeout on a real Moderator-role member in the
      // dev sandbox, not by reading the model - the client had no gate for
      // it at all before this.
      !member.hasPermission(props.server, "TimeoutMembers")
    );
  }

  function canTransferOwnership(member: ServerMember) {
    return props.server.owner?.self && !member.user?.self;
  }

  function openDm(member: ServerMember) {
    member.user?.openDM().then((channel) => navigate(`/channel/${channel.id}`));
  }

  function copyUserId(member: ServerMember) {
    navigator.clipboard.writeText(member.id.user);
  }

  return (
    <Column gap="lg">
      <Row align gap="md" wrap>
        <Text class="label">
          <Trans>
            {String(members.data?.length ?? 0)} members ·{" "}
            {String(noRoleCount())} with no role
          </Trans>
        </Text>
      </Row>

      <Row gap="sm" wrap>
        <Grow>
          <TextField
            label={t`Search name, username or ID`}
            value={search()}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </Grow>
        <Select
          value={roleFilter()}
          onChange={(e) => setRoleFilter(e.currentTarget.value)}
          aria-label={t`Filter by role`}
        >
          <option value="">{t`All roles`}</option>
          <For each={roles()}>
            {(role) => <option value={role.id}>{role.name}</option>}
          </For>
          <option value="__none">{t`No role assigned`}</option>
        </Select>
        <Select
          value={sort()}
          onChange={(e) =>
            setSort(e.currentTarget.value as "newest" | "oldest" | "name")
          }
          aria-label={t`Sort members`}
        >
          <option value="newest">{t`Newest first`}</option>
          <option value="oldest">{t`Oldest first`}</option>
          <option value="name">{t`Name A-Z`}</option>
        </Select>
      </Row>

      <Show when={selected().size > 0}>
        <BulkBar>
          <Row align gap="md" wrap>
            <Text class="label">
              <Trans>{String(selected().size)} selected</Trans>
            </Text>
            <Text class="body">
              <Trans>Apply the same change to all of them</Trans>
            </Text>
          </Row>
          <Row align gap="sm" wrap>
            <TextField
              label={t`Nickname`}
              value={nickname()}
              onChange={(e) => setNickname(e.currentTarget.value)}
            />
            <Button
              group="standard"
              isDisabled={busy()}
              onPress={applyNickname}
            >
              <Trans>Set nickname</Trans>
            </Button>
            <Select
              value=""
              aria-label={t`Add a role to everyone selected`}
              onChange={(e) => {
                const value = e.currentTarget.value;
                e.currentTarget.value = "";
                if (value) addRole(value);
              }}
            >
              <option value="">{t`Add role…`}</option>
              <For each={roles()}>
                {(role) => <option value={role.id}>{role.name}</option>}
              </For>
            </Select>
            <Select
              value=""
              aria-label={t`Remove a role from everyone selected`}
              onChange={(e) => {
                const value = e.currentTarget.value;
                e.currentTarget.value = "";
                if (value) removeRole(value);
              }}
            >
              <option value="">{t`Remove role…`}</option>
              <For each={roles()}>
                {(role) => <option value={role.id}>{role.name}</option>}
              </For>
            </Select>
            <Button
              group="standard"
              isDisabled={busy()}
              onPress={() => setSelected(new Set())}
            >
              <Trans>Clear</Trans>
            </Button>
          </Row>
        </BulkBar>
      </Show>

      <Switch>
        <Match when={members.isLoading}>
          <CircularProgress />
        </Match>
        <Match when={members.isError}>
          <Text class="body">
            <Trans>Could not load the membership.</Trans>
          </Text>
        </Match>
        <Match when={members.data}>
          <Scroll>
            <Table>
              <thead>
                <tr>
                  <Th style={{ width: "44px" }}>
                    <Checkbox
                      checked={
                        shown().length > 0 &&
                        shown().every((m) => selected().has(m.id.user))
                      }
                      onChange={(e) => toggleAllShown(e.currentTarget.checked)}
                    />
                  </Th>
                  <Th>
                    <Trans>Member</Trans>
                  </Th>
                  <Th>
                    <Trans>Joined NAC</Trans>
                  </Th>
                  <Th>
                    <Trans>Invited by</Trans>
                  </Th>
                  <Th>
                    <Trans>Roles</Trans>
                  </Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <For each={shown()}>
                  {(member) => (
                    <tr>
                      <Td>
                        <Checkbox
                          checked={selected().has(member.id.user)}
                          onChange={() => toggle(member.id.user)}
                        />
                      </Td>
                      <Td>
                        <Row align gap="sm">
                          <Avatar
                            src={member.avatarURL ?? member.user?.avatarURL}
                            fallback={member.displayName}
                            size={32}
                          />
                          <Column gap="none">
                            <Text class="body">{member.displayName}</Text>
                            <Muted>{member.user?.username}</Muted>
                          </Column>
                        </Row>
                      </Td>
                      <Td>
                        <Muted>
                          {member.joinedAt
                            ? member.joinedAt.toLocaleDateString()
                            : "—"}
                        </Muted>
                      </Td>
                      <Td>
                        <Show
                          when={displayInviter(member.id.user)}
                          fallback={
                            <Muted>
                              <Trans>no invite used</Trans>
                            </Muted>
                          }
                        >
                          {(name) => <Text class="body">{name()}</Text>}
                        </Show>
                      </Td>
                      <Td>
                        <RolesCell data-role-menu-root>
                          <Show
                            when={member.roles.length}
                            fallback={
                              <NoRole>
                                <Trans>no role assigned</Trans>
                              </NoRole>
                            }
                          >
                            <For each={member.orderedRoles}>
                              {(role) => (
                                <Chip>
                                  <Show when={role.colour}>
                                    <Swatch
                                      style={{ background: role.colour! }}
                                    />
                                  </Show>
                                  {role.name}
                                </Chip>
                              )}
                            </For>
                          </Show>
                          <RoleAddButton
                            type="button"
                            aria-label={t`Edit roles`}
                            onClick={(e) => {
                              const opening = roleMenuFor() !== member.id.user;
                              if (opening) {
                                const rect = (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                // Rough height: title row + one row per role.
                                const estimatedHeight =
                                  24 + roles().length * 32 + 16;
                                setRoleMenuAnchor({
                                  ...verticalAnchor(rect, estimatedHeight),
                                  left: rect.left,
                                });
                              }
                              setRoleMenuFor(opening ? member.id.user : undefined);
                            }}
                          >
                            +
                          </RoleAddButton>
                          <Show
                            when={
                              roleMenuFor() === member.id.user &&
                              roleMenuAnchor()
                            }
                          >
                            {(anchor) => (
                              <Portal mount={document.getElementById("floating")!}>
                                <MemberRoleMenu
                                  member={member}
                                  roles={roles()}
                                  anchor={anchor()}
                                  onToggle={(roleId, checked) =>
                                    toggleMemberRole(member, roleId, checked)
                                  }
                                />
                              </Portal>
                            )}
                          </Show>
                        </RolesCell>
                      </Td>
                      <Td>
                        <ActionsCell data-actions-menu-root>
                          <ActionsButton
                            type="button"
                            aria-label={t`Member actions`}
                            onClick={(e) => {
                              const opening =
                                actionsMenuFor() !== member.id.user;
                              if (opening) {
                                const rect = (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                // Rough height: the menu's longest realistic
                                // combination of items + two dividers.
                                setActionsMenuAnchor({
                                  ...verticalAnchor(rect, 340),
                                  right: window.innerWidth - rect.right,
                                });
                              }
                              setActionsMenuFor(
                                opening ? member.id.user : undefined,
                              );
                            }}
                          >
                            •••
                          </ActionsButton>
                          <Show
                            when={
                              actionsMenuFor() === member.id.user &&
                              actionsMenuAnchor()
                            }
                          >
                            {(anchor) => (
                              <Portal
                                mount={document.getElementById("floating")!}
                              >
                                <MemberActionsMenu
                                  member={member}
                                  anchor={anchor()}
                                  invitedByName={displayInviter(
                                    member.id.user,
                                  )}
                                  canEditIdentity={canEditIdentity(member)}
                                  canEditRoles={canEditRoles(member)}
                                  canTimeout={canTimeout(member)}
                                  canKick={canKick(member)}
                                  canBan={canBan(member)}
                                  canTransferOwnership={canTransferOwnership(
                                    member,
                                  )}
                                  isIgnored={
                                    !!member.user && isIgnored(member.user.id)
                                  }
                                  onOpenProfile={() =>
                                    openModal({
                                      type: "user_profile",
                                      user: member.user!,
                                    })
                                  }
                                  onMessage={() => openDm(member)}
                                  onToggleIgnore={() =>
                                    toggleIgnored(member.user!.id)
                                  }
                                  onChangeNickname={() =>
                                    openModal({
                                      type: "server_identity",
                                      member,
                                    })
                                  }
                                  onManageRoles={() =>
                                    openModal({
                                      type: "user_profile_roles",
                                      member,
                                    })
                                  }
                                  onModView={() =>
                                    openModal({
                                      type: "mod_view",
                                      member,
                                      invitedByName:
                                        displayInviter(member.id.user) ??
                                        undefined,
                                    })
                                  }
                                  onTimeout={() =>
                                    openModal({
                                      type: "timeout_member",
                                      member,
                                    })
                                  }
                                  onKick={() =>
                                    openModal({ type: "kick_member", member })
                                  }
                                  onBan={() =>
                                    openModal({ type: "ban_member", member })
                                  }
                                  onTransferOwnership={() =>
                                    openModal({
                                      type: "transfer_ownership",
                                      member,
                                    })
                                  }
                                  onCopyId={() => copyUserId(member)}
                                  onClose={() => setActionsMenuFor(undefined)}
                                />
                              </Portal>
                            )}
                          </Show>
                        </ActionsCell>
                      </Td>
                    </tr>
                  )}
                </For>
              </tbody>
            </Table>
            <Show when={shown().length === 0}>
              <Empty>
                <Trans>No members match that.</Trans>
              </Empty>
            </Show>
          </Scroll>
        </Match>
      </Switch>

      <Show when={attribution.isError}>
        <Muted>
          <Trans>
            The "Invited by" column needs Manage Server, and could not be
            loaded.
          </Trans>
        </Muted>
      </Show>
    </Column>
  );
}

/**
 * Popover role editor for a single member - the "+" next to their role
 * chips. Every role, toggled independently and immediately: no selecting
 * the row first, no separate apply step.
 *
 * Portaled to `#floating` and positioned `fixed` from the trigger button's
 * own viewport rect (see `roleMenuAnchor` above for why: this row sits
 * inside two different scrollable ancestors, either of which can clip a
 * plain absolutely-positioned popover). Still not routed through the shared
 * `use:floating` context-menu system - that positions at the mouse cursor,
 * right for an actual right-click menu but not for a button-anchored
 * checklist meant to stay open across several toggles. Closing on an
 * outside click is handled once, centrally, by `MemberList`'s own document
 * listener via the `data-role-menu-root` marker - present on both the
 * trigger's cell AND this popover itself, since portaling moves the popover
 * out from under the cell in the DOM tree.
 */
function MemberRoleMenu(props: {
  member: ServerMember;
  roles: ServerRole[];
  anchor:
    | { top: number; bottom: undefined; left: number }
    | { top: undefined; bottom: number; left: number };
  onToggle: (roleId: string, checked: boolean) => void;
}) {
  return (
    <RoleMenuPopover
      data-role-menu-root
      style={{
        position: "fixed",
        top: props.anchor.top !== undefined ? `${props.anchor.top}px` : undefined,
        bottom:
          props.anchor.bottom !== undefined ? `${props.anchor.bottom}px` : undefined,
        left: `${props.anchor.left}px`,
      }}
    >
      <MenuTitle>
        <Trans>Roles</Trans>
      </MenuTitle>
      <For each={props.roles}>
        {(role) => (
          <RoleOption>
            <Show when={role.colour}>
              <Swatch style={{ background: role.colour! }} />
            </Show>
            <RoleOptionName>{role.name}</RoleOptionName>
            <input
              type="checkbox"
              checked={props.member.roles.includes(role.id)}
              onChange={(e) => props.onToggle(role.id, e.currentTarget.checked)}
            />
          </RoleOption>
        )}
      </For>
    </RoleMenuPopover>
  );
}

/**
 * The Discord-style "..." row menu - `[RULED BY BUNJIE]` 2026-09-12, replacing
 * the old always-visible Kick/Ban button pair. Same portal-and-fixed-position
 * pattern as `MemberRoleMenu` above, for the same reason (see `roleMenuAnchor`
 * above): this table sits inside two different scrollable ancestors, and the
 * shared `use:floating` menu system has never been proven from inside the
 * Settings modal. Closed by `MemberList`'s shared document-click listener via
 * the `data-actions-menu-root` marker - present on both the trigger's cell
 * AND this popover, since portaling moves the popover out from under the
 * cell in the DOM tree.
 *
 * Every action here calls something that actually exists end-to-end -
 * `member.edit()` for timeout, `server.edit({ owner })` for the transfer -
 * except the two Discord has that stoatchat has no backing for at all
 * (Unverify Member, Ignore), which are left out rather than wired to nothing.
 */
function MemberActionsMenu(props: {
  member: ServerMember;
  anchor:
    | { top: number; bottom: undefined; right: number }
    | { top: undefined; bottom: number; right: number };
  invitedByName: string | null;
  canEditIdentity: boolean;
  canEditRoles: boolean;
  canTimeout: boolean;
  canKick: boolean;
  canBan: boolean;
  canTransferOwnership: boolean | undefined;
  isIgnored: boolean;
  onOpenProfile: () => void;
  onMessage: () => void;
  onChangeNickname: () => void;
  onManageRoles: () => void;
  onModView: () => void;
  onTimeout: () => void;
  onKick: () => void;
  onBan: () => void;
  onTransferOwnership: () => void;
  onToggleIgnore: () => void;
  onCopyId: () => void;
  onClose: () => void;
}) {
  function run(action: () => void) {
    action();
    props.onClose();
  }

  return (
    <ActionsMenuPopover
      data-actions-menu-root
      style={{
        position: "fixed",
        top: props.anchor.top !== undefined ? `${props.anchor.top}px` : undefined,
        bottom:
          props.anchor.bottom !== undefined ? `${props.anchor.bottom}px` : undefined,
        right: `${props.anchor.right}px`,
      }}
    >
      <Show when={props.member.user}>
        <MenuItem type="button" onClick={() => run(props.onOpenProfile)}>
          <Trans>Profile</Trans>
        </MenuItem>
      </Show>
      <Show when={props.member.user?.relationship === "Friend"}>
        <MenuItem type="button" onClick={() => run(props.onMessage)}>
          <Trans>Message</Trans>
        </MenuItem>
      </Show>
      <Show when={props.member.user && !props.member.user.self}>
        <MenuItem type="button" onClick={() => run(props.onToggleIgnore)}>
          <Switch fallback={<Trans>Ignore</Trans>}>
            <Match when={props.isIgnored}>
              <Trans>Unignore</Trans>
            </Match>
          </Switch>
        </MenuItem>
      </Show>
      <Show when={props.canEditIdentity}>
        <MenuItem type="button" onClick={() => run(props.onChangeNickname)}>
          <Trans>Change Nickname</Trans>
        </MenuItem>
      </Show>
      <Show when={props.canEditRoles}>
        <MenuItem type="button" onClick={() => run(props.onManageRoles)}>
          <Trans>Roles…</Trans>
        </MenuItem>
      </Show>
      <MenuDivider />
      <MenuItem type="button" onClick={() => run(props.onModView)}>
        <Trans>Open in Mod View</Trans>
      </MenuItem>
      <Show when={props.canTimeout || props.canKick || props.canBan}>
        <MenuDivider />
        <Show when={props.canTimeout}>
          <MenuItem type="button" onClick={() => run(props.onTimeout)}>
            <Trans>Timeout…</Trans>
          </MenuItem>
        </Show>
        <Show when={props.canKick}>
          <MenuItem type="button" destructive onClick={() => run(props.onKick)}>
            <Trans>Kick</Trans>
          </MenuItem>
        </Show>
        <Show when={props.canBan}>
          <MenuItem type="button" destructive onClick={() => run(props.onBan)}>
            <Trans>Ban</Trans>
          </MenuItem>
        </Show>
      </Show>
      <Show when={props.canTransferOwnership}>
        <MenuDivider />
        <MenuItem
          type="button"
          destructive
          onClick={() => run(props.onTransferOwnership)}
        >
          <Trans>Transfer Ownership</Trans>
        </MenuItem>
      </Show>
      <MenuDivider />
      <MenuItem type="button" onClick={() => run(props.onCopyId)}>
        <Trans>Copy User ID</Trans>
      </MenuItem>
    </ActionsMenuPopover>
  );
}

const Grow = styled("div", {
  base: { flexGrow: 1, minWidth: "200px" },
});

const Select = styled("select", {
  base: {
    font: "inherit",
    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: "var(--borderRadius-md)",
    padding: "8px 10px",
    cursor: "pointer",
  },
});

const BulkBar = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
});

/**
 * The table scrolls horizontally inside itself rather than making the settings
 * page scroll sideways, which is what happens on a phone otherwise.
 *
 * `overflowY: "visible"` is still pinned explicitly even though the role and
 * actions popovers no longer live inside this box (they're portaled to
 * `#floating` now - see `roleMenuAnchor` above for the full story). Left in
 * place on general principle: setting only `overflow-x` leaves the UA free
 * to compute `overflow-y` as `auto` too (the browsers' own special case for a
 * lone non-visible axis), which would silently clip anything else that ever
 * ends up overflowing this box vertically.
 */
const Scroll = styled("div", {
  base: { overflowX: "auto", overflowY: "visible", width: "100%" },
});

const Table = styled("table", {
  base: { width: "100%", borderCollapse: "collapse", minWidth: "680px" },
});

const Th = styled("th", {
  base: {
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
    color: "var(--md-sys-color-on-surface-variant)",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
});

const Td = styled("td", {
  base: {
    padding: "7px 12px",
    borderBottom: "1px solid var(--md-sys-color-surface-variant)",
    verticalAlign: "middle",
  },
});

/**
 * Row and its inline "+" trigger together
 */
const RolesCell = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
});

/**
 * Positioning (`position`, `top`/`bottom`, `left`) is set inline per-instance
 * from the trigger button's real viewport position (see `MemberRoleMenu`) -
 * this base only carries the parts that never change.
 */
const RoleMenuPopover = styled("div", {
  base: {
    zIndex: 999,
    width: "210px",
    padding: "6px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-xs)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    boxShadow: "0 4px 16px var(--md-sys-color-shadow)",
    userSelect: "none",
  },
});

const RoleAddButton = styled("button", {
  base: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
    borderRadius: "50%",
    border: "1px dashed var(--md-sys-color-outline)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    font: "inherit",
    fontSize: "13px",
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    "&:hover": {
      borderColor: "var(--md-sys-color-primary)",
      color: "var(--md-sys-color-primary)",
    },
  },
});

/**
 * Row and its "..." trigger together - same shape as `RolesCell` above.
 */
const ActionsCell = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    justifyContent: "flex-end",
  },
});

const ActionsButton = styled("button", {
  base: {
    width: "26px",
    height: "20px",
    flexShrink: 0,
    borderRadius: "var(--borderRadius-xs)",
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    font: "inherit",
    fontSize: "12px",
    letterSpacing: "1px",
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    "&:hover": {
      borderColor: "var(--md-sys-color-outline-variant)",
      color: "var(--md-sys-color-on-surface)",
      background:
        "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)",
    },
  },
});

/**
 * Positioning is set inline per-instance, same as `RoleMenuPopover` above -
 * see `MemberActionsMenu`.
 */
const ActionsMenuPopover = styled("div", {
  base: {
    zIndex: 999,
    width: "220px",
    padding: "6px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-xs)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    boxShadow: "0 4px 16px var(--md-sys-color-shadow)",
    userSelect: "none",
  },
});

const MenuItem = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    borderRadius: "var(--borderRadius-xs)",
    border: "none",
    background: "none",
    font: "inherit",
    fontSize: "12.5px",
    color: "var(--md-sys-color-on-surface)",
    cursor: "pointer",

    "&:hover": {
      background:
        "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)",
    },
  },
  variants: {
    destructive: {
      true: { color: "var(--md-sys-color-error)" },
    },
  },
});

const MenuDivider = styled("div", {
  base: {
    height: "1px",
    margin: "4px 0",
    background: "var(--md-sys-color-outline-variant)",
  },
});

const MenuTitle = styled("div", {
  base: {
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--md-sys-color-on-surface-variant)",
    padding: "6px 10px 4px",
  },
});

const RoleOption = styled("label", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "7px 10px",
    borderRadius: "var(--borderRadius-xs)",
    fontSize: "12.5px",
    cursor: "pointer",

    "&:hover": {
      background:
        "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)",
    },

    "& input": {
      marginLeft: "auto",
      cursor: "pointer",
    },
  },
});

const RoleOptionName = styled("span", {
  base: { flexGrow: 1 },
});

const Muted = styled("span", {
  base: {
    color: "var(--md-sys-color-on-surface-variant)",
    fontSize: "12px",
    whiteSpace: "nowrap",
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

/**
 * Members carrying no role at all are the thing this screen exists to make
 * visible, so they are marked rather than left blank.
 */
const NoRole = styled("span", {
  base: {
    fontSize: "11.5px",
    fontStyle: "italic",
    padding: "2px 9px",
    borderRadius: "999px",
    background: "var(--md-sys-color-tertiary-container)",
    color: "var(--md-sys-color-on-tertiary-container)",
    whiteSpace: "nowrap",
  },
});

const Empty = styled("div", {
  base: {
    padding: "32px 12px",
    textAlign: "center",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
