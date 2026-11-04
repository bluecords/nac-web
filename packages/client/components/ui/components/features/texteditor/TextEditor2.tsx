import { Accessor, createEffect, on, onMount } from "solid-js";

import { defaultKeymap, history, insertNewline } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { css } from "styled-system/css";

import { diag } from "../../../../../src/diagnostics";
import { scrollableStyles } from "../../../directives/scrollable";
import { AutoCompleteSearchSpace } from "../../utils/autoComplete";

import { codeMirrorAutoComplete } from "./codeMirrorAutoComplete";
import { isInFencedCodeBlock } from "./codeMirrorCommon";
import { smartLineWrapping } from "./codeMirrorLineWrap";
import { markPlugins } from "./codeMirrorMarks";
import { markdownTheme } from "./codeMirrorTheme";
import { codeMirrorWidgets } from "./codeMirrorWidgets";
import { FormatKind, applyMarkdownFormat } from "./markdownFormatting";

interface Props {
  /**
   * Auto focus the input on creation
   */
  autoFocus?: boolean;

  /**
   * Placeholder to show when no text is shown
   */
  placeholder?: string;

  /**
   * Initial value to show in the text box
   */
  initialValue?: readonly [string];

  /**
   * Signal for sending a node replacement or focus request to the editor
   */
  nodeReplacement?: readonly [string | "_focus"];

  /**
   * Signal for a formatting-toolbar action. A fresh tuple each time (a nonce is
   * fine) so clicking the same button twice re-fires and toggles.
   */
  formatAction?: readonly [FormatKind, ...unknown[]];

  /**
   * Event is fired when the text content changes
   * @param value Text value
   */
  onChange: (value: string) => void;

  /**
   * Event is fired when user submits (Enter) content
   */
  onComplete?: () => void;

  /**
   * Event is fired when any keys are input
   */
  onTyping?: () => void;

  /**
   * Event is fired when 'previous context' is requested
   * i.e. edit the last message (given current is empty)
   */
  onPreviousContext?: () => void;

  /**
   * Auto complete search space
   */
  autoCompleteSearchSpace?: Accessor<AutoCompleteSearchSpace>;
}

const placeholderCompartment = new Compartment();

/**
 * Phones only: on the soft keyboards CodeMirror cannot rely on a key event for
 * Enter, so the extra Enter handling below is limited to them.
 */
const isPhoneKeyboard = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Two submits closer together than this are one Enter press that reached the
 * editor by more than one route (see `enterIntercepts`).
 */
const SAME_ENTER_MS = 350;

/**
 * Text editor powered by CodeMirror
 */
export function TextEditor2(props: Props) {
  const editorScrollbarClasses = scrollableStyles();

  const codeMirror = document.createElement("div");
  codeMirror.className = editor;

  /**
   * Submit (Enter). Every route Enter can take into the editor ends here, and
   * a repeat within SAME_ENTER_MS is the same key press arriving twice.
   * @param route How Enter reached the editor (diagnostics only)
   */
  let lastComplete = 0;
  function complete(route: string) {
    if (!props.onComplete) return;
    const now = Date.now();
    if (now - lastComplete < SAME_ENTER_MS) return;
    lastComplete = now;
    diag("composer-enter", route);
    props.onComplete();
  }

  /**
   * Handle 'Enter' key presses
   * Submit only if not currently in a code block
   */
  const enterKeymap = keymap.of([
    {
      key: "Enter",
      run: (view) => {
        if (!props.onComplete) return false;

        const cursor = view.state.selection.main;
        if (!isInFencedCodeBlock(view.state, cursor.from, cursor.to)) {
          complete("key");
          return true;
        } else {
          return false;
        }
      },
    },
  ]);

  /**
   * Enter on a phone keyboard, caught where the key handler cannot see it.
   *
   * On a desktop Enter is a key press and the keymap above handles it. A phone
   * keyboard may send Enter as a text edit instead, and CodeMirror only turns
   * that into a key press when the edit is a lone line break at the cursor; any
   * other shape is inserted as text, i.e. Enter adds a line break instead of
   * posting the message (member report, 2026-11-03). Two shapes are caught:
   *  - a `beforeinput` of type insertParagraph / insertLineBreak (Chrome sends
   *    the first, Safari the second);
   *  - one text edit that ends in the line break, e.g. the keyboard replaces
   *    the word being typed (autocorrect) and adds the Enter in a single change.
   * Both are Enter, so send. Shift is respected (a hardware keyboard's
   * Shift+Enter is still a line break) and so is a fenced code block.
   *
   * What was verified: SwiftKey and Samsung Keyboard on a real phone (Chrome),
   * Chrome's Pixel emulation, WebKit's iPhone emulation and desktop all send
   * once. The member's own failure was NOT reproduced (Gboard was not
   * available), and the text-edit shape was only simulated by firing the event.
   */
  let shiftHeld = false;
  const enterIntercepts = [
    EditorView.domEventHandlers({
      beforeinput: (event, view) => {
        if (!props.onComplete || !isPhoneKeyboard()) return false;
        if (
          event.inputType !== "insertParagraph" &&
          event.inputType !== "insertLineBreak"
        )
          return false;
        if (shiftHeld) return false;

        const cursor = view.state.selection.main;
        if (isInFencedCodeBlock(view.state, cursor.from, cursor.to))
          return false;

        event.preventDefault();
        complete("beforeinput " + event.inputType);
        return true;
      },
    }),
    // eslint-disable-next-line solid/reactivity
    EditorView.inputHandler.of((view, from, to, text) => {
      if (!props.onComplete || !isPhoneKeyboard()) return false;
      // exactly one line break, and it is the last thing typed
      if (!text.endsWith("\n") || text.indexOf("\n") !== text.length - 1)
        return false;
      if (isInFencedCodeBlock(view.state, from, to)) return false;

      // keep what was typed (e.g. the corrected word), drop the line break
      const typed = text.slice(0, -1);
      if (typed.length) {
        view.dispatch({
          changes: { from, to, insert: typed },
          selection: { anchor: from + typed.length },
          userEvent: "input.type",
        });
      }
      complete("text-change");
      return true;
    }),
  ];

  /**
   * Handle 'Shift-Enter' (insert a line break without sending).
   *
   * Without this, Shift-Enter falls through to defaultKeymap's
   * insertNewlineAndIndent, which copies/continues the previous line's
   * leading whitespace via the markdown language's indent service (its own
   * "continue blockquotes and lists that were active on the old line"
   * behaviour). Reported live in this session: a member manually indenting
   * paragraphs with leading spaces had each new line's auto-continued indent
   * stack on top of the spaces they typed themselves, drifting further right
   * every line - and if that ever reached 4 spaces, the paragraph silently
   * became a Markdown indented code block on send. A chat composer isn't a
   * code editor; Shift-Enter should just start a plain new line, matching
   * every other chat app.
   */
  const shiftEnterKeymap = keymap.of([
    {
      key: "Shift-Enter",
      run: insertNewline,
    },
  ]);

  /**
   * Handle 'ArrowUp' key presses
   */
  const arrowUpKeymap = keymap.of([
    {
      key: "ArrowUp",
      run: (view) => {
        if (view.state.doc.length > 0 || !props.onPreviousContext) return false;
        props.onPreviousContext();
        return true;
      },
    },
  ]);

  /**
   * CodeMirror instance
   */
  const view = new EditorView({
    parent: codeMirror,
    state: EditorState.create({
      doc: props.initialValue?.[0],
      extensions: [
        /* Enable browser spellchecking */
        EditorView.contentAttributes.of({ spellcheck: "true" }),

        /* Mobile keyboards default to lowercase without this - the first
           letter of a message/comment never got capitalised automatically. */
        EditorView.contentAttributes.of({ autocapitalize: "sentences" }),

        /* Mount keymaps */
        enterKeymap,
        shiftEnterKeymap,
        enterIntercepts,
        arrowUpKeymap,
        keymap.of(defaultKeymap as never), // required for atomic ranges to work: https://github.com/codemirror/dev/issues/923

        /* Enable history */
        history(),

        /* Use the bundled Markdown syntax */
        markdown({ base: markdownLanguage }),

        /* Linewrapping */
        smartLineWrapping,

        /* Placeholder */
        placeholderCompartment.of(
          // eslint-disable-next-line solid/reactivity
          props.placeholder ? placeholder(props.placeholder) : [],
        ),

        /* Autocomplete */
        // eslint-disable-next-line solid/reactivity
        codeMirrorAutoComplete(props.autoCompleteSearchSpace),

        /* Custom items */
        codeMirrorWidgets(),
        markPlugins,

        /* Widgets */
        markdownTheme,

        /* Handle change event */
        // eslint-disable-next-line solid/reactivity
        EditorView.updateListener.of((view) => {
          if (view.docChanged) {
            const text = view.state.doc.toString().trim();
            props.onChange?.(text);
            if (text) props.onTyping?.();
          }
        }),
      ],
    }),
  });

  // Shift state for `enterIntercepts`. A plain listener, not an editor handler:
  // on Android Chrome CodeMirror consumes the Enter key event itself, before
  // any editor handler runs.
  view.contentDOM.addEventListener(
    "keydown",
    (event) => (shiftHeld = event.shiftKey),
    true,
  );
  view.contentDOM.addEventListener(
    "keyup",
    (event) => (shiftHeld = event.shiftKey),
    true,
  );

  // Apply shared scrollbar styles from the exported scrollable style classes.
  const scroller = codeMirror.querySelector<HTMLDivElement>(".cm-scroller");
  if (scroller) {
    scroller.classList.add(...editorScrollbarClasses.split(" "));
  }

  // connect signals to extensions
  createEffect(
    on(
      () => props.placeholder,
      (text) => {
        view.dispatch({
          effects: placeholderCompartment.reconfigure(
            text ? placeholder(text) : [],
          ),
        });
      },
      {
        defer: true,
      },
    ),
  );

  // set initial value
  createEffect(
    on(
      () => props.initialValue?.[0] ?? "",
      (text) => {
        view.dispatch(
          view.state.update({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: {
              anchor: text.length,
            },
          }),
        );
      },
      {
        defer: true,
      },
    ),
  );

  // apply changes
  createEffect(
    on(
      () => props.nodeReplacement,
      (value) => {
        if (value) {
          view.focus();

          const text = value[0];
          if (text !== "_focus") {
            view.dispatch(view.state.replaceSelection(text));
            if (text) props.onTyping?.();
            props.onChange(view.state.doc.toString());
          }
        }
      },
      {
        defer: true,
      },
    ),
  );

  // apply a formatting-toolbar action to the current selection
  createEffect(
    on(
      () => props.formatAction,
      (value) => {
        if (!value) return;
        applyMarkdownFormat(view, value[0]);
        props.onChange(view.state.doc.toString());
        props.onTyping?.();
      },
      { defer: true },
    ),
  );

  // auto focus on mount
  onMount(
    () =>
      props.autoFocus &&
      setTimeout(() => {
        view.focus();

        view.dispatch(
          view.state.update({
            selection: {
              anchor: view.state.doc.length,
            },
          }),
        );
      }, 0),
  );

  return <>{codeMirror}</>;
}

const editor = css({
  display: "inline-flex",
  height: "100%",
  width: "100%",
  flexGrow: 1,
  alignSelf: "center",

  color: "var(--md-sys-color-on-surface)",

  fontWeight: 400,
  fontSize: "var(--message-size)",
  fontFamily: "var(--fonts-primary)",

  "& .cm-editor": {
    width: "100%",
    alignSelf: "center",
    maxHeight: "100%",
  },

  "& .cm-editor.cm-focused": {
    outline: "none !important",
  },

  // copied from elements.ts
  "& .md-h1": {
    fontSize: "2em",
    fontWeight: 600,
  },
  "& .md-h2": {
    fontSize: "1.6em",
    fontWeight: 600,
  },
  "& .md-h3": {
    fontSize: "1.4em",
    fontWeight: 600,
  },
  "& .md-h4": {
    fontSize: "1.2em",
    fontWeight: 600,
  },
  "& .md-h5": {
    fontSize: "1em",
    fontWeight: 600,
  },
  "& .md-h6": {
    fontSize: "0.8em",
    fontWeight: 600,
  },

  "& .md-meta-atom": {
    fontSize: "inherit",
    fontWeight: "inherit",
  },

  "& .md-meta.md-list": {
    fontFamily: "var(--fonts-monospace)",
    fontWeight: "bold",
    opacity: "0.5",
  },

  "& .md-emph": {
    fontStyle: "italic",
  },

  "& .md-bold": {
    fontWeight: "bold",
  },

  "& .md-link": {
    textDecoration: "underline",
  },

  "& .md-strikethrough": {
    textDecoration: "line-through",
    textDecorationColor: "color-mix(in srgb, currentColor 40%, transparent)",
    textDecorationThickness: "2px",
  },

  "& .md-hr": {
    fontWeight: "bold",
  },

  "& .md-code": {
    fontFamily: "var(--fonts-monospace)",

    padding: "0.5px 4px",

    color: "#c9d1d9",
    background: "#0d1117",
  },

  // adapted from elements.ts
  "& .md-quote.md-meta": {
    fontWeight: "bold",
  },

  "& .md-quote": {
    '&, &[class*="md-quote md-quote md-quote"]': {
      color: "var(--md-sys-color-on-secondary-container)",
      background: "var(--md-sys-color-secondary-container)",
      "--border": "var(--md-sys-color-secondary)",
    },

    '&[class="md-quote md-quote"], &[class="md-quote md-quote md-meta"], &[class="md-quote md-quote md-text"], &[class*="md-quote md-quote md-quote md-quote"]':
      {
        color: "var(--md-sys-color-on-tertiary-container)",
        background: "var(--md-sys-color-tertiary-container)",
        "--border": "var(--md-sys-color-tertiary)",
      },
  },

  // "& .md-comment": {},
});
