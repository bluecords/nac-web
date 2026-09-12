import { Trans } from "@lingui-solid/solid/macro";

import { Dialog, DialogProps } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create a group or server
 */
export function CreateGroupOrServer(
  props: DialogProps & Modals & { type: "create_group_or_server" },
) {
  const { openModal } = useModals();

  // NAC's Revolt.toml restricts server creation server-side to a handful of
  // admin/bot/test accounts (restrict_server_creation) - regular members
  // were still shown this option and got a confusing error on submit.
  // `privileged` doesn't cover every account on that list (a couple of
  // test/bot accounts are on it without being privileged), but it's the
  // right client-side approximation: the backend restriction stays the
  // real gate either way, this just stops presenting an option most
  // members can never use. Reported by Bunjie 2026-09-11.
  const canCreateServer = () => props.client.user?.privileged;

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title="Create a group or server"
      actions={[
        {
          text: "Group",
          onClick: () => {
            openModal({
              type: "create_group",
              client: props.client,
            });
          },
        },
        ...(canCreateServer()
          ? [
              {
                text: "Server",
                onClick: () => {
                  openModal({
                    type: "create_server",
                    client: props.client,
                  });
                },
              },
            ]
          : []),
      ]}
    >
      <Trans>Would you like to create a new group or server?</Trans>
    </Dialog>
  );
}
