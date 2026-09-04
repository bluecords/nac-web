import { Show } from "solid-js";

import { Message } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { MessageContextMenu } from "@revolt/app";
import { useUser } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { Ripple } from "@revolt/ui/components/design";
import { iconSize } from "@revolt/ui/components/utils";

import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdEdit from "@material-design-icons/svg/outlined/edit.svg?component-solid";
import MdEmojiEmotions from "@material-design-icons/svg/outlined/emoji_emotions.svg?component-solid";
import MdMoreVert from "@material-design-icons/svg/outlined/more_vert.svg?component-solid";
import MdReply from "@material-design-icons/svg/outlined/reply.svg?component-solid";

import { startsWithPackPUA } from "@revolt/markdown/emoji/UnicodeEmoji";
import { CompositionMediaPicker } from "../composition";
import { isFinePointer } from "../composition/picker/pointer";

export function MessageToolbar(props: { message?: Message }) {
  const user = useUser();
  const state = useState();
  const { openModal } = useModals();

  // Fingers get bigger targets; a mouse keeps the compact strip.
  const touch = !isFinePointer();

  // todo: a11y for buttons; tabindex

  /**
   * Delete the message
   */
  function deleteMessage(ev: MouseEvent) {
    if (ev.shiftKey) {
      props.message?.delete();
    } else if (props.message) {
      openModal({
        type: "delete_message",
        message: props.message,
      });
    }
  }

  return (
    <Base class="Toolbar" touch={touch}>
      <Show when={props.message?.channel?.havePermission("SendMessage")}>
        <div
          class={tool({ touch })}
          onClick={() => state.draft.addReply(props.message!, user()!.id)}
        >
          <Ripple />
          <MdReply {...iconSize(20)} />
        </div>
      </Show>
      <Show when={props.message?.channel?.havePermission("React")}>
        <CompositionMediaPicker
          onMessage={(content) =>
            props.message?.channel?.sendMessage({
              content,
              replies: [{ id: props.message.id, mention: true }],
            })
          }
          onTextReplacement={(emoji) =>
            props.message!.react(
              emoji.startsWith(":")
                ? emoji.slice(1, emoji.length - 1)
                : startsWithPackPUA(emoji)
                  ? emoji.slice(1)
                  : emoji,
            )
          }
        >
          {(triggerProps) => (
            <div
              ref={triggerProps.ref}
              class={tool({ touch })}
              onClick={triggerProps.onClickEmoji}
            >
              <Ripple />
              <MdEmojiEmotions {...iconSize(20)} />
            </div>
          )}
        </CompositionMediaPicker>
      </Show>
      <Show when={props.message?.author?.self}>
        <div
          class={tool({ touch })}
          onClick={() => state.draft.setEditingMessage(props.message)}
        >
          <Ripple />
          <MdEdit {...iconSize(20)} />
        </div>
      </Show>
      <Show
        when={
          props.message?.author?.self ||
          props.message?.channel?.havePermission("ManageMessages")
        }
      >
        <div class={tool({ touch })} onClick={deleteMessage}>
          <Ripple />
          <MdDelete {...iconSize(20)} />
        </div>
      </Show>
      <div
        class={tool({ touch })}
        use:floating={{
          contextMenu: () => <MessageContextMenu message={props.message!} />,
          contextMenuHandler: "click",
        }}
      >
        <Ripple />
        <MdMoreVert {...iconSize(20)} />
      </div>
    </Base>
  );
}

const Base = styled("div", {
  base: {
    right: "16px",
    position: "absolute",

    alignItems: "center",

    display: "none",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-xs)",
    boxShadow: "0 0 3px var(--md-sys-color-shadow)",

    fill: "var(--md-sys-color-on-secondary-container)",
    background: "var(--md-sys-color-secondary-container)",
  },
  variants: {
    // On touch the strip sits INSIDE its own message, in the 48px band the
    // container reserves on hover (see Container.tsx). Absolutely positioned
    // elements are placed against the containing block's PADDING box, so
    // top:2px lands in that reserved band, above this message's content and
    // below the previous message. It covers nothing.
    //
    // -46px was the previous attempt: it cleared this message's text by
    // sitting on the PREVIOUS message's text instead. Measured on his handset.
    touch: {
      true: { top: "2px" },
      false: { top: "-18px" },
    },
  },
});

const tool = cva({
  base: {
    cursor: "pointer",
    position: "relative",
  },
  variants: {
    // 20px icon + 2x12 = 44x44, the standard minimum touch target. Measured on
    // his handset 2026-09-03 the buttons were 28x28 (20px icon + 2x --gap-sm).
    //
    // Chosen in JS via isFinePointer(), NOT as a nested @media key in this
    // block. Panda does not turn a nested @media inside cva into a real media
    // query - it flattens the whole condition into the CLASS NAME, which is
    // what took the toolbar out entirely on 2026-09-02. Same reason the picker
    // does its autofocus check in JS.
    touch: {
      true: { padding: "12px" },
      false: { padding: "var(--gap-sm)" },
    },
  },
});
