/**
 * Whether this device has a real pointer (mouse/trackpad) rather than a finger.
 *
 * Used to decide whether a picker should autofocus its search box. On desktop
 * that is exactly right - open the picker, start typing to filter. On a phone
 * it focuses a text field, which opens the on-screen keyboard and buries the
 * grid the picker exists to show.
 *
 * Measured on Bunjie's handset 2026-09-03: tapping the emoji button in the
 * message toolbar produced a search field plus a full keyboard covering most of
 * the emoji. His report was "the emoji brings up a place to test respond nit
 * emoji options" - an exact description of that symptom.
 *
 * Same condition as Panda's `_hoverable`, kept in JS because autofocus is a
 * behaviour, not a style.
 */
export function isFinePointer() {
  return (
    globalThis.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? true
  );
}
