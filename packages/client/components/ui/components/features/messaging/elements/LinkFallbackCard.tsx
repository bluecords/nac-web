import { For, Show, createSignal, onCleanup } from "solid-js";

import { styled } from "styled-system/jsx";

import { Text } from "@revolt/ui/components/design";
import { Column } from "@revolt/ui/components/layout";

/**
 * Platforms that decide for themselves whether a server may see a preview of
 * a post. Measured 2026-10-16: some Instagram reels return a bare login page
 * to every anonymous request, from any address, so no server can build a
 * preview. Those links used to show as plain text with nothing around them.
 */
const PLATFORMS: { name: string; test: RegExp; kind: (url: string) => string }[] =
  [
    {
      name: "Instagram",
      test: /^https?:\/\/(www\.)?instagram\.com\//i,
      kind: (url) => (/\/reels?\//i.test(url) ? "reel" : "post"),
    },
    {
      name: "Facebook",
      test: /^https?:\/\/(www\.|m\.)?(facebook\.com|fb\.watch)\//i,
      kind: (url) => (/\/(reel|share\/r)\b/i.test(url) ? "reel" : "post"),
    },
  ];

/** How long to wait for the real preview before calling it missing. The server
 * retries for about 25 s, and a card that flashes up and is then replaced by
 * the preview would be worse than nothing. */
const GRACE_MS = 90_000;

const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;

/** Same exclusions the server applies when it builds previews: code, and links
 * a member wrapped in angle brackets to opt out of one. */
const IGNORED = /```[\s\S]+?```|`[\s\S]+?`|<http[^>]+>/g;

/**
 * Which links in a message deserve a fallback card, at most two.
 */
export function fallbackLinks(content: string | null | undefined) {
  const found: { url: string; name: string; kind: string }[] = [];

  // Quoted lines (starting with ">") get no preview from the server either.
  const text = (content ?? "")
    .replace(IGNORED, "")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(">"))
    .join(" ");

  for (const raw of text.match(URL_PATTERN) ?? []) {
    const url = raw.replace(/[.,;:!?*_~'"]+$/, "");
    const platform = PLATFORMS.find((p) => p.test.test(url));

    if (platform && !found.some((f) => f.url === url)) {
      found.push({ url, name: platform.name, kind: platform.kind(url) });
    }
  }

  return found.slice(0, 2);
}

const Base = styled("a", {
  base: {
    width: "fit-content",
    display: "flex",
    maxWidth: "calc(min(100%, 420px))",
    flexDirection: "row",
    alignItems: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    color: "var(--md-sys-color-on-primary-container)",
    background: "var(--md-sys-color-primary-container)",
    borderInlineStart: "var(--gap-sm) solid var(--md-sys-color-primary)",
    textDecoration: "none",
    cursor: "pointer",
  },
});

const Content = styled(Column, {
  base: {
    minWidth: 0,
  },
});

/**
 * Card for a link whose platform gave us no preview. Opens the link in a new
 * tab; loads nothing from the platform itself.
 */
export function LinkFallbackCard(props: {
  content: string | null | undefined;
  /** When the previews were last asked for: the edit time if it was edited,
   * since an edit clears them and the server builds them again. */
  since: Date;
}) {
  const remaining = () =>
    Math.max(0, GRACE_MS - (Date.now() - props.since.getTime()));

  const [ready, setReady] = createSignal(remaining() === 0);

  if (!ready()) {
    const timer = setTimeout(() => setReady(true), remaining());
    onCleanup(() => clearTimeout(timer));
  }

  return (
    <Show when={ready()}>
      <For each={fallbackLinks(props.content)}>
        {(link) => (
          <Base href={link.url} target="_blank" rel="noopener noreferrer">
            <Content gap="sm" grow>
              <Text class="label">{link.name} {link.kind}</Text>
              <Text size="small">
                {link.name} doesn't share a preview of this {link.kind}.
              </Text>
              <Text class="label" size="small">
                <span style={{ "text-decoration": "underline" }}>
                  Open on {link.name}
                </span>
              </Text>
            </Content>
          </Base>
        )}
      </For>
    </Show>
  );
}
