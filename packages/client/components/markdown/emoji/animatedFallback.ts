const ANIMATED_PATH = "/emoji/noto-animated/";

/**
 * The static Noto URL to use instead of an animated-pack one, or undefined when
 * the URL is not from the animated pack.
 *
 * The animated pack only covers part of Unicode (about a third of what the
 * picker offers), so a 404 there is normal, not an error.
 * `UnicodeEmoji` handles it for rendered messages; this is for the plain
 * `<img>` elements the message editors build outside Solid.
 */
export function staticFallbackFor(url: string): string | undefined {
  if (!url.includes(ANIMATED_PATH)) return undefined;

  return url
    .replace(ANIMATED_PATH, "/emoji/noto/")
    .replace(/\.gif(\?|$)/, ".svg$1");
}

/**
 * Make a plain `<img>` show the static Noto emoji when the animated one is
 * missing. Call before setting `src`. Tries once, so a missing static image
 * cannot loop.
 */
export function fallBackToStaticEmoji(img: HTMLImageElement) {
  img.addEventListener(
    "error",
    () => {
      const fallback = staticFallbackFor(img.src);
      if (fallback) img.src = fallback;
    },
    { once: true },
  );
}
