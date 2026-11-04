import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { Channel, ServerMember } from "stoat.js";

import { memberRoles, setMemberRole, useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { Avatar, Button, Column, Row, Text, TextField } from "@revolt/ui";

import {
  PARTICIPATION_ALLOW,
  accessRoleName,
  addCandidates,
  findAccessRole,
} from "./peopleAccess";

/**
 * "People" on a channel's access screen: give specific people a channel
 * without giving them admin rights. See `peopleAccess.ts` for why this is a
 * hidden per-channel access role underneath (a channel can only be set per
 * role, never per person).
 */
export function ChannelPeople(props: { context: Channel }) {
  const { t } = useLingui();
  const client = useClient();
  const { showError } = useModals();

  const server = () => props.context.server;
  const [search, setSearch] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  // Creating the role and handing it out needs both of these.
  const allowed = () =>
    !!server()?.havePermission("ManageRole") &&
    !!server()?.havePermission("AssignRoles");

  const members = useQuery(() => ({
    queryKey: ["members", props.context.server?.id],
    async queryFn() {
      const s = props.context.server!;
      // `false` = include offline members, same as the Members screen.
      await s.syncMembers(false);
      return client().serverMembers.filter(
        (member) => member.id.server === s.id,
      );
    },
    enabled: allowed(),
  }));

  /** The access role this channel already has, if any. */
  const accessRole = createMemo(() =>
    findAccessRole(
      server()?.orderedRoles ?? [],
      Object.keys(props.context.rolePermissions ?? {}),
    ),
  );

  /** People who currently hold it. */
  const holders = createMemo(() => {
    const role = accessRole();
    if (!role) return [] as ServerMember[];
    return (members.data ?? []).filter((m) => memberRoles(m).includes(role.id));
  });

  const candidates = createMemo(() =>
    addCandidates(
      members.data ?? [],
      new Set(holders().map((m) => m.id.user)),
      search(),
    ),
  );

  async function add(member: ServerMember) {
    setBusy(true);
    try {
      let roleId = accessRole()?.id;

      if (!roleId) {
        // First person for this channel: make the role, then allow it here.
        const created = await server()!.createRole(
          accessRoleName(props.context.name),
        );
        roleId = created.id;
        await props.context.setPermissions(roleId, {
          allow: Number(PARTICIPATION_ALLOW),
          deny: 0,
        });
      }

      await setMemberRole(member, roleId, true);
      setSearch("");
      await members.refetch();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: ServerMember) {
    const role = accessRole();
    if (!role) return;

    setBusy(true);
    try {
      await setMemberRole(member, role.id, false);
      await members.refetch();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={allowed()}>
      <Column gap="sm">
        <Text class="label">
          <Trans>People</Trans>
        </Text>
        <Text class="body">
          <Trans>
            Give specific people this channel. They can read and take part
            normally but get no admin rights. (They are added to a hidden access
            role for this channel, so you can always see who has it.)
          </Trans>
        </Text>

        <For each={holders()}>
          {(member) => (
            <Row align gap="sm">
              <Avatar
                src={member.avatarURL ?? member.user?.avatarURL}
                fallback={member.displayName}
                size={32}
              />
              <Column gap="none">
                <Text class="body">{member.displayName}</Text>
                <Text class="label">{member.user?.username}</Text>
              </Column>
              <Button
                variant="text"
                isDisabled={busy()}
                onPress={() => remove(member)}
              >
                <Trans>Remove</Trans>
              </Button>
            </Row>
          )}
        </For>
        <Show when={!members.isLoading && holders().length === 0}>
          <Text class="body">
            <Trans>No one added yet.</Trans>
          </Text>
        </Show>

        <TextField
          label={t`Add someone by name, username or ID`}
          value={search()}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <For each={candidates()}>
          {(member) => (
            <Row align gap="sm">
              <Avatar
                src={member.avatarURL ?? member.user?.avatarURL}
                fallback={member.displayName}
                size={32}
              />
              <Column gap="none">
                <Text class="body">{member.displayName}</Text>
                <Text class="label">{member.user?.username}</Text>
              </Column>
              <Button isDisabled={busy()} onPress={() => add(member)}>
                <Trans>Add</Trans>
              </Button>
            </Row>
          )}
        </For>
      </Column>
    </Show>
  );
}
