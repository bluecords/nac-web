import { Accessor, JSX, Show } from "solid-js";

import { css, cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { Breadcrumbs, IconButton, Text } from "@revolt/ui";

import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";

import { SettingsList } from "..";
import { useSettingsNavigation } from "../Settings";

/**
 * Content portion of the settings menu
 */
export function SettingsContent(props: {
  onClose?: () => void;
  children: JSX.Element;
  list: Accessor<SettingsList<unknown>>;
  title: (ctx: SettingsList<never>, key: string) => string;
  page: Accessor<string | undefined>;
}) {
  const { navigate } = useSettingsNavigation();

  // The members table is the one settings page that's fundamentally a wide
  // data grid - everything else here is a form/list that reads fine at the
  // default width. Widened only for it rather than raising the cap globally,
  // since the other pages were never asked for and haven't been checked at
  // a wider measure.
  const wide = () => props.page() === "members";

  return (
    <div
      use:scrollable={{
        class: base(),
      }}
    >
      <Show when={props.page()}>
        <InnerContent wide={wide()}>
          <InnerColumn>
            <Text class="title" size="large">
              <Breadcrumbs
                elements={props.page()!.split("/")}
                renderElement={(key) =>
                  props.title(props.list() as SettingsList<never>, key)
                }
                navigate={(keys) => navigate(keys.join("/"))}
              />
            </Text>
            {props.children}
            <div class={css({ minHeight: "80px" })} />
          </InnerColumn>
        </InnerContent>
      </Show>
      <Show when={props.onClose}>
        <CloseAction>
          <IconButton variant="tonal" onPress={props.onClose}>
            <MdClose />
          </IconButton>
        </CloseAction>
      </Show>
    </div>
  );
}

/**
 * Base styles
 */
const base = cva({
  base: {
    minWidth: 0,
    flex: "1 1 800px",
    flexDirection: "row",
    display: "flex",
    background: "var(--md-sys-color-surface-container-low)",
    borderStartStartRadius: "30px",
    borderEndStartRadius: "30px",

    "& > a": {
      textDecoration: "none",
    },
  },
});

/**
 * Settings pane
 *
 * `flexGrow: 1` so this is the element that claims the width freed up by
 * trimming the sidebar and `CloseAction` below off their old `flexGrow: 1`
 * - previously two unbounded gutters either side of a hard-capped 740px
 * column ate roughly a quarter of the window on a normal desktop width
 * with nothing rendered in either of them but a menu and one button.
 */
const InnerContent = styled("div", {
  base: {
    gap: "13px",
    minWidth: 0,
    width: "100%",
    display: "flex",
    flexGrow: 1,
    padding: "80px 32px",
    justifyContent: "stretch",
    zIndex: 1,
  },
  variants: {
    wide: {
      true: { maxWidth: "1200px" },
      false: { maxWidth: "740px" },
    },
  },
  defaultVariants: {
    wide: false,
  },
});

/**
 * Pane content column
 */
const InnerColumn = styled("div", {
  base: {
    width: "100%",
    gap: "var(--gap-md)",
    display: "flex",
    flexDirection: "column",
    marginBlockEnd: "80px",
  },
});

/**
 * Positioning for close button
 *
 * Was `flexGrow: 1` with nothing else in this column to fill - on a wide
 * window that grew into hundreds of pixels of dead space just to center one
 * button. Sized to its own content now; `InnerContent` above claims the
 * width this frees.
 */
const CloseAction = styled("div", {
  base: {
    flexShrink: 0,
    padding: "80px 8px",
    visibility: "visible",
    position: "sticky",
    top: 0,

    "&:after": {
      content: '"ESC"',
      marginTop: "4px",
      display: "flex",
      justifyContent: "center",
      width: "36px",
      fontWeight: 600,
      color: "var(--md-sys-color-on-surface)",
      fontSize: "0.75rem",
    },
  },
});
