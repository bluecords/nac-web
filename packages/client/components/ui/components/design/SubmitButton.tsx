import { JSX, splitProps } from "solid-js";

import { button } from "./Button";

type Variants = NonNullable<Parameters<typeof button>[0]>;

/**
 * Native submit button.
 *
 * The standard `<Button>` is built on `@solid-aria`'s press handling, which
 * preventDefaults touch events and cancels the synthesized click on iOS
 * Safari — so `<Button type="submit">` silently does nothing when *tapped* on
 * an iPhone/iPad (native form submission never fires; confirmed via WebKit
 * touch emulation, and reported live on a real iPhone). A plain native
 * `<button type="submit">` submits reliably on both tap and click. Use this
 * for form submit controls, especially on auth pages.
 */
export function SubmitButton(
  props: {
    children: JSX.Element;
    variant?: Variants["variant"];
    size?: Variants["size"];
    shape?: Variants["shape"];
    disabled?: boolean;
  },
) {
  const [v, rest] = splitProps(props, ["variant", "size", "shape", "disabled"]);
  return (
    <button
      type="submit"
      disabled={v.disabled}
      class={button({
        variant: v.variant,
        size: v.size,
        shape: v.shape,
        disabled: v.disabled,
      })}
    >
      {rest.children}
    </button>
  );
}
