import { Trans, useLingui } from "@lingui-solid/solid/macro";
import MdContentCopy from "@material-design-icons/svg/outlined/content_copy.svg?component-solid";
import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MDPalette from "@material-design-icons/svg/outlined/palette.svg?component-solid";
import { useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { useModals } from "@revolt/modal";
import {
  Button,
  CategoryButton,
  CircularProgress,
  Column,
  Form2,
  IconButton,
  MenuItem,
  Row,
  Text,
} from "@revolt/ui";
import { createFormControl, createFormGroup } from "solid-forms";
import { For, Show, createMemo, createSignal } from "solid-js";
import { API, Server, ServerRole } from "stoat.js";
import { styled } from "styled-system/jsx";
import { useSettingsNavigation } from "../../Settings";
import { ChannelPermissionsEditor } from "../../channel/permissions/ChannelPermissionsEditor";

/**
 * Role editor
 */
export function ServerRoleEditor(props: { context: Server; roleId: string }) {
  const { t } = useLingui();
  const client = useClient();
  const { openModal } = useModals();
  const { navigate } = useSettingsNavigation();

  const role = createMemo(
    () =>
      props.context.orderedRoles.find(
        (r) => r.id == props.roleId,
      ) as ServerRole,
  );

  /* eslint-disable solid/reactivity */
  const editGroup = createFormGroup({
    name: createFormControl(role()?.name || ""),
    icon: createFormControl<string | File[] | null>(role()?.icon?.originalUrl),
    colour: createFormControl(role()?.colour || null),
    hoist: createFormControl(role()?.hoist == true),
    class: createFormControl(role()?.class ?? "none"),
    maxMessageLength: createFormControl(
      role()?.maxMessageLength?.toString() ?? "",
    ),
  });
  /* eslint-enable solid/reactivity */

  const [pickerRef, setPickerRef] = createSignal<HTMLDivElement>();

  async function onSubmit() {
    // `class`/`max_message_length`/the `Class`/`MaxMessageLength` remove-field
    // variants are newer than the generated stoat-api types (see ServerRole.ts) -
    // widen the type locally rather than waiting on a regenerated package.
    const changes: API.DataEditRole & {
      class?: string;
      max_message_length?: number;
      remove: string[];
    } = {
      remove: [],
    };

    if (editGroup.controls.name.isDirty) {
      changes.name = editGroup.controls.name.value.trim();
    }

    let uploadError: unknown;

    if (editGroup.controls.icon.isDirty) {
      if (!editGroup.controls.icon.value) {
        changes.remove!.push("Icon");
      } else if (Array.isArray(editGroup.controls.icon.value)) {
        try {
          changes.icon = await client().uploadFile(
            "icons",
            editGroup.controls.icon.value[0],
            CONFIGURATION.DEFAULT_MEDIA_URL,
          );
        } catch (error) {
          uploadError = error;
        }
      }
    }

    if (editGroup.controls.hoist.isDirty) {
      changes.hoist = editGroup.controls.hoist.value;
    }

    if (editGroup.controls.colour.isDirty) {
      changes.colour = editGroup.controls.colour.value ?? null;
    }

    if (editGroup.controls.class.isDirty) {
      const value = editGroup.controls.class.value;
      if (value === "none") {
        changes.remove.push("Class");
      } else {
        changes.class = value;
      }
    }

    if (editGroup.controls.maxMessageLength.isDirty) {
      const value = editGroup.controls.maxMessageLength.value.trim();
      if (!value) {
        changes.remove.push("MaxMessageLength");
      } else {
        changes.max_message_length = Number(value);
      }
    }

    await props.context.editRole(
      props.roleId,
      changes as unknown as API.DataEditRole,
    );

    if (uploadError) throw uploadError;
  }

  function onReset() {
    editGroup.controls.name.setValue(role()?.name || "");
    editGroup.controls.icon.setValue(role()?.icon?.originalUrl || null);
    editGroup.controls.hoist.setValue(role()?.hoist || false);
    editGroup.controls.colour.setValue(role()?.colour || null);
    editGroup.controls.class.setValue(role()?.class ?? "none");
    editGroup.controls.maxMessageLength.setValue(
      role()?.maxMessageLength?.toString() ?? "",
    );
  }

  const submit = Form2.useSubmitHandler(editGroup, onSubmit, onReset);

  return (
    <Column>
      <form onSubmit={submit}>
        <Column gap="lg">
          <Form2.TextField
            minlength={1}
            maxlength={32}
            counter
            name="name"
            control={editGroup.controls.name}
            label={t`Role Name`}
          />
          <Column>
            <Row align>
              <IconButton
                ref={setPickerRef}
                variant="filled"
                shape="square"
                size="lg"
                onPress={() => pickerRef()?.click()}
              >
                <MDPalette />
              </IconButton>
              <input
                ref={setPickerRef}
                type="color"
                value={editGroup.controls.colour.value ?? "#ffffff"}
                onInput={(e) => {
                  const colour = (e.currentTarget as HTMLInputElement).value;
                  editGroup.controls.colour.setValue(colour);
                  editGroup.controls.colour.markDirty(true);
                }}
                style={{
                  position: "absolute",
                  opacity: 0,
                  width: "0px",
                  height: "0px",
                  padding: 0,
                  border: "none",
                }}
              />
              <Column gap="lg">
                <Row justify>
                  <For
                    each={[
                      "#7B68EE",
                      "#3498DB",
                      "#1ABC9C",
                      "#F1C40F",
                      "#FF7F50",
                      "#FD6671",
                      "#E91E63",
                      "#D468EE",
                    ]}
                  >
                    {(colour) => (
                      <Button
                        size="sm"
                        bg={colour}
                        group="standard"
                        groupActive={editGroup.controls.colour.value === colour}
                        onPress={() => {
                          editGroup.controls.colour.setValue(colour);
                          editGroup.controls.colour.markDirty(true);
                        }}
                      />
                    )}
                  </For>
                </Row>

                <Row justify>
                  <For
                    each={[
                      "#594CAD",
                      "#206694",
                      "#11806A",
                      "#C27C0E",
                      "#CD5B45",
                      "#FF424F",
                      "#AD1457",
                      "#954AA8",
                    ]}
                  >
                    {(colour) => (
                      <Button
                        size="sm"
                        bg={colour}
                        group="standard"
                        groupActive={editGroup.controls.colour.value === colour}
                        onPress={() => {
                          editGroup.controls.colour.setValue(colour);
                          editGroup.controls.colour.markDirty(true);
                        }}
                      />
                    )}
                  </For>
                </Row>
              </Column>
            </Row>
          </Column>

          <Form2.FileInput
            control={editGroup.controls.icon}
            accept="image/*"
            label={t`Role Icon`}
            imageJustify={false}
          />

          <Column>
            <Text class="label">Hoist Role</Text>
            <Form2.Checkbox control={editGroup.controls.hoist}>
              Display this role above others
            </Form2.Checkbox>
          </Column>

          <Column>
            <Form2.Select
              label={t`Permission Class`}
              control={editGroup.controls.class}
            >
              <MenuItem value="none">
                <Trans>None (this role's permissions are self-contained)</Trans>
              </MenuItem>
              <MenuItem value="admin">
                <Trans>Admin</Trans>
              </MenuItem>
              <MenuItem value="member">
                <Trans>Member</Trans>
              </MenuItem>
              <MenuItem value="free">
                <Trans>Free</Trans>
              </MenuItem>
            </Form2.Select>
            <Text class="body">
              <Trans>
                Roles in a class inherit that class's default permissions and
                message length live - editing the class's defaults (in Role
                Classes settings) changes every role in it immediately, unless
                this role explicitly overrides a given permission below.
              </Trans>
            </Text>
          </Column>

          <Form2.TextField
            type="number"
            min={1}
            name="maxMessageLength"
            control={editGroup.controls.maxMessageLength}
            label={t`Max Message Length Override`}
            placeholder={t`Inherit from class / instance default`}
          />

          <Column>
            <Row>
              <Form2.Reset group={editGroup} onReset={onReset} />
              <Form2.Submit group={editGroup} requireDirty>
                <Trans>Save</Trans>
              </Form2.Submit>
              <Show when={editGroup.isPending}>
                <CircularProgress />
              </Show>
            </Row>
          </Column>
        </Column>
      </form>
      <Divider />
      <ChannelPermissionsEditor
        type="server_role"
        context={props.context}
        roleId={props.roleId}
      />
      <Column>
        <CategoryButton
          action="chevron"
          icon={<MdContentCopy />}
          onClick={() => navigator.clipboard.writeText(`${props.roleId}`)}
        >
          <Trans>Copy role ID</Trans>
        </CategoryButton>
        <CategoryButton
          action="chevron"
          icon={<MdDelete />}
          onClick={() =>
            openModal({
              type: "delete_role",
              role: role(),
              cb: () => navigate("roles"),
            })
          }
        >
          <Trans>Delete Role</Trans>
        </CategoryButton>
      </Column>
    </Column>
  );
}

export const Divider = styled("div", {
  base: {
    height: "1px",
    margin: "var(--gap-sm) 0",
    background: "var(--md-sys-color-outline-variant)",
  },
});
