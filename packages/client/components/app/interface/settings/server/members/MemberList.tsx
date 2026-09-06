import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Server, ServerMember } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
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
  const { openModal, showError } = useModals();

  const [search, setSearch] = createSignal("");
  const [roleFilter, setRoleFilter] = createSignal<string>("");
  const [sort, setSort] = createSignal<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [nickname, setNickname] = createSignal("");
  const [busy, setBusy] = createSignal(false);

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
    const map = new Map<string, { invited_by?: string; invite_code?: string }>();
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
                        <Show
                          when={member.roles.length}
                          fallback={
                            <NoRole>
                              <Trans>no role assigned</Trans>
                            </NoRole>
                          }
                        >
                          <Row gap="xs" wrap>
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
                          </Row>
                        </Show>
                      </Td>
                      <Td>
                        <Row gap="xs">
                          <Button
                            group="standard"
                            onPress={() =>
                              openModal({ type: "kick_member", member })
                            }
                          >
                            <Trans>Kick</Trans>
                          </Button>
                          <Button
                            group="standard"
                            onPress={() =>
                              openModal({ type: "ban_member", member })
                            }
                          >
                            <Trans>Ban</Trans>
                          </Button>
                        </Row>
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
 */
const Scroll = styled("div", {
  base: { overflowX: "auto", width: "100%" },
});

const Table = styled("table", {
  base: { width: "100%", borderCollapse: "collapse", minWidth: "760px" },
});

const Th = styled("th", {
  base: {
    textAlign: "left",
    padding: "10px 12px",
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
    padding: "10px 12px",
    borderBottom: "1px solid var(--md-sys-color-surface-variant)",
    verticalAlign: "middle",
  },
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
