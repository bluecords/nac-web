import { ComponentProps, createSignal, splitProps } from "solid-js";

import emojiRegex from "emoji-regex";

import { useState } from "@revolt/state";
import { EmojiBase, toCodepoint } from ".";

// openmoji is off due to incomplete implementation

export type UnicodeEmojiPacks =
  | "fluent-3d"
  | "fluent-color"
  | "fluent-flat"
  | "mutant"
  | "noto"
  | "noto-animated"
  //  | "openmoji"
  | "twemoji";

export const UNICODE_EMOJI_PACKS: UnicodeEmojiPacks[] = [
  "fluent-3d",
  "fluent-color",
  "fluent-flat",
  "mutant",
  "noto",
  "noto-animated",
  //  "openmoji",
  "twemoji",
];

/**
 * Packs served as animated GIF instead of static SVG.
 *
 * "noto-animated" is Google's official animated Noto Color Emoji set
 * (googlefonts/noto-emoji, Apache-2.0) - coverage is partial (roughly a
 * quarter of base gestures/faces, far less once every skin-tone/gender
 * permutation and every country flag is counted in, since Google has not
 * produced GIF art for all of those). unicodeEmojiUrl() still always
 * builds a URL for the requested codepoint; UnicodeEmoji() falls back to
 * the static "noto" SVG on a 404 rather than showing a broken image.
 */
const ANIMATED_UNICODE_EMOJI_PACKS = new Set<UnicodeEmojiPacks>([
  "noto-animated",
]);

export const UNICODE_EMOJI_PACK_PUA: Record<string, string> = {
  // omit fluent-3d as it is the default (canonically \uE0E1)
  "fluent-flat": "\uE0E2",
  mutant: "\uE0E3",
  noto: "\uE0E4",
  //  openmoji: "\uE0E5",
  twemoji: "\uE0E6",
  "noto-animated": "\uE0E7",
};

/**
 * Regex for matching emoji
 */
export const RE_UNICODE_EMOJI = new RegExp(
  "([\uE0E0-\uE0E7]?(?:" + emojiRegex().source + "))",
  "g",
);

export const UNICODE_EMOJI_MIN_PACK = "\uE0E0".codePointAt(0)!;
export const UNICODE_EMOJI_MAX_PACK = "\uE0E7".codePointAt(0)!;

export const UNICODE_EMOJI_PUA_PACK: Record<string, UnicodeEmojiPacks> = {
  ["\uE0E0"]: "fluent-3d", // default entry
  ["\uE0E1"]: "fluent-3d",
  ["\uE0E2"]: "fluent-flat",
  ["\uE0E3"]: "mutant",
  ["\uE0E4"]: "noto",
  //  ["\uE0E5"]: "openmoji",
  ["\uE0E6"]: "twemoji",
  ["\uE0E7"]: "noto-animated",
};

export const startsWithPackPUA = (emoji: string) => {
  if (emoji.startsWith(":")) return false;
  if (emoji.slice(0, 1).match("[\uE0E0-\uE0E7]")) return true;

  return false;
};

/**
 * Emoji come from our own origin, not a third party.
 *
 * This used to be https://static.stoat.chat/emoji/... , which meant every
 * emoji in every message was fetched by the MEMBER'S OWN BROWSER from
 * infrastructure we do not control - one request, and one IP address, per
 * emoji per message per member. Probed live 2026-09-04: 200 OK. It was
 * really happening. Same class as the geo.revolt.chat call already removed
 * from the age gate.
 *
 * All six packs are now mirrored onto the box and served at /emoji/ by nginx.
 * See nac-server: nginx/sites-available/community-nac-social and
 * scripts/mirror-emoji.py.
 *
 * Relative on purpose, the same way the GIF picker calls /giphy: a dev build
 * then hits its own origin rather than production.
 */
export function unicodeEmojiUrl(
  pack: UnicodeEmojiPacks = "fluent-3d",
  text: string,
) {
  const ext = ANIMATED_UNICODE_EMOJI_PACKS.has(pack) ? "gif" : "svg";
  return `/emoji/${pack}/${toCodepoint(text)}.${ext}?v=1`;
}

/**
 * Display Unicode emoji
 */
export function UnicodeEmoji(
  props: { emoji: string; pack?: UnicodeEmojiPacks } & Omit<
    ComponentProps<typeof EmojiBase>,
    "loading" | "class" | "alt" | "draggable" | "src"
  >,
) {
  const [local, remote] = splitProps(props, ["emoji"]);
  const state = useState();

  const pack = () =>
    props.pack ??
    state.settings.getValue("appearance:unicode_emoji") ??
    "fluent-3d";

  // Animated-pack coverage is partial. A failed load used to be handled by
  // imperatively setting img.src in an error handler - but src is also a
  // *reactive* attribute here (it reads pack()), and Solid re-applies a
  // reactive attribute whenever its tracked signal re-evaluates, which
  // silently overwrote that one-time imperative fix back to the still-404
  // animated URL on the next unrelated re-render (visible in practice: it
  // worked for a freshly-sent message, which renders once, but broke for
  // sidebar channel names, which re-render often - a broken-image icon that
  // never got a second chance because the old code's own "already handled"
  // guard then blocked it from retrying). Fixed by making the fallback part
  // of the same reactive graph instead of fighting it: `failed` is a real
  // signal, and the URL Solid keeps re-applying already accounts for it.
  const [failed, setFailed] = createSignal(false);
  const effectivePack = () => {
    const p = pack();
    return failed() && ANIMATED_UNICODE_EMOJI_PACKS.has(p) ? "noto" : p;
  };

  return (
    <EmojiBase
      {...remote}
      loading="lazy"
      class="emoji"
      alt={local.emoji}
      draggable={false}
      src={unicodeEmojiUrl(effectivePack(), local.emoji)}
      on:error={() => {
        if (ANIMATED_UNICODE_EMOJI_PACKS.has(pack()) && !failed()) {
          setFailed(true);
        }
      }}
    />
  );
}
