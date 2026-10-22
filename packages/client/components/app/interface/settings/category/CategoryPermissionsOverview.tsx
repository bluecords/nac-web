import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Permission, Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { CategoryButton, Checkbox, Column, Row, Text } from "@revolt/ui";

import { useSettingsNavigation } from "../Settings";

export type CategoryContext = { server: Server; categoryId: string };

/**
 * Menu to choose what a category gives to everyone, or to a role, in all of
 * its channels. Channels follow it unless they set the same permission
 * themselves.
 */
export function CategoryPermissionsOverview(props: {
  context: CategoryContext;
}) {
  const { navigate } = useSettingsNavigation();
  const { showError } = useModals();

  const category = () =>
    props.context.server.categories?.find(
      (category) => category.id === props.context.categoryId,
    );

  const bits = (value?: { a: number; d: number }) => ({
    a: BigInt(value?.a ?? 0),
    d: BigInt(value?.d ?? 0),
  });

  const isSet = (value?: { a: number; d: number }) => {
    const { a, d } = bits(value);
    return a !== 0n || d !== 0n;
  };

  /**
   * "Private category": the category is hidden from everyone except the roles
   * listed below it.
   */
  const isPrivate = () =>
    (bits(category()?.default_permissions).d & Permission.ViewChannel) !== 0n;

  const [busy, setBusy] = createSignal(false);

  async function setPrivate(on: boolean) {
    if (busy()) return;

    const { a, d } = bits(category()?.default_permissions);

    setBusy(true);
    try {
      await props.context.server.setCategoryPermissions(
        props.context.categoryId,
        "default",
        {
          allow: Number(on ? a & ~Permission.ViewChannel : a),
          deny: Number(
            on ? d | Permission.ViewChannel : d & ~Permission.ViewChannel,
          ),
        },
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  const roles = createMemo(() => {
    const ordered = props.context.server.orderedRoles;
    const own = category()?.role_permissions ?? {};

    return {
      active: ordered.filter((role) => isSet(own[role.id])),
      unused: ordered.filter((role) => !isSet(own[role.id])),
    };
  });

  return (
    <Column gap="lg">
      <Row align>
        <Column gap="none" grow>
          <Text class="label">
            <Trans>Private category</Trans>
          </Text>
          <Text class="body">
            <Trans>
              Hides this category from everyone except the roles you give "View
              Channel" below, even people who could see it through the server's
              own permissions. Channels in it follow, unless a channel sets its
              own (use "Sync now" on a channel to clear those).
            </Trans>
          </Text>
        </Column>
        <Checkbox
          disabled={busy()}
          checked={isPrivate()}
          onChange={(event) => setPrivate(event.currentTarget.checked)}
        />
      </Row>

      <CategoryButton
        icon="blank"
        action="chevron"
        description={<Trans>Affects all roles and users</Trans>}
        onClick={() => navigate("permissions/default")}
      >
        <Trans>Default Permissions</Trans>
      </CategoryButton>

      <Column gap="sm">
        <Text class="label">
          <Trans>Role Permissions</Trans>
        </Text>
        <Show
          when={roles().active.length}
          fallback={
            <Text class="body">
              <Trans>No roles set yet.</Trans>
            </Text>
          }
        >
          <For each={roles().active}>
            {(role) => (
              <CategoryButton
                icon={<RoleIcon style={{ background: role.colour ?? "" }} />}
                action="chevron"
                onClick={() => navigate(`permissions/${role.id}`)}
              >
                {role.name}
              </CategoryButton>
            )}
          </For>
        </Show>
      </Column>

      <Column gap="sm">
        <Text class="label">
          <Trans>Add a role</Trans>
        </Text>
        <For each={roles().unused}>
          {(role) => (
            <CategoryButton
              icon={<RoleIcon style={{ background: role.colour ?? "" }} />}
              action="chevron"
              onClick={() => navigate(`permissions/${role.id}`)}
              description={<Trans>No permissions set yet</Trans>}
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
    background: "var(--md-sys-color-outline-variant)",
  },
});
