import { Plural, Trans } from "@lingui-solid/solid/macro";
import { For, Show, createSignal } from "solid-js";
import { styled } from "styled-system/jsx";

import { iconSize } from "@revolt/ui/components/utils";

import MdClose from "@material-design-icons/svg/filled/close.svg?component-solid";

import { Ripple } from "../../../design";

/**
 * Base styles
 */
const Base = styled("div", {
  base: {
    position: "relative",

    display: "flex",
    alignItems: "center",

    gap: "var(--gap-s)",
    marginTop: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    padding: "var(--gap-sm) var(--gap-xxl)",

    fontSize: "0.8em" /* TODO should be in typography */,
    color: "var(--md-sys-color-outline)",
    fill: "var(--md-sys-color-outline)",
  },
});

const Tap = styled("button", {
  base: {
    all: "unset",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-s)",
    width: "100%",
  },
});

const Column = styled("div", {
  base: { display: "flex", flexDirection: "column", width: "100%" },
});

const Choices = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-md)",
    marginTop: "var(--gap-md)",
    marginLeft: "var(--gap-xxl)",
  },
});

const Choice = styled("button", {
  base: {
    all: "unset",
    cursor: "pointer",
    padding: "var(--gap-md) var(--gap-lg)",
    borderRadius: "var(--borderRadius-md)",
    border: "1px solid var(--md-sys-color-outline)",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "0.9em",
  },
});

interface Props {
  /**
   * Number of collapsed messages
   */
  count: number;
  /**
   * Whether these are from a blocked user (a real relationship) or an
   * ignored one (a purely client-local preference, no server relationship
   * at all) - the wording must not claim more than is true of each.
   */
  kind?: "blocked" | "ignored";
  /**
   * Who is behind the collapsed ignored messages. With `onUnignore`, the
   * strip becomes tappable and offers to stop ignoring each of them - the
   * hidden messages leave no other way to reach their profile menu.
   */
  authors?: { id: string; name: string }[];
  onUnignore?: (userId: string) => void;
}

/**
 * Generic message divider
 */
export function BlockedMessage(props: Props) {
  const [open, setOpen] = createSignal(false);
  const canUnignore = () =>
    props.kind === "ignored" && !!props.authors?.length && !!props.onUnignore;

  const label = () => (
    <Show
      when={props.kind === "ignored"}
      fallback={
        <Plural
          value={props.count}
          one="# blocked message"
          other="# blocked messages"
        />
      }
    >
      <Plural
        value={props.count}
        one="# ignored message"
        other="# ignored messages"
      />
    </Show>
  );

  return (
    <Base>
      <Ripple />
      <Show
        when={canUnignore()}
        fallback={
          <>
            <MdClose {...iconSize(16)} /> {label()}
          </>
        }
      >
        <Column>
          <Tap
            type="button"
            aria-expanded={open()}
            onClick={() => setOpen(!open())}
          >
            <MdClose {...iconSize(16)} /> {label()}
          </Tap>
          <Show when={open()}>
            <Choices>
              <For each={props.authors}>
                {(author) => (
                  <Choice
                    type="button"
                    onClick={() => props.onUnignore!(author.id)}
                  >
                    <Trans>Stop ignoring {author.name}</Trans>
                  </Choice>
                )}
              </For>
            </Choices>
          </Show>
        </Column>
      </Show>
    </Base>
  );
}
