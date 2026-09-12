import { useMutation } from "@tanstack/solid-query";

import { Trans } from "@lingui-solid/solid/macro";

import { Avatar, Column, Dialog, DialogProps, Text } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Transfer server ownership to another member.
 *
 * Backed by `PATCH /servers/:server` with `owner: <user id>` - the server
 * refuses this unless the caller is the current owner (or privileged), so the
 * confirmation here is a courtesy, not the real check.
 */
export function TransferOwnershipModal(
  props: DialogProps & Modals & { type: "transfer_ownership" },
) {
  const { showError } = useModals();

  const transfer = useMutation(() => ({
    mutationFn: () =>
      props.member.server!.edit({ owner: props.member.id.user }),
    onError: showError,
  }));

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Transfer Ownership</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Transfer</Trans>,
          onClick: transfer.mutateAsync,
        },
      ]}
      isDisabled={transfer.isPending}
    >
      <Column align>
        <Avatar src={props.member.user?.animatedAvatarURL} size={64} />
        <Text>
          <Trans>
            {props.member.user?.username} will become the owner of{" "}
            {props.member.server?.name}. You will lose owner-only permissions
            immediately - this cannot be undone by yourself, only by the new
            owner transferring it back.
          </Trans>
        </Text>
      </Column>
    </Dialog>
  );
}
