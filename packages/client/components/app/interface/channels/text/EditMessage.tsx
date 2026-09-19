import { Match, Show, Switch } from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { useMutation } from "@tanstack/solid-query";
import { Message } from "stoat.js";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { KeybindAction, createKeybind } from "@revolt/keybinds";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { Text } from "@revolt/ui";
import { TextEditor2 } from "@revolt/ui/components/features/texteditor/TextEditor2";
import { useSearchSpace } from "@revolt/ui/components/utils/autoComplete";

export function EditMessage(props: { message: Message }) {
  const { t } = useLingui();
  const state = useState();
  const client = useClient();
  const { openModal, isOpen, pop } = useModals();

  const pendingFileIds = () =>
    state.draft.getDraft(props.message.channelId).files ?? [];
  const pendingFiles = () => pendingFileIds().length;

  const initialValue = [state.draft.editingMessageContent || ""] as const;

  const change = useMutation(() => ({
    mutationFn: async (data: { content?: string; fileIds: string[] }) => {
      // attachments isn't in stoat-api's DataEditMessage type yet, but is sent
      // over the wire and handled by the backend (same gap as forum_tags).
      const edit: Parameters<Message["edit"]>[0] & { attachments?: string[] } =
        {};
      if (data.content) edit.content = data.content;
      if (data.fileIds.length) {
        edit.attachments = await state.draft.uploadFiles(
          client(),
          data.fileIds,
        );
      }

      const before = props.message.attachments?.length ?? 0;
      const result = await props.message.edit(edit);

      // A server without attachment-edit support accepts the request and drops
      // the files silently, so check they actually landed instead of trusting 200.
      if (data.fileIds.length && (result.attachments?.length ?? 0) <= before) {
        throw new Error(
          "The server did not attach your files to this message.",
        );
      }

      return result;
    },
    onSuccess(_result, data) {
      for (const fileId of data.fileIds) {
        state.draft.removeFile(props.message.channelId, fileId);
      }

      state.draft.setEditingMessage(undefined);
    },
    onError(error) {
      openModal({ type: "error2", error });
    },
  }));

  function saveMessage() {
    // A second Enter during a slow upload would attach the files twice.
    if (change.isPending) return;

    const content = state.draft.editingMessageContent;
    const fileIds = [...pendingFileIds()];

    // Emptying the text is a delete request, as it always was. The one
    // exception is a message with no text of its own (files only): adding
    // files to it is a save, not a delete.
    const canSaveWithoutText = fileIds.length > 0 && !props.message.content;
    if (content?.length || canSaveWithoutText) {
      state.draft._setNodeReplacement?.(["_focus"]); // focus message box

      const textChanged =
        !!content?.length && content !== props.message.content;
      if (!textChanged && !fileIds.length) {
        state.draft.setEditingMessage(undefined);
        return;
      }

      change.mutate({ content: textChanged ? content : undefined, fileIds });
    } else if (isOpen("delete_message")) {
      void props.message.delete();
      pop();
    } else {
      openModal({
        type: "delete_message",
        message: props.message,
      });
    }
  }

  createKeybind(KeybindAction.CHAT_CANCEL_EDITING, () => {
    state.draft.setEditingMessage(undefined);
    state.draft._setNodeReplacement?.(["_focus"]); // focus message box
  });

  const searchSpace = useSearchSpace(() => props.message, client);

  return (
    <>
      <EditorBox class={css({ flexGrow: 1 })}>
        <TextEditor2
          autoFocus
          onComplete={saveMessage}
          onChange={state.draft.setEditingMessageContent}
          initialValue={initialValue}
          autoCompleteSearchSpace={searchSpace}
        />
      </EditorBox>

      <Switch
        fallback={
          <Text size="small">
            escape to{" "}
            <Action onClick={() => state.draft.setEditingMessage(undefined)}>
              cancel
            </Action>{" "}
            &middot; enter to <Action onClick={saveMessage}>save</Action>
          </Text>
        }
      >
        <Match when={change.isPending}>
          <Text size="small">Saving message...</Text>
        </Match>
      </Switch>

      <Show when={pendingFiles() > 0}>
        <Text size="small">
          {t`Attached files will be added to this message when you save.`}
        </Text>
      </Show>
    </>
  );
}

const EditorBox = styled("div", {
  base: {
    background: "var(--md-sys-color-surface-container-highest)",
    color: "var(--md-sys-color-on-surface-container)",
    borderRadius: "var(--borderRadius-sm)",
    padding: "var(--gap-md)",
  },
});

const Action = styled("span", {
  base: {
    fontWeight: 600,
    cursor: "pointer",
    color: "var(--md-sys-color-primary)",
  },
});
