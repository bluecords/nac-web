import { EditorView } from "@codemirror/view";

/**
 * Formatting actions the toolbar can request. NAC messages are markdown, so a
 * "bold" button just wraps the selection in `**` - there is no rich-text model.
 */
export type FormatKind =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "spoiler"
  | "quote"
  | "bulletList"
  | "link";

/** Inline formats: wrap the selection, toggle off if already wrapped. */
const WRAP: Partial<Record<FormatKind, string>> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
  spoiler: "||",
};

/** Line formats: prefix each selected line, toggle off if every line has it. */
const LINE_PREFIX: Partial<Record<FormatKind, string>> = {
  quote: "> ",
  bulletList: "- ",
};

/**
 * Apply a markdown formatting action to the current selection of a CodeMirror
 * view, then re-focus. Mirrors how Discord's toolbar behaves: with a selection
 * it wraps/prefixes (and un-wraps if already applied); with no selection it
 * inserts the markers and drops the cursor where you'd type.
 */
export function applyMarkdownFormat(view: EditorView, kind: FormatKind): void {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);

  if (kind === "link") {
    const insert = selected ? `[${selected}](url)` : `[text](url)`;
    // Drop the cursor onto "url" so it is the first thing you replace.
    const urlStart = range.from + insert.lastIndexOf("(url)") + 1;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: urlStart, head: urlStart + 3 },
    });
    view.focus();
    return;
  }

  const marker = WRAP[kind];
  if (marker) {
    const before = state.sliceDoc(
      Math.max(0, range.from - marker.length),
      range.from,
    );
    const after = state.sliceDoc(
      range.to,
      Math.min(state.doc.length, range.to + marker.length),
    );

    // Already wrapped just outside the selection -> unwrap.
    if (before === marker && after === marker) {
      view.dispatch({
        changes: [
          { from: range.from - marker.length, to: range.from, insert: "" },
          { from: range.to, to: range.to + marker.length, insert: "" },
        ],
        selection: {
          anchor: range.from - marker.length,
          head: range.to - marker.length,
        },
      });
      view.focus();
      return;
    }

    // Selection itself is `**text**` -> unwrap.
    if (
      selected.length >= marker.length * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker)
    ) {
      const inner = selected.slice(marker.length, -marker.length);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: inner },
        selection: { anchor: range.from, head: range.from + inner.length },
      });
      view.focus();
      return;
    }

    view.dispatch({
      changes: {
        from: range.from,
        to: range.to,
        insert: marker + selected + marker,
      },
      selection: selected
        ? {
            anchor: range.from + marker.length,
            head: range.to + marker.length,
          }
        : {
            anchor: range.from + marker.length,
          },
    });
    view.focus();
    return;
  }

  const prefix = LINE_PREFIX[kind];
  if (prefix) {
    const firstLine = state.doc.lineAt(range.from);
    const lastLine = state.doc.lineAt(range.to);
    const lines = [];
    for (let n = firstLine.number; n <= lastLine.number; n++) {
      lines.push(state.doc.line(n));
    }
    const allPrefixed = lines.every((l) => l.text.startsWith(prefix));
    const changes = lines.map((l) =>
      allPrefixed
        ? { from: l.from, to: l.from + prefix.length, insert: "" }
        : { from: l.from, to: l.from, insert: prefix },
    );
    view.dispatch({ changes });
    view.focus();
  }
}
