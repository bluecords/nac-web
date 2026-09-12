import { Plural } from "@lingui-solid/solid/macro";
import { Show } from "solid-js";
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
}

/**
 * Generic message divider
 */
export function BlockedMessage(props: Props) {
  return (
    <Base>
      <Ripple />
      <MdClose {...iconSize(16)} />{" "}
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
    </Base>
  );
}
