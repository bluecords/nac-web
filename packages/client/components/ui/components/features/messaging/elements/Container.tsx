import {
  JSX,
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
} from "solid-js";

import { useLingui } from "@lingui-solid/solid/macro";
import { Message } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { Ripple, typography } from "@revolt/ui/components/design";
import { Column, Row } from "@revolt/ui/components/layout";
import {
  NonBreakingText,
  OverflowingText,
  Time,
} from "@revolt/ui/components/utils";

import { MessageToolbar } from "./MessageToolbar";

interface CommonProps {
  /**
   * Whether this is the tail of another message
   */
  tail?: boolean;

  /**
   * Whether to move the username and related to the left
   *
   * If you want to hide it completely, add a <Match when={true} /> to infoMatch
   */
  compact?: boolean;

  /**
   * Whether this message should be treated as a link
   */
  isLink?: boolean | "hide";
}

type Props = CommonProps & {
  message?: Message;

  /**
   * Avatar URL
   */
  avatar: JSX.Element;

  /**
   * Username element
   */
  username: JSX.Element;

  /**
   * Message content
   */
  children: JSX.Element;

  /**
   * Message header
   */
  header?: JSX.Element;

  /**
   * Message info line
   */
  info?: JSX.Element;

  /**
   * Timestamp message was sent at
   */
  timestamp: Date | JSX.Element;

  /**
   * Date message was edited at
   */
  edited?: Date;

  /**
   * Whether this message mentions the user
   */
  mentioned?: boolean;

  /**
   * Whether this message should be highlighted
   */
  highlight?: boolean;

  /**
   * Whether this message is being edited
   */
  editing?: boolean;

  /**
   * Send status of this message
   */
  sendStatus?: "sending" | "failed";

  /**
   * Whether we are hovering this message
   */
  onHover?: (hovering: boolean) => void;

  /**
   * Component to render message context menu
   */
  contextMenu?: () => JSX.Element;

  /**
   * Additional match cases for the inline-start information element
   */
  infoMatch?: JSX.Element;

  /**
   * Reference time to render timestamps from
   */
  _referenceTime?: number;
};

/**
 * Message container layout
 */
const base = cva({
  base: {
    position: "relative",

    display: "flex",
    flexDirection: "column",

    padding: "2px 0",
    background: "transparent",
    borderRadius: "var(--borderRadius-md)",
    minHeight: "1em",

    transition: "background-color var(--transitions-fast)",

    "& a:hover": {
      textDecoration: "underline",
    },

    // Desktop only. Touch must NOT inherit this: touch browsers grant
    // :hover the instant a finger rests - no dwell, no movement check -
    // and then leave it applied, so a pausing thumb summoned the
    // reply/react/delete strip and left it one stray tap from the bin.
    _hoverable: {
      "&:hover .Toolbar": {
        display: "flex",
      },
    },

    // Touch gets it from a deliberate dwell instead, set by the pointer
    // handlers on this component. Three distinct gestures:
    //   scroll      movement > 8px       -> nothing
    //   short press held still 220ms     -> toolbar (this rule)
    //   long press  held still 500ms     -> context menu
    _touch: {
      '&[data-touch-dwell="1"] .Toolbar': {
        display: "flex",
      },
    },
  },
  variants: {
    tail: {
      true: {
        marginTop: 0,
      },
    },
    mentioned: {
      true: {
        background: "var(--md-sys-color-primary-container)",
      },
    },
    highlight: {
      true: {
        animation: "highlightMessage 3s",
      },
    },
    sendStatus: {
      failed: {
        color: "var(--md-sys-color-error)",
      },
      sending: {
        color: "var(--md-sys-color-outline)",
      },
      sent: {
        color: "var(--md-sys-color-on-surface)",
      },
    },
    isLink: {
      true: {
        cursor: "pointer",
        userSelect: "none",
        position: "relative",

        "& *": {
          pointerEvents: "none",
        },
      },
      false: {
        marginTop: "var(--message-group-spacing) !important",

        "&:hover": {
          background: "var(--md-sys-color-surface-container)",
        },
      },
      hide: {},
    },
  },
  defaultVariants: {
    isLink: false,
    sendStatus: "sent",
  },
});

/**
 * Left-side information or avatar
 */
const Info = styled("div", {
  base: {
    display: "flex",
    flexShrink: 0,
    justifyContent: "end",
    padding: "2px var(--gap-sm)",
  },
  variants: {
    tail: {
      true: {
        padding: 0,
      },
    },
    compact: {
      true: {},
      false: {
        width: "54px",
      },
    },
  },
  defaultVariants: {
    compact: false,
  },
});

/**
 * Right-side message content
 */
const Body = styled("div", {
  base: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",

    minWidth: 0,
    overflow: "hidden",
    paddingInlineEnd: "var(--gap-lg)",
  },
  variants: {
    editing: {
      true: {
        flexGrow: 1,
      },
    },
  },
});

const Content = styled("div", {
  base: {
    minWidth: 0,
    display: "flex",
    gap: "var(--gap-sm)",
    flexDirection: "column",

    ...typography.raw({ class: "_messages" }),
  },
});

/**
 * Information text
 */
const infoText = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",

    color: "var(--md-sys-color-outline)",

    ...typography.raw({ class: "body", size: "small" }),
  },
  variants: {
    prefix: {
      true: {
        width: "calc(7ch * var(--gap-sm))",
        fontSize: "0.7em",

        display: "block",
        textAlign: "right",
        marginTop: "0.15em",
      },
    },
    hidden: {
      true: {
        opacity: 0,
        transition: "var(--transitions-fast) opacity",

        _groupHover: {
          opacity: 1,
        },
      },
    },
  },
});

/**
 * Additional styles for compact mode
 */
const CompactInfo = styled(Row, {
  base: {
    flexShrink: 0,
    marginTop: "-2px",
    height: "fit-content",
    paddingInline: "var(--gap-lg) 0",
  },
});

/**
 * Component to show avatar, username, timestamp and content
 */
export function MessageContainer(props: Props) {
  const { t } = useLingui();

  // Touch only. Distinguishes "thumb resting here on purpose" from "thumb
  // passing through on the way down the page". The _touch condition in the
  // `base` recipe above keys the toolbar to this attribute; _hoverable keeps
  // the mouse path on :hover. One system, both rules in this file.
  //
  // 220ms is deliberately well under the 500ms long-press that opens the
  // context menu, so a short press still feels immediate, and well over the
  // "fraction of a second" a scrolling thumb rests for.
  const TOUCH_DWELL_MS = 220;
  const TOUCH_MOVE_TOLERANCE = 8; // same threshold the long-press uses

  const [touchDwell, setTouchDwell] = createSignal(false);
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let dwellX = 0;
  let dwellY = 0;

  function cancelDwell() {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }

  function onTouchStart(e: PointerEvent) {
    if (e.pointerType !== "touch") return;

    // The toolbar is a CHILD of this container, so a tap on one of its buttons
    // bubbles up here. Without this guard the handler below immediately set
    // touchDwell false, the toolbar went display:none mid-gesture, and the tap
    // landed on nothing - the buttons were unclickable on touch. Regression
    // reported by Bunjie within minutes of the dwell change shipping.
    if ((e.target as HTMLElement | null)?.closest?.(".Toolbar")) return;

    dwellX = e.clientX;
    dwellY = e.clientY;
    cancelDwell();
    // A new touch anywhere on a message dismisses the previous reveal, so the
    // strip cannot linger the way sticky :hover did.
    setTouchDwell(false);
    dwellTimer = setTimeout(() => setTouchDwell(true), TOUCH_DWELL_MS);
  }

  function onTouchMove(e: PointerEvent) {
    if (e.pointerType !== "touch" || !dwellTimer) return;
    // Same reason as above: dragging a finger across the toolbar must not
    // cancel a dwell that is keeping that toolbar on screen.
    if ((e.target as HTMLElement | null)?.closest?.(".Toolbar")) return;
    if (
      Math.abs(e.clientX - dwellX) > TOUCH_MOVE_TOLERANCE ||
      Math.abs(e.clientY - dwellY) > TOUCH_MOVE_TOLERANCE
    ) {
      cancelDwell(); // this is a scroll, not a press
    }
  }

  onCleanup(cancelDwell);

  return (
    <div
      id={props.message?.id}
      data-touch-dwell={touchDwell() ? "1" : undefined}
      onPointerDown={onTouchStart}
      onPointerMove={onTouchMove}
      onPointerCancel={cancelDwell}
      onMouseEnter={() => props.onHover && props.onHover(true)}
      onMouseLeave={() => props.onHover && props.onHover(false)}
      class={
        "group " +
        base({
          tail: props.tail,
          mentioned: props.mentioned,
          highlight: props.highlight,
          sendStatus: props.sendStatus,
          isLink: props.isLink,
        })
      }
      use:floating={{ contextMenu: props.contextMenu }}
    >
      <Show
        when={props.message && props.isLink !== true && props.isLink !== "hide"}
      >
        <MessageToolbar message={props.message} />
      </Show>

      <Show when={props.isLink}>
        <Ripple />
      </Show>

      {props.header}
      <Row>
        <Info tail={props.tail} compact={props.compact}>
          <Switch fallback={props.avatar}>
            {props.infoMatch ?? <Match when={false} children={null} />}
            <Match when={props.compact}>
              <CompactInfo gap="sm" align>
                <div
                  class={infoText()}
                  use:floating={{
                    tooltip: {
                      placement: "top",
                      content: (
                        <>
                          {t`Sent`}{" "}
                          <Time
                            format="datetime"
                            value={props.timestamp}
                            referenceTime={props._referenceTime}
                          />
                        </>
                      ) as string, // ignore aria requirement
                    },
                  }}
                >
                  <Time
                    format="time"
                    value={props.timestamp}
                    referenceTime={props._referenceTime}
                  />
                </div>
                {props.username}
                {props.info}
              </CompactInfo>
            </Match>
            <Match when={props.tail}>
              <div
                class={infoText({ hidden: !props.edited, prefix: true })}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: (
                      <Column>
                        <span>
                          {t`Sent`}{" "}
                          <Time
                            format="datetime"
                            value={props.timestamp}
                            referenceTime={props._referenceTime}
                          />
                        </span>
                        <Show when={props.edited}>
                          <span>
                            {t`Edited`}{" "}
                            <Time
                              format="datetime"
                              value={props.edited}
                              referenceTime={props._referenceTime}
                            />
                          </span>
                        </Show>
                      </Column>
                    ) as string, // ignore aria requirement
                  },
                }}
              >
                <Show when={props.edited}>(edited)</Show>
                <Show when={!props.edited}>
                  <Time
                    value={props.timestamp}
                    format="time"
                    referenceTime={props._referenceTime}
                  />
                </Show>
              </div>
            </Match>
          </Switch>
        </Info>
        <Body editing={props.editing}>
          <Show when={!props.tail && !props.compact}>
            <Row gap="sm" align>
              <OverflowingText>{props.username}</OverflowingText>
              <NonBreakingText>
                <div class={infoText()}>
                  {props.info}
                  <Switch fallback={props.timestamp as string}>
                    <Match when={props.timestamp instanceof Date}>
                      <span
                        use:floating={{
                          tooltip: {
                            placement: "top",
                            content: (
                              <>
                                {t`Sent`}{" "}
                                <Time
                                  format="datetime"
                                  value={props.timestamp}
                                  referenceTime={props._referenceTime}
                                />
                              </>
                            ) as string, // ignore aria requirement
                          },
                        }}
                      >
                        <Time
                          format="calendar"
                          value={props.timestamp}
                          referenceTime={props._referenceTime}
                        />
                      </span>
                    </Match>
                  </Switch>
                  <Show when={props.edited}>
                    <span
                      use:floating={{
                        tooltip: {
                          placement: "top",
                          content: (
                            <>
                              {t`Edited`}{" "}
                              <Time
                                format="datetime"
                                value={props.edited}
                                referenceTime={props._referenceTime}
                              />
                            </>
                          ) as string, // ignore aria requirement
                        },
                      }}
                    >
                      (edited)
                    </span>
                  </Show>
                </div>
              </NonBreakingText>
            </Row>
          </Show>
          <Content>{props.children}</Content>
        </Body>
      </Row>
    </div>
  );
}
