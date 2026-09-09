import { Show } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Message } from "stoat.js";

import {
  ContextMenu,
  ContextMenuButton,
  ContextMenuDivider,
} from "@revolt/app/menus/ContextMenu";
import { useClient, useUser } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";

import MdContentCopy from "@material-design-icons/svg/outlined/content_copy.svg?component-solid";
import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdEdit from "@material-design-icons/svg/outlined/edit.svg?component-solid";
import MdOpenInNew from "@material-design-icons/svg/outlined/open_in_new.svg?component-solid";
import MdPin from "@material-design-icons/svg/outlined/pin_invoke.svg?component-solid";
import MdReply from "@material-design-icons/svg/outlined/reply.svg?component-solid";
import MdReport from "@material-design-icons/svg/outlined/report.svg?component-solid";
import MdShare from "@material-design-icons/svg/outlined/share.svg?component-solid";

/**
 * Context menu for a post CARD in the forum list.
 *
 * The shared `MessageContextMenu` was written for a text-channel message with
 * the composer and the inline editor always mounted. In the forum list neither
 * is - so its Reply and Edit actions silently did nothing, which is exactly the
 * confusing dead button Bunjie hit. This menu only offers actions that work
 * from the list, and Reply / Edit here OPEN the post first.
 */
export function ForumPostCardMenu(props: {
  post: Message;
  openPost: () => void;
}) {
  const user = useUser();
  const client = useClient();
  const state = useState();
  const { openModal, showError } = useModals();

  const canSend = () => props.post.channel?.havePermission("SendMessage");
  const canManage = () => props.post.channel?.havePermission("ManageMessages");
  const isOwn = () => props.post.author?.self;

  function copyLink() {
    navigator.clipboard.writeText(
      `${location.origin}${
        props.post.server ? `/server/${props.post.server.id}` : ""
      }/channel/${props.post.channelId}/${props.post.id}`,
    );
  }

  return (
    <ContextMenu>
      <ContextMenuButton icon={MdOpenInNew} onClick={props.openPost}>
        <Trans>Open post</Trans>
      </ContextMenuButton>
      <Show when={canSend()}>
        <ContextMenuButton
          icon={MdReply}
          onClick={() => {
            props.openPost();
            state.draft.addReply(props.post, user()!.id);
          }}
        >
          <Trans>Reply</Trans>
        </ContextMenuButton>
      </Show>
      <Show when={isOwn() && canSend()}>
        <ContextMenuButton
          icon={MdEdit}
          onClick={() => {
            props.openPost();
            state.draft.setEditingMessage(props.post);
          }}
        >
          <Trans>Edit post</Trans>
        </ContextMenuButton>
      </Show>

      <ContextMenuDivider />

      <ContextMenuButton
        icon={MdContentCopy}
        onClick={() => navigator.clipboard.writeText(props.post.content ?? "")}
      >
        <Trans>Copy text</Trans>
      </ContextMenuButton>
      <ContextMenuButton icon={MdShare} onClick={copyLink}>
        <Trans>Copy link</Trans>
      </ContextMenuButton>

      <Show when={canManage()}>
        <ContextMenuButton
          icon={MdPin}
          onClick={() =>
            (props.post.pinned ? props.post.unpin() : props.post.pin()).catch(
              showError,
            )
          }
        >
          <Show when={props.post.pinned} fallback={<Trans>Pin post</Trans>}>
            <Trans>Unpin post</Trans>
          </Show>
        </ContextMenuButton>
      </Show>

      <Show when={!isOwn()}>
        <ContextMenuButton
          icon={MdReport}
          destructive
          onClick={() =>
            openModal({
              type: "report_content",
              target: props.post,
              client: client(),
            })
          }
        >
          <Trans>Report post</Trans>
        </ContextMenuButton>
      </Show>
      <Show when={isOwn() || canManage()}>
        <ContextMenuButton
          icon={MdDelete}
          destructive
          onClick={() =>
            openModal({ type: "delete_message", message: props.post })
          }
        >
          <Trans>Delete post</Trans>
        </ContextMenuButton>
      </Show>
    </ContextMenu>
  );
}
