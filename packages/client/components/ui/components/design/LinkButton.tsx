import { JSX } from "solid-js";

import { button } from "./Button";

type Variants = NonNullable<Parameters<typeof button>[0]>;

/**
 * Native anchor styled as a button.
 *
 * `<a href><Button></a>` breaks on iOS Safari: the inner `@solid-aria` Button
 * preventDefaults the tap and cancels the anchor's navigation, so tapping the
 * link does nothing (confirmed via WebKit touch emulation). A native `<a>`
 * styled with the button recipe navigates reliably on tap. Use for
 * button-styled links, especially on auth pages.
 */
export function LinkButton(
  props: {
    href: string;
    children: JSX.Element;
    variant?: Variants["variant"];
    size?: Variants["size"];
    shape?: Variants["shape"];
    target?: string;
    rel?: string;
  },
) {
  return (
    <a
      href={props.href}
      target={props.target}
      rel={props.rel}
      class={button({
        variant: props.variant,
        size: props.size,
        shape: props.shape,
      })}
    >
      {props.children}
    </a>
  );
}
