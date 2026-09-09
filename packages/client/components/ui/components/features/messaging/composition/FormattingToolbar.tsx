import { For } from "solid-js";

import { styled } from "styled-system/jsx";

import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { FormatKind } from "../../texteditor/markdownFormatting";

/**
 * Markdown formatting toolbar for the composer.
 *
 * NAC messages are markdown - there is no rich-text model - so every button
 * just wraps or prefixes the selection with the matching markers. It exists
 * because typed markdown (`**bold**`) is not discoverable: most members do not
 * know it, so their text reads as plain and a little ugly.
 */
const BUTTONS: {
  kind: FormatKind;
  symbol: string;
  label: string;
}[] = [
  { kind: "bold", symbol: "format_bold", label: "Bold" },
  { kind: "italic", symbol: "format_italic", label: "Italic" },
  { kind: "strikethrough", symbol: "strikethrough_s", label: "Strikethrough" },
  { kind: "code", symbol: "code", label: "Code" },
  { kind: "spoiler", symbol: "visibility_off", label: "Spoiler" },
  { kind: "quote", symbol: "format_quote", label: "Quote" },
  { kind: "bulletList", symbol: "format_list_bulleted", label: "List" },
  { kind: "link", symbol: "link", label: "Link" },
];

export function FormattingToolbar(props: {
  onFormat: (kind: FormatKind) => void;
}) {
  return (
    <Bar>
      <For each={BUTTONS}>
        {(button) => (
          <ToolButton
            type="button"
            title={button.label}
            aria-label={button.label}
            // Keep the editor's selection: buttons must not steal focus.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.onFormat(button.kind)}
          >
            <Symbol>{button.symbol}</Symbol>
          </ToolButton>
        )}
      </For>
    </Bar>
  );
}

const Bar = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    flexWrap: "wrap",
  },
});

const ToolButton = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    padding: 0,
    border: "none",
    borderRadius: "var(--borderRadius-sm)",
    cursor: "pointer",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    "& span": {
      fontSize: "20px",
    },
    "&:hover": {
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-on-surface)",
    },
  },
});
