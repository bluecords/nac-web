import { Accessor, createEffect, on, onCleanup } from "solid-js";

/**
 * One shared stack of open "layers" (drawer, search, pickers, overlays...), so
 * the phone's Back button has ONE rule: close the topmost open layer.
 *
 * WHY THIS EXISTS. Before this, Back was a hand-written chain of special cases
 * in MobileNav (modal, then forum post, then "reveal the drawer"). Anything not
 * in that chain - an open drawer, the search overlay, the GIF/emoji picker -
 * ignored Back completely. Measured on a real handset 2026-10-07 (claude-repo
 * DESIGN_OVERLAY_CONTRACT.md, rule 4). Every new layer meant another special
 * case, which is how the same bug kept coming back.
 *
 * HOW. A layer calls `useBackLayer(isOpen, close)`. While open it sits on the
 * stack and owns one browser-history buffer entry (the same idiom MobileNav
 * already used for modals), so a Back press is consumed by the layer instead of
 * navigating away. `closeTopBackLayer()` is what the popstate handler calls.
 */
type Layer = { close: () => void };

/** Same breakpoint MobileNavContext uses for `isMobile`. Desktop has no Back-closes-layer behaviour. */
const isPhoneWidth = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 768px)").matches;

const stack: Layer[] = [];

/** Close the most recently opened layer. Returns false when none is open. */
export function closeTopBackLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Register a layer while `isOpen()` is true.
 *
 * If the layer is closed some other way (tap outside, its own X), it simply
 * leaves the stack; the history buffer entry it added is left in place, which is
 * the existing behaviour for modals and is what lets a later Back reveal the
 * channel drawer instead of leaving the app.
 */
export function useBackLayer(isOpen: Accessor<boolean>, close: () => void) {
  let layer: Layer | undefined;

  const remove = () => {
    if (!layer) return;
    const i = stack.indexOf(layer);
    if (i !== -1) stack.splice(i, 1);
    layer = undefined;
  };

  createEffect(
    on(isOpen, (open) => {
      if (open && !layer && isPhoneWidth()) {
        layer = { close };
        stack.push(layer);
        history.pushState(null, "", location.href);
      } else if (!open) {
        remove();
      }
    }),
  );

  onCleanup(remove);
}
