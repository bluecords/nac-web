import { JSXElement, Match, Suspense, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import { Button, Checkbox, CircularProgress, Text, iconSize } from "@revolt/ui";

import MdWarning from "@material-design-icons/svg/round/warning.svg?component-solid";

/**
 * Age gate filter for any content
 *
 * NOTE: do not reintroduce a geo-IP lookup here. This component previously
 * called `https://geo.revolt.chat` on every render to decide region blocking.
 * AgeGate wraps every text and forum channel, and the query had no `enabled`
 * guard, so it fired on every channel open even though the branch that used it
 * was disabled -- sending every member's IP to upstream Revolt's infrastructure.
 * NAC does not call out to anything it does not own. If region logic is ever
 * needed, resolve it server-side on our own box.
 */
export function AgeGate(props: {
  enabled: boolean;
  contentId: string;
  contentName: string;
  contentType: "channel";
  children: JSXElement;
}) {
  const state = useState();

  const confirmed = () =>
    state.layout.getSectionState(LAYOUT_SECTIONS.MATURE, false);
  const allowed = () =>
    state.layout.getSectionState(props.contentId + "-nsfw", false);

  return (
    <Suspense fallback={<CircularProgress />}>
      <Switch fallback={props.children}>
        <Match when={false && props.enabled && (!confirmed() || !allowed())}>
          <Base>
            <MdWarning {...iconSize("8em")} />
            <Text class="headline" size="large">
              {props.contentName}
            </Text>

            <Text class="body" size="large">
              <Trans>This channel is marked as mature.</Trans>
            </Text>

            <Confirmation>
              <Checkbox
                checked={state.layout.getSectionState(
                  LAYOUT_SECTIONS.MATURE,
                  false,
                )}
                onChange={() =>
                  state.layout.toggleSectionState(LAYOUT_SECTIONS.MATURE, false)
                }
              />
              <Text class="body" size="large">
                <Trans>I confirm that I am at least 18 years old.</Trans>
              </Text>
            </Confirmation>

            <Actions>
              <Button variant="text" onPress={() => history.back()}>
                <Trans>Back</Trans>
              </Button>
              <Button
                variant="filled"
                onPress={() =>
                  confirmed() &&
                  state.layout.setSectionState(props.contentId + "-nsfw", true)
                }
              >
                <Trans>Enter Channel</Trans>
              </Button>
            </Actions>
          </Base>
        </Match>
      </Switch>
    </Suspense>
  );
}

const Base = styled("div", {
  base: {
    height: "100%",

    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--gap-lg)",
    userSelect: "none",
    overflowY: "auto",
    color: "var(--md-sys-color-on-surface)",

    "& svg": {
      // TODO
      fill: "orange",
    },

    gap: "var(--gap-md)",
  },
});

const Confirmation = styled("label", {
  base: {
    display: "flex",
    gap: "var(--gap-sm)",
    alignItems: "center",
  },
});

const Actions = styled("div", {
  base: {
    display: "flex",
    marginTop: "var(--gap-lg)",
    gap: "var(--gap-lg)",
  },
});
