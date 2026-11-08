import { For, Show, createMemo } from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { API } from "stoat.js";
import { styled } from "styled-system/jsx";

import { Emoji } from "@revolt/markdown";
import { useUsers } from "@revolt/markdown/users";
import { Ripple, Text } from "@revolt/ui/components/design";
import { Tooltip } from "@revolt/ui/components/floating";
import { Row } from "@revolt/ui/components/layout";

import MdAdd from "@material-design-icons/svg/outlined/add.svg?component-solid";

import { startsWithPackPUA } from "@revolt/markdown/emoji/UnicodeEmoji";
import { CompositionMediaPicker } from "../composition";
import { isFinePointer } from "../composition/picker/pointer";

interface Props {
  /**
   * Reactions data
   */
  reactions?: Map<string, Set<string>>;

  /**
   * Interactions
   */
  interactions: API.Message["interactions"];

  /**
   * ID of current user
   */
  userId?: string;

  /**
   * Open the full list of who reacted (right-click, or long-press on a phone)
   * @param reaction ID of the reaction that was pressed
   */
  onViewReactions?(reaction: string): void;

  /**
   * Add a reaction
   * @param reaction ID
   */
  addReaction(reaction: string): void;

  /**
   * Send a GIF reaction
   * @param text Message
   */
  sendGIF(text: string): void;

  /**
   * Remove a reaction
   * @param reaction ID
   */
  removeReaction(reaction: string): void;
}

/**
 * Message reactions
 */
export function Reactions(props: Props) {
  /**
   * Determine two lists of 'required' and 'optional' reactions
   */
  const lists = createMemo(() => {
    const required = new Set<string>();
    const optional = new Set<string>();

    if (props.interactions?.reactions) {
      for (const reaction of props.interactions.reactions) {
        required.add(reaction);
      }
    }

    if (props.reactions) {
      for (const key of props.reactions.keys()) {
        if (!required.has(key)) {
          optional.add(key);
        }
      }
    }

    return {
      required: Array.from(required),
      optional: Array.from(optional),
    };
  });

  /**
   * Determine whether we are showing any reactions
   * @param both Whether to check if both are present
   * @returns Number of either required or optional if present
   */
  const hasReactions = (both?: boolean) => {
    const { required, optional } = lists();
    return both
      ? required.length && optional.length
      : required.length || optional.length;
  };

  return (
    <Show when={hasReactions()}>
      <List>
        <For each={lists().required}>
          {(entry) => (
            <Reaction
              reaction={entry}
              active={props.reactions?.get(entry)?.has(props.userId!)}
              users={props.reactions?.get(entry)}
              onViewReactions={props.onViewReactions}
              addReaction={props.addReaction}
              removeReaction={props.removeReaction}
            />
          )}
        </For>
        <Show when={hasReactions(true)}>
          <Divider />
        </Show>
        <For each={lists().optional}>
          {(entry) => (
            <Reaction
              reaction={entry}
              active={props.reactions?.get(entry)?.has(props.userId!)}
              users={props.reactions?.get(entry)}
              onViewReactions={props.onViewReactions}
              addReaction={props.addReaction}
              removeReaction={props.removeReaction}
            />
          )}
        </For>
        <CompositionMediaPicker
          onMessage={props.sendGIF}
          onTextReplacement={(emoji) =>
            props.addReaction(
              emoji.startsWith(":")
                ? emoji.slice(1, emoji.length - 1)
                : startsWithPackPUA(emoji)
                  ? emoji.slice(1)
                  : emoji,
            )
          }
        >
          {(triggerProps) => (
            <div ref={triggerProps.ref} onClick={triggerProps.onClickEmoji}>
              <AddReaction
                class="add"
                // Hidden until the row is hovered, but a finger cannot hover,
                // so on touch it is always shown.
                style={{ opacity: isFinePointer() ? undefined : 1 }}
              >
                <Ripple />
                <MdAdd />
              </AddReaction>
            </div>
          )}
        </CompositionMediaPicker>
      </List>
    </Show>
  );
}

/**
 * Render the reaction
 */
function Reaction(props: {
  reaction: string;
  active?: boolean;
  users?: Set<string>;
  onViewReactions?(reaction: string): void;
  addReaction(id: string): void;
  removeReaction(id: string): void;
}) {
  const { t } = useLingui();
  const users = useUsers(() => [...(props.users?.values() ?? [])]);

  // Long-press on a touch screen opens the reactions window (hover tooltips
  // do not exist there). Android also fires `contextmenu` at about the same
  // moment, so remember when we last opened it to avoid doing it twice.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressStart: [number, number] = [0, 0];
  let openedAt = 0;

  function openWindow() {
    openedAt = Date.now();
    props.onViewReactions?.(props.reaction);
  }

  function cancelPress() {
    clearTimeout(pressTimer);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" || !props.onViewReactions) return;
    e.stopPropagation(); // keep the message's own long-press menu out of it
    pressStart = [e.clientX, e.clientY];
    clearTimeout(pressTimer);
    pressTimer = setTimeout(openWindow, 500);
  }

  function onPointerMove(e: PointerEvent) {
    if (Math.hypot(e.clientX - pressStart[0], e.clientY - pressStart[1]) > 10) {
      cancelPress();
    }
  }

  function onContextMenu(e: MouseEvent) {
    if (!props.onViewReactions) return;
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - openedAt > 1000) openWindow();
  }

  /**
   * Handle toggling reaction
   */
  function onClick() {
    // The lift after a long-press must not also toggle the reaction
    if (Date.now() - openedAt < 1000) return;

    if (props.active) {
      props.removeReaction(props.reaction);
    } else {
      props.addReaction(props.reaction);
    }
  }

  /**
   * Generate list of users
   */
  const peopleList = () => {
    const total = props.users?.size ?? 0;
    const names = users()
      .filter((user) => user)
      .slice(0, 3)
      .map((user) => user?.username);

    // Everyone who reacted but is not named above (not loaded yet, or
    // beyond the first three), so the count always adds up to the number
    // on the button.
    const others = Math.max(0, total - names.length);
    const list = names.join(", ");

    if (!names.length) {
      return others === 1 ? t`1 person reacted` : t`${others} reacted`;
    }
    if (others === 0) return t`${list} reacted`;
    if (others === 1) return t`${list} and 1 other reacted`;
    return t`${list} and ${others} others reacted`;
  };

  return (
    <Tooltip
      placement="top"
      content={() => (
        <Row align gap="lg">
          <span style={{ "--emoji-size": "3em" }}>
            <Emoji emoji={props.reaction} />
          </span>
          <Text class="_messages">
            <PeopleList>{peopleList()}</PeopleList>
          </Text>
        </Row>
      )}
      aria={peopleList()}
    >
      <ReactionBase
        active={props.active}
        onClick={onClick}
        // Native (on:) listeners, so they run before the message's own
        // right-click / long-press menu and can claim the gesture for the
        // reactions window instead of letting the message menu open.
        on:contextmenu={onContextMenu}
        on:pointerdown={onPointerDown}
        on:pointermove={onPointerMove}
        on:pointerup={cancelPress}
        on:pointercancel={cancelPress}
      >
        <Ripple />
        <Emoji emoji={props.reaction} /> {props.users?.size || 0}
      </ReactionBase>
    </Tooltip>
  );
}

/**
 * Reaction styling
 */
const ReactionBase = styled("div", {
  base: {
    // for <Ripple />
    position: "relative",

    display: "flex",
    overflow: "hidden",
    flexDirection: "row",
    gap: "var(--gap-md)",
    cursor: "pointer",
    userSelect: "none",
    verticalAlign: "middle",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",

    transition: "var(--transitions-fast) all",
    fontWeight: 600,
    fontFeatureSettings: "'tnum' 1",

    "& img": {
      width: "1.2em",
      height: "1.2em",
      objectFit: "contain",
    },
  },
  variants: {
    active: {
      true: {
        color: "var(--md-sys-color-on-secondary-container)",
        background: "var(--md-sys-color-secondary-container)",
      },
      false: {
        color: "var(--md-sys-color-on-surface)",
        background: "var(--md-sys-color-surface-container-low)",
      },
    },
  },
  defaultVariants: {
    active: false,
  },
});

/**
 * Add reaction button styling
 */
const AddReaction = styled(ReactionBase, {
  base: {
    // for <Ripple />
    position: "relative",

    opacity: 0,
    justifyContent: "center",
    fontSize: "var(--emoji-size)",
    background: "var(--md-sys-color-surface-bright)",
    height: "33px",
    aspectRatio: "1/1",
    padding: "var(--gap-sm)",

    // The plus icon has no fill of its own, so it drew black: nearly
    // invisible on the dark button. Follow the text colour instead.
    "& svg": {
      fill: "currentColor",
    },
  },
});

/**
 * List divider
 */
const Divider = styled("div", {
  base: {
    width: "1px",
    height: "14px",
    background: "var(--md-sys-color-outline-variant)",
  },
});

/**
 * Base component for the reactions list
 */
const List = styled("div", {
  base: {
    width: "100%",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--gap-sm)",
    "&:hover .add": {
      opacity: 1,
    },
  },
});

/**
 * List of people who have reacted
 */
const PeopleList = styled("span", {
  base: {
    lineClamp: 4,
    maxWidth: "280px",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    textOverflow: "ellipsis",
  },
});
