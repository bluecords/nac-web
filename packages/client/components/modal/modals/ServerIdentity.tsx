import { createFormControl, createFormGroup } from "solid-forms";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { API } from "stoat.js";

import { useClient } from "@revolt/client";
import { CONFIGURATION, uploadFile } from "@revolt/common";
import { Column, Dialog, DialogProps, Form2 } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to update the user's server identity
 */
export function ServerIdentityModal(
  props: DialogProps & Modals & { type: "server_identity" },
) {
  const { t } = useLingui();
  const client = useClient();
  const { showError } = useModals();

  /* eslint-disable solid/reactivity */
  const group = createFormGroup({
    avatar: createFormControl<string | File[] | null>(
      props.member.animatedAvatarURL,
    ),
    nickname: createFormControl(props.member.nickname ?? ""),
  });
  /* eslint-enable solid/reactivity */

  async function onSubmit() {
    // Build up `changes` and apply whatever succeeds rather than aborting the
    // whole submission the moment one step throws. Previously, a failed
    // avatar upload (e.g. an oversized file, a proxy error) threw BEFORE
    // member.edit() ever ran — silently discarding a nickname change made in
    // the same save, with no indication which field actually failed.
    const changes: API.DataMemberEdit = {
      remove: [],
    };
    let uploadError: unknown;

    if (group.controls.nickname.isDirty) {
      const nickname = group.controls.nickname.value.trim();
      if (nickname) {
        changes.nickname = nickname;
      } else {
        changes.remove!.push("Nickname");
      }
    }

    if (group.controls.avatar.isDirty) {
      if (!group.controls.avatar.value) {
        changes.remove!.push("Avatar");
      } else if (Array.isArray(group.controls.avatar.value)) {
        try {
          changes.avatar = await uploadFile(
            client(),
            "avatars",
            group.controls.avatar.value[0],
            CONFIGURATION.DEFAULT_MEDIA_URL,
          );
        } catch (error) {
          uploadError = error; // avatar left untouched; still try the rest below
        }
      }
    }

    try {
      await props.member.edit(changes);
    } catch (error) {
      showError(error);
      return;
    }

    if (uploadError) {
      showError(uploadError);
      return; // other changes saved; modal stays open so the user can retry the avatar
    }

    props.onClose();
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Change identity on {props.member.server!.name}</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Save</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
    >
      <form onSubmit={submit}>
        <Column>
          <Form2.FileInput
            control={group.controls.avatar}
            accept="image/*"
            label={t`Server Avatar`}
            imageJustify={false}
          />
          <Form2.TextField
            minlength={1}
            maxlength={32}
            counter
            name="nickname"
            label={t`Nickname`}
            control={group.controls.nickname}
            placeholder={props.member.user?.displayName}
          />
        </Column>
      </form>
    </Dialog>
  );
}
