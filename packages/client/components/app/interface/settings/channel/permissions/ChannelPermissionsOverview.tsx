import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { Button, CategoryButton, Column, Row, Text } from "@revolt/ui";

import { useSettingsNavigation } from "../../Settings";

import {
  CLASS_LABEL,
  ROLE_CLASSES,
  RoleClass,
  classChannelTemplate,
  classFollowsChannel,
  inSequence,
  roleChannelDefaults,
  setClassChannelTemplates,
} from "./channelAccess";

/**
 * Count set bits
 * @param v Number
 * @returns Set bits
 */
function countBits(v: bigint) {
  let bits = 0;
  for (let i = 0n; i < 52n; i++) {
    if (((1n << i) & v) === 1n << i) {
      bits++;
    }
  }

  return bits;
}

/**
 * Menu to select what permission set to change
 */
export function ChannelPermissionsOverview(props: { context: Channel }) {
  const { navigate } = useSettingsNavigation();
  const client = useClient();

  const { showError } = useModals();

  /**
   * The channel as the server has it right now. Bulk actions read this instead
   * of the locally cached channel, which can lag behind.
   */
  async function freshChannel() {
    const data = (await client().api.get(
      `/channels/${props.context.id as ""}`,
    )) as {
      default_permissions?: { a: number; d: number } | null;
      role_permissions?: Record<string, { a: number; d: number }>;
    };

    return {
      hiddenByDefault:
        !!data.default_permissions &&
        (BigInt(data.default_permissions.d) & (1n << 20n)) !== 0n,
      entries: Object.entries(data.role_permissions ?? {})
        .map(([id, v]) => ({ id, a: BigInt(v.a), d: BigInt(v.d) }))
        .filter((entry) => entry.a !== 0n || entry.d !== 0n),
    };
  }

  const roles = createMemo(() => {
    const ordered = props.context.server?.orderedRoles;

    return {
      active: ordered?.filter(
        (role) =>
          countBits(props.context.rolePermissions?.[role.id]?.a || 0n) > 0 ||
          countBits(props.context.rolePermissions?.[role.id]?.d || 0n) > 0,
      ),
      unused: ordered?.filter(
        (role) =>
          countBits(props.context.rolePermissions?.[role.id]?.a || 0n) === 0 &&
          countBits(props.context.rolePermissions?.[role.id]?.d || 0n) === 0,
      ),
    };
  });

  const server = () => props.context.server;
  const [busy, setBusy] = createSignal(false);
  const [confirmRemove, setConfirmRemove] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const classRoles = (roleClass: RoleClass) =>
    server()
      ?.orderedRoles.filter((role) => role.class === roleClass)
      .map((role) => role.name)
      .join(", ") || "no roles";

  const following = (roleClass: RoleClass) => {
    const s = server();
    return !!s && classFollowsChannel(s, roleClass, props.context.id);
  };

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setNotice("");
    try {
      const message = await action();
      if (message) setNotice(message);
    } catch (error) {
      const partial = (error as { partial?: string } | undefined)?.partial;
      if (partial) setNotice(`Stopped early: ${partial}.`);
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  function toggleClass(roleClass: RoleClass) {
    const s = server();
    if (!s || busy()) return;

    void run(() =>
      setClassChannelTemplates(client(), s, props.context.id, {
        [roleClass]: following(roleClass)
          ? null
          : classChannelTemplate(s, roleClass),
      }),
    );
  }

  /**
   * Every class follows its defaults here, and every role without a class gets
   * its own permissions copied in as a starting point.
   */
  function addAll() {
    const s = server();
    if (!s || busy()) return;

    void run(async () => {
      const changes: Partial<
        Record<RoleClass, ReturnType<typeof classChannelTemplate>>
      > = {};
      for (const roleClass of ROLE_CLASSES) {
        if (!following(roleClass)) {
          changes[roleClass] = classChannelTemplate(s, roleClass);
        }
      }
      if (Object.keys(changes).length) {
        await setClassChannelTemplates(client(), s, props.context.id, changes);
      }

      const already = new Set((await freshChannel()).entries.map((e) => e.id));
      const classless = (s.orderedRoles ?? []).filter(
        (role) => !role.class && !already.has(role.id),
      );
      await inSequence(classless, (role) => {
        const start = roleChannelDefaults(s, role);
        return props.context.setPermissions(role.id, {
          allow: Number(start.a),
          deny: Number(start.d),
        });
      });

      return `Classes follow this channel, and ${classless.length} role(s) without a class got their own permissions.`;
    });
  }

  /**
   * Back to a clean slate: no class follows, and role entries are cleared.
   * Refused on a channel that is hidden from everyone by default, where
   * clearing access could lock people out, and role entries that deny
   * something are kept so a deliberate restriction is never lifted by accident.
   */
  function removeAll() {
    const s = server();
    if (!s || busy()) return;
    setConfirmRemove(false);

    void run(async () => {
      const channel = await freshChannel();

      if (channel.hiddenByDefault) {
        return "This channel is hidden from everyone by default, so clearing its roles could lock people out. Remove roles one at a time instead.";
      }

      const changes: Partial<Record<RoleClass, null>> = {};
      for (const roleClass of ROLE_CLASSES) {
        if (following(roleClass)) changes[roleClass] = null;
      }
      if (Object.keys(changes).length) {
        await setClassChannelTemplates(client(), s, props.context.id, changes);
      }

      const clear = channel.entries.filter((entry) => entry.d === 0n);
      const kept = channel.entries.length - clear.length;
      await inSequence(clear, (entry) =>
        props.context.setPermissions(entry.id, { allow: 0, deny: 0 }),
      );

      return kept
        ? `Cleared ${clear.length} role(s). Kept ${kept} that deny something.`
        : `Cleared ${clear.length} role(s).`;
    });
  }

  return (
    <Column gap="lg">
      <CategoryButton
        icon="blank"
        action="chevron"
        description={<Trans>Affects all roles and users</Trans>}
        onClick={() => navigate("permissions/default")}
      >
        <Trans>Default Permissions</Trans>
      </CategoryButton>

      <Show when={server()?.havePermission("ManagePermissions")}>
        <Column gap="sm">
          <Text class="label">Classes</Text>
          <Text class="body">
            Roles in a class start from that class's permissions here, and keep
            following it when the class changes. Anything set on a role below
            still wins.
          </Text>
          <For each={ROLE_CLASSES}>
            {(roleClass) => (
              <CategoryButton
                icon="blank"
                disabled={busy()}
                onClick={() => toggleClass(roleClass)}
                action={
                  <Text class="label">
                    {following(roleClass) ? "Following" : "Off"}
                  </Text>
                }
                description={classRoles(roleClass)}
              >
                {CLASS_LABEL[roleClass]} class
              </CategoryButton>
            )}
          </For>
          <Row>
            <Button isDisabled={busy()} onPress={addAll}>
              Add all
            </Button>
            <Show
              when={confirmRemove()}
              fallback={
                <Button
                  variant="text"
                  isDisabled={busy()}
                  onPress={() => setConfirmRemove(true)}
                >
                  Remove all
                </Button>
              }
            >
              <Button variant="text" isDisabled={busy()} onPress={removeAll}>
                Confirm: clear every role here
              </Button>
              <Button variant="text" onPress={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </Show>
          </Row>
          <Show when={notice()}>
            <Text class="body">{notice()}</Text>
          </Show>
        </Column>
      </Show>

      <Column gap="sm">
        <Text class="label">Role Permissions</Text>
        <For each={roles().active}>
          {(role) => (
            <CategoryButton
              icon={
                <RoleIcon
                  style={{
                    background:
                      role.colour ?? "var(--md-sys-color-outline-variant)",
                  }}
                />
              }
              action="chevron"
              onClick={() => navigate(`permissions/${role.id}`)}
              description={
                <Trans>
                  Grants {countBits(props.context.rolePermissions![role.id].a)}{" "}
                  permissions and denies{" "}
                  {countBits(props.context.rolePermissions![role.id].d)}{" "}
                  permissions
                </Trans>
              }
            >
              {role.name}
            </CategoryButton>
          )}
        </For>
      </Column>

      <Column gap="sm">
        <Text class="label">Unused Roles</Text>
        <For each={roles().unused}>
          {(role) => (
            <CategoryButton
              icon={
                <RoleIcon
                  style={{
                    background:
                      role.colour ?? "var(--md-sys-color-outline-variant)",
                  }}
                />
              }
              action="chevron"
              onClick={() => navigate(`permissions/${role.id}`)}
              description={
                role.class && following(role.class) ? (
                  <Trans>Follows the {CLASS_LABEL[role.class]} class</Trans>
                ) : (
                  <Trans>No permissions set yet</Trans>
                )
              }
            >
              {role.name}
            </CategoryButton>
          )}
        </For>
      </Column>
    </Column>
  );
}

const RoleIcon = styled("div", {
  base: {
    width: "100%",
    height: "100%",
    aspectRatio: "1/1",
    borderRadius: "100%",
  },
});
