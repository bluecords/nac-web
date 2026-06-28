import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { Server } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { Button, CircularProgress, Column, Row, Text } from "@revolt/ui";

import { ChannelPermissionsEditor } from "../../channel/permissions/ChannelPermissionsEditor";
import { Divider } from "./ServerRoleEditor";

type RoleClass = "admin" | "member" | "free";

const CLASSES: RoleClass[] = ["admin", "member", "free"];

/**
 * Editor for the three built-in role classes' live-linked defaults.
 *
 * Roles assigned to a class (see the class picker in ServerRoleEditor) inherit
 * whatever is set here for anything they haven't explicitly overridden -
 * changing a class's defaults here changes every role in that class
 * immediately, with no per-role edits needed. This is the actual fix for
 * "setting up N roles across M channels from scratch" - new roles just pick a
 * class and inherit an already-configured baseline.
 *
 * Per-channel template overrides (a class's defaults for one specific
 * channel, distinct from its server-wide base permissions below) aren't
 * editable here yet - the resolution already supports it server-side, this UI
 * just doesn't expose it. Worth a follow-up pass.
 */
export function RoleClassesEditor(props: { context: Server }) {
  return (
    <Column gap="lg">
      <Text class="body">
        <Trans>
          Every role belongs to a class (or none, if it manages its own
          permissions entirely). Editing a class's defaults below changes
          every role currently assigned to that class right away.
        </Trans>
      </Text>
      <For each={CLASSES}>
        {(roleClass) => (
          <ClassSection roleClass={roleClass} context={props.context} />
        )}
      </For>
    </Column>
  );
}

const classLabel: Record<RoleClass, string> = {
  admin: "Admin",
  member: "Member",
  free: "Free",
};

function ClassSection(props: { roleClass: RoleClass; context: Server }) {
  const { t } = useLingui();
  const { showError } = useModals();

  const classDefault = createMemo(() =>
    props.context.getClassDefault(props.roleClass),
  );

  const [maxLength, setMaxLength] = createSignal(
    // eslint-disable-next-line solid/reactivity
    classDefault().maxMessageLength?.toString() ?? "",
  );
  const [savingLength, setSavingLength] = createSignal(false);

  const lengthDirty = createMemo(
    () => maxLength() !== (classDefault().maxMessageLength?.toString() ?? ""),
  );

  async function saveMaxLength() {
    setSavingLength(true);
    try {
      const value = maxLength().trim();
      await props.context.setClassDefaultMaxMessageLength(
        props.roleClass,
        value ? Number(value) : undefined,
      );
    } catch (error) {
      showError(error);
    } finally {
      setSavingLength(false);
    }
  }

  return (
    <Column gap="md">
      <Text class="title" size="small">
        {classLabel[props.roleClass]}
      </Text>

      <ChannelPermissionsEditor
        type="class_default"
        context={props.context}
        roleClass={props.roleClass}
      />

      <Column gap="sm">
        <Text class="label">
          <Trans>Default Max Message Length</Trans>
        </Text>
        <Row align gap="sm">
          <NumberInput
            type="number"
            min={1}
            placeholder={
              props.roleClass === "admin" ? t`Unlimited` : t`Instance default`
            }
            value={maxLength()}
            onInput={(e) =>
              setMaxLength((e.currentTarget as HTMLInputElement).value)
            }
          />
          <Show when={lengthDirty()}>
            <Button onPress={saveMaxLength} isDisabled={savingLength()}>
              <Trans>Save</Trans>
            </Button>
          </Show>
          <Show when={savingLength()}>
            <CircularProgress />
          </Show>
        </Row>
      </Column>

      <Divider />
    </Column>
  );
}

const NumberInput = styled("input", {
  base: {
    padding: "var(--gap-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    width: "180px",
  },
});
