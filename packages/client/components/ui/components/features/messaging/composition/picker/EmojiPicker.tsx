import {
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";

import { VirtualContainer } from "@minht11/solid-virtual-container";
import { Emoji, Server } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { UnicodeEmoji } from "@revolt/markdown/emoji";
import { UNICODE_EMOJI_PACK_PUA } from "@revolt/markdown/emoji/UnicodeEmoji";
import { useState } from "@revolt/state";
import { Avatar, Ripple, TextField } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";

import { isFinePointer } from "./pointer";

import emojiMapping from "../../../../../emojiMapping.json";

import {
  CompositionMediaPickerContext,
  compositionContent,
} from "./CompositionMediaPicker";

type Item =
  | {
      /**
       * Server header
       */
      t: 0;
      server: Server;
    }
  | {
      /**
       * Spacing element
       */
      t: 1;
    }
  | {
      /**
       * Custom emoji
       */
      t: 2;
      emoji: Emoji;
    }
  | {
      /**
       * Title header
       */
      t: 3;
      title: string;
    }
  | {
      /**
       * Unicode emoji
       */
      t: 4;
      name: string;
      text: string;
    };

/** Width of one emoji cell, in px (matches the `itemSize` given below). */
const CELL = 40;

/** Columns assumed until the grid has been measured. */
const COLUMNS = 10;

/**
 * Extra search words per emoji (keys are names from emojiMapping.json), so a
 * member can find "folded-hands" by typing "prayer" instead of hunting through
 * every hand.
 */
const ALIASES: Record<string, string[]> = {
  "folded-hands": [
    "pray",
    "prayer",
    "praying",
    "please",
    "thanks",
    "thank you",
    "namaste",
    "hope",
    "amen",
  ],
  "raising-hands": ["praise", "worship", "hallelujah", "celebrate", "hooray"],
  clap: ["clapping", "applause", "bravo", "well done"],
  "thumbs-up": ["like", "yes", "approve", "good", "agree"],
  "thumbs-down": ["dislike", "no", "disapprove", "bad"],
  ok: ["okay", "fine", "perfect"],
  "gesture-ok": ["okay", "fine", "perfect"],
  wave: ["hello", "hi", "bye", "goodbye", "hand"],
  muscle: ["strong", "strength", "flex", "bicep"],
  "red-heart": ["love", "like"],
  heart: ["love"],
  "heart-eyes": ["love", "adore"],
  "loudly-crying": ["sob", "sad", "cry", "crying", "tears"],
  "holding-back-tears": ["touched", "moved", "grateful"],
  joy: ["lol", "laugh", "laughing", "funny", "tears of joy"],
  rofl: ["lol", "funny", "laugh", "laughing"],
  pleading: ["please", "beg", "puppy eyes"],
  fire: ["lit", "hot", "flame"],
  "latin-cross": ["jesus", "christian", "christ", "church", "faith"],
  church: ["christian", "worship", "faith"],
  "open-book": ["bible", "read", "scripture"],
  books: ["bible", "read", "library"],
  peace: ["dove"],
  "peace-symbol": ["peace"],
  sparkles: ["shiny", "magic", "new", "glitter"],
  "party-popper": ["celebrate", "congratulations", "tada", "party"],
  "partying-face": ["celebrate", "party", "birthday"],
  "check-mark-button": ["yes", "done", "correct", "complete"],
  skull: ["dead", "death", "dying"],
  eyes: ["look", "looking", "watching"],
  "hug-face": ["hug", "hugging"],
  hugging: ["hug", "hug-face"],
  sleepy: ["tired", "sleep", "zzz"],
  angry: ["mad", "upset", "furious"],
  pouting: ["mad", "angry"],
  smirk: ["sly", "smug"],
  "star-struck": ["wow", "amazing", "excited"],
  "100": ["perfect", "hundred", "score"],
  crown: ["king", "queen", "royal"],
  rose: ["flower", "love"],
};

/** Words an emoji can be found by: its name, and any aliases. */
function searchWords(name: string) {
  return `${name.replace(/-/g, " ")} ${(ALIASES[name] ?? []).join(" ")}`.toLowerCase();
}

function matchesFilter(name: string, filterText: string) {
  const words = filterText.split(/\s+/).filter(Boolean);
  const hay = searchWords(name);
  return words.every((w) => hay.includes(w));
}

/** 0 when the search is an exact alias/name word, so those list first. */
function matchRank(name: string, filterText: string) {
  const q = filterText.trim();
  if (name === q.replace(/\s+/g, "-")) return 0;
  return (ALIASES[name] ?? []).includes(q) ? 0 : 1;
}

const USAGE_KEY = "nac:emoji-usage";
const FREQUENT_COUNT = 20;

/**
 * How often this device has picked each emoji. Kept in this browser only: it
 * is a convenience, and a failed read or write must never break the picker.
 */
function readUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

const [usage, setUsage] = createSignal<Record<string, number>>(readUsage());

function recordUsage(key: string) {
  const next = { ...readUsage() };
  next[key] = (next[key] ?? 0) + 1;
  setUsage(next);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch {
    /* not saved; still counted for this session */
  }
}

export function EmojiPicker() {
  const client = useClient();
  const state = useState();

  const [filter, setFilter] = createSignal("");

  let serverScrollTargetElement!: HTMLDivElement;
  let emojiScrollTargetElement!: HTMLDivElement;

  // How many cells actually fit across. This used to be a fixed 10, but the
  // grid is `floor(width / 40)` wide, and on a phone the picker is narrower
  // than 400px: 9 columns fit, the section padding assumed 10, and every row
  // drifted one cell sideways (headings and the first emoji of each section
  // ended up in the middle of the row).
  const [columns, setColumns] = createSignal(COLUMNS);

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      const fit = Math.floor(entry.contentRect.width / CELL);
      if (fit > 0) setColumns(fit);
    });
    observer.observe(emojiScrollTargetElement);
    onCleanup(() => observer.disconnect());
  });

  const items = createMemo(() => {
    const cols = columns();
    const filterText = filter().toLowerCase();

    if (filterText) {
      return [
        ...state.ordering
          .orderedServers(client())
          .flatMap((server) =>
            server.emojis
              .filter((emoji) => emoji.name.toLowerCase().includes(filterText))
              .map((emoji) => ({ t: 2, emoji })),
          ),
        ...Object.entries(emojiMapping)
          .filter(([name]) => matchesFilter(name, filterText))
          .sort(
            ([a], [b]) =>
              matchRank(a, filterText.trim()) - matchRank(b, filterText.trim()),
          )
          .map(([name, text]) => ({ t: 4, name, text })),
      ] as Item[];
    }

    const items: Item[] = [];

    // Most used on this device, above everything else.
    const frequent = Object.entries(usage())
      .sort((a, b) => b[1] - a[1])
      .flatMap(([key]): Item[] => {
        if (key.startsWith("u:")) {
          const name = key.slice(2);
          const text = (emojiMapping as Record<string, string>)[name];
          return text ? [{ t: 4, name, text }] : [];
        }

        const id = key.slice(2);
        for (const server of state.ordering.orderedServers(client())) {
          const emoji = server.emojis.find((e) => e.id === id);
          if (emoji) return [{ t: 2, emoji }];
        }
        return [];
      })
      .slice(0, FREQUENT_COUNT);

    if (frequent.length) {
      items.push({ t: 3, title: "Most used" });

      while (items.length % cols) {
        items.push({ t: 1 });
      }

      items.push(...frequent);

      while (items.length % cols) {
        items.push({ t: 1 });
      }
    }

    for (const server of state.ordering.orderedServers(client())) {
      const emojis = server.emojis;

      if (emojis.length === 0) continue;

      items.push({
        t: 0,
        server,
      });

      while (items.length % cols) {
        items.push({ t: 1 });
      }

      for (const emoji of emojis) {
        items.push({ t: 2, emoji });
      }

      while (items.length % cols) {
        items.push({ t: 1 });
      }
    }

    items.push({
      t: 3,
      title: "Default",
    });

    while (items.length % cols) {
      items.push({ t: 1 });
    }

    for (const emoji of Object.entries(emojiMapping)) {
      items.push({
        t: 4,
        name: emoji[0],
        text: emoji[1] as string,
      });
    }

    return items;
  });

  return (
    <Stack style={{ "--emoji-cols": String(columns()) }}>
      <TextField
        // Desktop only: on touch this focuses the field, the on-screen keyboard
        // opens over the picker, and the emoji you came for are hidden behind
        // it. See isFinePointer().
        autoFocus={isFinePointer()}
        variant="filled"
        placeholder="Search for emojis..."
        value={filter()}
        // No onMouseDown preventDefault here: it stops a tap from focusing the
        // field, so on a phone (no autofocus) the keyboard could never open.
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
      <Row class={compositionContent()}>
        <div
          ref={serverScrollTargetElement}
          use:invisibleScrollable={{
            class: scrollContainer({ component: "serverRail" }),
          }}
        >
          <VirtualContainer
            items={[1, 2, 3]}
            scrollTarget={serverScrollTargetElement}
            itemSize={{ height: 40 }}
          >
            {ServerItem}
          </VirtualContainer>
        </div>
        <div
          ref={emojiScrollTargetElement}
          use:invisibleScrollable={{
            class: scrollContainer({ component: "emoji" }),
          }}
        >
          <VirtualContainer
            items={items()}
            scrollTarget={emojiScrollTargetElement}
            itemSize={{ height: 40, width: 40 }}
            crossAxisCount={(measurements) =>
              Math.floor(
                measurements.container.cross / measurements.itemSize.cross,
              )
            }
          >
            {EmojiItem}
          </VirtualContainer>
        </div>
      </Row>
    </Stack>
  );
}

const Stack = styled("div", {
  base: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

const scrollContainer = cva({
  base: {},
  variants: {
    component: {
      serverRail: {
        display: "none",
        // flexShrink: 0,
        // width: "40px",
      },
      emoji: {
        flexGrow: 1,
      },
    },
  },
});

const ServerItem = (props: {
  style: unknown;
  tabIndex: number;
  item: number;
}) => (
  <ServerOption
    style={props.style as never}
    tabIndex={props.tabIndex}
    role="listitem"
  >
    {props.item}
  </ServerOption>
);

const ServerOption = styled("div", {
  base: {
    width: "100%",
  },
});

const EmojiItem = (props: { style: unknown; tabIndex: number; item: Item }) => {
  const state = useState();
  const { onTextReplacement, close } = useContext(
    CompositionMediaPickerContext,
  );

  return (
    <EmojiOption
      style={props.style as never}
      type={props.item.t}
      tabIndex={props.tabIndex}
      role="listitem"
      onClick={() => {
        if (props.item.t === 2) {
          recordUsage(`c:${props.item.emoji.id}`);
          onTextReplacement(`:${props.item.emoji.id}:`);
          close();
        }

        if (props.item.t === 4) {
          recordUsage(`u:${props.item.name}`);
          onTextReplacement(
            `${UNICODE_EMOJI_PACK_PUA[state.settings.getValue("appearance:unicode_emoji")!] ?? ""}${props.item.text}`,
          );
          // Close after a pick so the member can see what it did (on a phone
          // the picker covers the message it was added to). Reopen to add more.
          close();
        }
      }}
    >
      <Switch>
        <Match when={props.item.t === 0}>
          <ServerHeader server={(props.item as Item & { t: 0 }).server} />
        </Match>
        <Match when={props.item.t === 2}>
          <Ripple />
          <Show keyed when={(props.item as Item & { t: 2 }).emoji.id}>
            <img src={(props.item as Item & { t: 2 }).emoji.url} />
          </Show>
        </Match>
        <Match when={props.item.t === 3}>
          <span>{(props.item as Item & { t: 3 }).title}</span>
        </Match>
        <Match when={props.item.t === 4}>
          <Ripple />
          <Show keyed when={(props.item as Item & { t: 4 }).text}>
            <UnicodeEmoji
              emoji={(props.item as Item & { t: 4 }).text}
              pack={state.settings.getValue("appearance:unicode_emoji")}
            />
          </Show>
        </Match>
      </Switch>
    </EmojiOption>
  );
};

const EmojiOption = styled("div", {
  base: {},
  variants: {
    type: {
      0: {},
      1: {},
      2: {},
      3: {},
      4: {},
    },
  },
  compoundVariants: [
    {
      type: [0, 3],
      css: {
        display: "flex",
        alignItems: "center",
        paddingInline: "var(--gap-md)",
        width: `calc(${CELL}px * var(--emoji-cols, ${COLUMNS})) !important`,
      },
    },
    {
      type: [2, 4],
      css: {
        width: "100%",
        cursor: "pointer",
        position: "relative",
        padding: "var(--gap-sm)",
        borderRadius: "var(--borderRadius-sm)",

        "--emoji-size": "100%",

        "& img": {
          width: "100%",
          height: "100%",
          objectFit: "contain",
        },
      },
    },
  ],
});

function ServerHeader(props: { server: Server }) {
  return (
    <Row align>
      <Avatar
        size={24}
        src={props.server.animatedIconURL}
        fallback={props.server.name}
      />
      <span>{props.server.name}</span>
    </Row>
  );
}
