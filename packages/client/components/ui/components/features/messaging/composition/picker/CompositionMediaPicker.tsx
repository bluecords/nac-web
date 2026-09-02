import { useFloating } from "solid-floating-ui";
import {
  Accessor,
  JSX,
  Match,
  Ref,
  Setter,
  Show,
  Switch,
  createContext,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";

import { flip, offset, shift } from "@floating-ui/dom";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import MdClose from "@material-symbols/svg-400/outlined/close.svg?component-solid";

import { Button } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";
import { symbolSize } from "@revolt/ui/components/utils";

import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";

interface Props {
  /**
   * User card trigger area
   * @param triggerProps Props that need to be applied to the trigger area
   */
  children: (triggerProps: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref: Ref<any>;
    onClickGif: () => void;
    onClickEmoji: () => void;
  }) => JSX.Element;

  /**
   * Send a message
   */
  onMessage: (content: string) => void;

  /**
   * Text replacement
   */
  onTextReplacement: (node: string) => void;
}

export const CompositionMediaPickerContext = createContext(
  null as unknown as Pick<Props, "onMessage" | "onTextReplacement"> & {
    /**
     * Close the picker.
     *
     * Selecting a GIF sends it and leaves nothing more to do in the picker, so
     * it closes itself. Previously it stayed open, and on a phone it covers the
     * whole screen - so there was no "outside" left to tap and the outside-click
     * dismiss below could not be reached. See the close button in Picker.
     */
    close: () => void;
  },
);

export function CompositionMediaPicker(props: Props) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const [show, setShow] = createSignal<"gif" | "emoji">();

  return (
    <CompositionMediaPickerContext.Provider
      // Not a spread of `props`: spreading would read each value once here and
      // break reactivity. These forward to props at call time instead.
      value={{
        onMessage: (content) => props.onMessage(content),
        onTextReplacement: (node) => props.onTextReplacement(node),
        close: () => setShow(undefined),
      }}
    >
      {props.children({
        ref: setAnchor,
        onClickGif: () =>
          setShow((current) => (current === "gif" ? undefined : "gif")),
        onClickEmoji: () =>
          setShow((current) => (current === "emoji" ? undefined : "emoji")),
      })}
      <Portal mount={document.getElementById("floating")!}>
        <Presence>
          <Show when={show()}>
            <Motion
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, easing: [0.87, 0, 0.13, 1] }}
            >
              <Picker
                anchor={anchor}
                show={show}
                setShow={setShow}
                onMessage={props.onMessage}
                onTextReplacement={props.onTextReplacement}
              />
            </Motion>
          </Show>
        </Presence>
      </Portal>
    </CompositionMediaPickerContext.Provider>
  );
}

function Picker(
  props: Pick<Props, "onMessage" | "onTextReplacement"> & {
    anchor: Accessor<HTMLElement | undefined>;
    show: Accessor<"gif" | "emoji" | undefined>;
    setShow: Setter<"gif" | "emoji" | undefined>;
  },
) {
  const [floating, setFloating] = createSignal<HTMLDivElement>();

  const position = useFloating(() => props.anchor(), floating, {
    placement: "top-end",
    middleware: [offset(5), flip(), shift()],
  });

  function onDismiss(e: Event) {
    if (floating()?.contains(e.target as Node)) return;
    props.setShow();
  }

  // The picker can cover the entire viewport on a phone, which leaves no
  // "outside" for onDismiss to catch. Escape is the keyboard equivalent of the
  // close button, for the same reason.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      props.setShow();
    }
  }

  onMount(() => {
    document.addEventListener("mousedown", onDismiss);
    document.addEventListener("touchstart", onDismiss, { passive: true });
    document.addEventListener("keydown", onKeyDown);
  });
  onCleanup(() => {
    document.removeEventListener("mousedown", onDismiss);
    document.removeEventListener("touchstart", onDismiss);
    document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <Base
      ref={setFloating}
      style={{
        position: position.strategy,
        top: `${position.y ?? 0}px`,
        left: `${position.x ?? 0}px`,
      }}
    >
      <Container>
        <Row justify class="CompositionButton">
          <Button
            groupActive={props.show() === "gif"}
            onPress={() => props.setShow("gif")}
            group="connected-start"
          >
            GIFs
          </Button>
          <Button
            groupActive={props.show() === "emoji"}
            onPress={() => props.setShow("emoji")}
            group="connected-end"
          >
            Emoji
          </Button>

          {/*
            Always-visible escape hatch. The outside-click dismiss above is
            unreachable when the picker fills the screen, which is exactly the
            case on a phone.
          */}
          <CloseButton
            type="button"
            aria-label="Close"
            onClick={() => props.setShow()}
          >
            <MdClose {...symbolSize(20)} />
          </CloseButton>
        </Row>

        <Switch fallback={<span>Not available yet.</span>}>
          <Match when={props.show() === "gif"}>
            <GifPicker />
          </Match>
          <Match when={props.show() === "emoji"}>
            <EmojiPicker />
          </Match>
        </Switch>
      </Container>
    </Base>
  );
}

/**
 * Base element
 */
const Base = styled("div", {
  base: {
    width: "min(400px, 96vw)",
    height: "min(500px, 75vh)",
    // paddingInlineEnd: "5px",
  },
});

/**
 * Dismiss control for the picker.
 *
 * Sits beside the GIFs/Emoji buttons rather than floating over the grid, so it
 * never covers a GIF and never moves as results load.
 */
const CloseButton = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,

    marginInlineStart: "auto",
    width: "32px",
    height: "32px",

    cursor: "pointer",
    border: "none",
    borderRadius: "var(--borderRadius-md)",
    background: "transparent",
    color: "var(--colours-foreground)",

    _hover: { background: "var(--colours-component-hover)" },
    _focusVisible: { outline: "2px solid var(--colours-foreground)" },
  },
});

/**
 * Container element for the picker
 */
const Container = styled("div", {
  base: {
    width: "100%",
    height: "100%",

    userSelect: "none",

    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",

    alignItems: "stretch",

    overflow: "hidden",
    padding: "var(--gap-md) 0",

    borderRadius: "var(--borderRadius-lg)",
    color: "var(--md-sys-color-on-surface)",
    fill: "var(--md-sys-color-on-surface)",
    boxShadow: "0 0 3px var(--md-sys-color-shadow)",
    background: "var(--md-sys-color-surface-container)",
  },
});

/**
 * Styles for the content container
 */
export const compositionContent = cva({
  base: {
    flexGrow: 1,
    minHeight: 0,
  },
});
