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

/** A tap that drifts further than this is a scroll, not a press. */
const TAP_MOVE_TOLERANCE = 8;

export function MessageToolbar(props: { message?: Message }) {
  const user = useUser();
  const state = useState();
  const { openModal } = useModals();

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

  // Captured when the picker renders its trigger, so the touch path below can
  // reach the same action the trigger's onClick uses.
  let openEmojiPicker: (() => void) | undefined;

  /**
   * What each button does, keyed by its data-tool attribute. The mouse path
   * calls these through onClick; the touch path calls them from pointerup.
   */
  const actions: Record<string, () => void> = {
    reply: () => state.draft.addReply(props.message!, user()!.id),
    emoji: () => openEmojiPicker?.(),
    edit: () => state.draft.setEditingMessage(props.message),
    delete: () =>
      props.message &&
      openModal({ type: "delete_message", message: props.message }),
  };

  // Set when touch has already run an action, so the click the browser
  // synthesises afterwards does not run it a second time. Cleared on every
  // fresh pointerdown: a pointerup whose click never arrives must not leave
  // this armed and swallow the NEXT genuine click - the same trap floating.ts
  // hit and records.
  let swallowClick = false;

  /**
   * Guard a mouse-path handler against double-firing after a touch tap
   */
  function fromClick(run: (ev: MouseEvent) => void) {
    return (ev: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      run(ev);
    };
  }

  /**
   * Take the strip's own pointer stream out of the message's gestures, and
   * act on touch taps directly.
   *
   * THE PROBLEM THIS SOLVES. This strip is a CHILD of the message container,
   * and that container runs two gesture systems over the same subtree:
   *   - the 220ms dwell that reveals this strip (Container.tsx), and
   *   - the 500ms long-press that opens the context menu (floating.ts).
   * Every touch on a button here bubbles into both. #116 guarded the first by
   * ignoring events whose target is inside .Toolbar, but the second was never
   * guarded at all - so a deliberate press on a button still armed the
   * long-press and could open the context menu on top of the strip instead of
   * running the button. Filtering by target in each consumer does not scale;
   * stopping the stream at the control surface does, and covers any future
   * gesture added to the message.
   *
   * Only pointer events are stopped. `click` is deliberately left to bubble,
   * because Solid delegates click at the document - stopping it here would
   * break every button on desktop.
   */
  function wireToolbarPointers(el: HTMLDivElement) {
    let startX = 0;
    let startY = 0;
    let moved = false;

    el.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      swallowClick = false;
      if (e.pointerType !== "touch") return;
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
    });

    el.addEventListener("pointermove", (e: PointerEvent) => {
      e.stopPropagation();
      if (e.pointerType !== "touch") return;
      if (
        Math.abs(e.clientX - startX) > TAP_MOVE_TOLERANCE ||
        Math.abs(e.clientY - startY) > TAP_MOVE_TOLERANCE
      ) {
        moved = true;
      }
    });

    el.addEventListener("pointerup", (e: PointerEvent) => {
      e.stopPropagation();
      if (e.pointerType !== "touch" || moved) return;

      // Act here rather than waiting for the synthesised click. Same reasoning
      // as the profile "..." fix (#112): on touch the click is the fragile
      // half of the interaction, and the strip is the one surface where losing
      // it leaves the member with no way to reply, react or delete.
      const button = (e.target as HTMLElement | null)?.closest?.(
        "[data-tool]",
      ) as HTMLElement | null;

      const action = button?.dataset.tool && actions[button.dataset.tool];
      if (!action) return;

      swallowClick = true;
      action();
    });

    el.addEventListener("pointercancel", (e: PointerEvent) =>
      e.stopPropagation(),
    );
  }

  return (
    <Base class="Toolbar" ref={wireToolbarPointers}>
      <Show when={props.message?.channel?.havePermission("SendMessage")}>
        <div
          class={tool()}
          data-tool="reply"
          onClick={fromClick(() => actions.reply())}
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
          {(triggerProps) => {
            openEmojiPicker = triggerProps.onClickEmoji;
            return (
              <div
                ref={triggerProps.ref}
                class={tool()}
                data-tool="emoji"
                onClick={fromClick(() => actions.emoji())}
              >
                <Ripple />
                <MdEmojiEmotions {...iconSize(20)} />
              </div>
            );
          }}
        </CompositionMediaPicker>
      </Show>
      <Show when={props.message?.author?.self}>
        <div
          class={tool()}
          data-tool="edit"
          onClick={fromClick(() => actions.edit())}
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
        <div class={tool()} data-tool="delete" onClick={fromClick(deleteMessage)}>
          <Ripple />
          <MdDelete {...iconSize(20)} />
        </div>
      </Show>
      <div
        class={tool()}
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
    top: "-18px",
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
});

const tool = cva({
  base: {
    cursor: "pointer",
    position: "relative",
    padding: "var(--gap-sm)",
  },
});
