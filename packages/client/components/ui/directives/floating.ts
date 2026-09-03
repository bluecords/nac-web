import {
  type Accessor,
  type JSX,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

type Props = JSX.Directives["floating"] & object;

export type FloatingElement = {
  config: () => Props;
  element: HTMLElement;
  hide: () => void;
  show: Accessor<Props | undefined>;
};

const [floatingElements, setFloatingElements] = createSignal<FloatingElement[]>(
  [],
);

export { floatingElements };

/**
 * Set when a menu is opened by a TOUCH gesture, so the click the browser
 * synthesises when the finger lifts does not immediately dismiss the menu that
 * gesture just opened.
 *
 * Why this is shared rather than local: FloatingManager registers a document
 * listener whose comment reads "Always dismiss context menu on click", and it
 * cannot tell the opening gesture's own trailing click from a genuine click
 * elsewhere. On desktop that never mattered - a right-click fires `contextmenu`
 * with no click after it. On touch, a long-press opens the menu at 500ms and
 * the lift then closes it, so the menu appeared and vanished in the same
 * gesture. Measured on a handset 2026-09-03: a MutationObserver on #floating
 * recorded `add:ReplyMark as unreadCopy text...` immediately followed by `rm:`.
 */
let suppressedDocumentClick = false;

/**
 * Whether the next document mousedown/click belongs to the gesture that just
 * opened a menu. Reading does not clear it; `consumeSuppressedDocumentClick`
 * does, so `mousedown` can check and the following `click` can clear.
 */
export function isDocumentClickSuppressed() {
  return suppressedDocumentClick;
}

/**
 * Clear the suppression, having handled the click it was covering.
 */
export function consumeSuppressedDocumentClick() {
  suppressedDocumentClick = false;
}

/**
 * Register a new floating element
 * @param element element
 */
export function registerFloatingElement(element: FloatingElement) {
  setFloatingElements((elements) => [...elements, element]);
}

/**
 * Un register floating element
 * @param element DOM Element
 */
export function unregisterFloatingElement(element: HTMLElement) {
  setFloatingElements((elements) =>
    elements.filter((entry) => entry.element !== element),
  );
}

/**
 * Add floating elements
 * @param element Element
 * @param accessor Parameters
 */
export function floating(element: HTMLElement, accessor: Accessor<Props>) {
  const config = accessor();
  if (!config) return;

  const [show, setShow] = createSignal<Props | undefined>();
  // DEBUG: createEffect(() => console.info("show:", show()));

  registerFloatingElement({
    config: accessor,
    element,
    show,
    /**
     * Hide the element
     */
    hide() {
      setShow(undefined);
    },
  });

  // Set when a touch long-press opens a menu, so the click that arrives when
  // the finger lifts does not immediately toggle it shut. Declared out here
  // because the long-press handlers and onContextMenu live in different
  // scopes below.
  let suppressNextClick = false;

  /**
   * Trigger a floating element
   */
  function trigger(target: keyof Props, desiredState?: boolean) {
    const current = show();
    const config = accessor();

    if (target === "userCard" && config.userCard) {
      if (current?.userCard) {
        setShow(undefined);
      } else if (!current) {
        setShow({ userCard: config.userCard });
      } else {
        setShow(undefined);
        setShow({ userCard: config.userCard });
      }
    }

    if (target === "tooltip" && config.tooltip) {
      if (current?.tooltip) {
        if (desiredState !== true) {
          setShow(undefined);
        }
      } else if (!current) {
        if (desiredState !== false) {
          setShow({ tooltip: config.tooltip });
        }
      }
    }

    if (target === "contextMenu" && config.contextMenu) {
      if (current?.contextMenu) {
        setShow(undefined);
      } else if (!current) {
        setShow({ contextMenu: config.contextMenu });
      } else {
        setShow(undefined);
        setShow({ contextMenu: config.contextMenu });
      }
    }
  }

  /**
   * Handle click events
   */
  function onClick() {
    // TODO: handle shift+click for mention
    trigger("userCard");
  }

  /**
   * Handle context menu click
   */
  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // A touch long-press has already opened this menu, and lifting the finger
    // now delivers the click that would toggle it straight back shut. Swallow
    // exactly one click.
    //
    // Only bites when contextMenuHandler is "click" (the profile ... button,
    // the forum menus), because then BOTH paths call trigger(): the 500ms
    // long-press timer opens it, then the synthesised click closes it. On
    // desktop there is no long-press, which is why this reproduced on a
    // handset and not in a browser.
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    trigger("contextMenu");
  }

  /**
   * Handle mouse entering
   */
  function onMouseEnter() {
    trigger("tooltip", true);
  }

  /**
   * Handle mouse leaving
   */
  function onMouseLeave() {
    trigger("tooltip", false);
  }

  createEffect(
    on(
      () => accessor().userCard,
      (userCard) => {
        if (userCard) {
          element.style.cursor = "pointer";
          element.style.userSelect = "none";
          element.addEventListener("click", onClick);

          onCleanup(() => element.removeEventListener("click", onClick));
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().tooltip,
      (tooltip) => {
        if (tooltip) {
          element.ariaLabel =
            typeof tooltip.content === "string"
              ? tooltip.content
              : tooltip!.aria!;

          // Tooltips are hover-only — skip on touch devices
          if (navigator.maxTouchPoints === 0) {
            element.addEventListener("mouseenter", onMouseEnter);
            element.addEventListener("mouseleave", onMouseLeave);

            onCleanup(() => {
              element.removeEventListener("mouseenter", onMouseEnter);
              element.removeEventListener("mouseleave", onMouseLeave);
            });
          }
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().contextMenu,
      (contextMenu) => {
        if (contextMenu) {
          element.addEventListener(
            accessor().contextMenuHandler ?? "contextmenu",
            onContextMenu,
          );

          // Long-press for touch devices (replaces right-click)
          let longPressTimer: ReturnType<typeof setTimeout> | null = null;
          let startX = 0;
          let startY = 0;
          let longPressFired = false;

          function onPointerDown(e: PointerEvent) {
            if (e.pointerType !== "touch") return;
            startX = e.clientX;
            startY = e.clientY;
            longPressFired = false;
            // Every fresh touch starts clean. Without this, a long-press whose
            // click never arrives (finger dragged off, browser synthesised
            // nothing) would leave the flag set and swallow the NEXT genuine
            // tap - reintroducing the dead-button symptom this fixes.
            suppressNextClick = false;
            suppressedDocumentClick = false;
            longPressTimer = setTimeout(() => {
              longPressFired = true;
              // The click that follows this finger lift must not toggle the
              // menu we are about to open...
              suppressNextClick = true;
              // ...nor reach FloatingManager's "always dismiss on click"
              // document listener, which would close the menu we are opening.
              suppressedDocumentClick = true;
              trigger("contextMenu");
              // Vibrate briefly if supported (haptic feedback)
              if (navigator.vibrate) navigator.vibrate(30);
            }, 500);
          }

          function onPointerMove(e: PointerEvent) {
            if (e.pointerType !== "touch" || !longPressTimer) return;
            // Cancel if finger moves more than 8px
            if (
              Math.abs(e.clientX - startX) > 8 ||
              Math.abs(e.clientY - startY) > 8
            ) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
          }

          function onPointerUp(e: PointerEvent) {
            if (e.pointerType !== "touch") return;
            if (longPressTimer) {
              clearTimeout(longPressTimer);
              longPressTimer = null;

              // A short tap. On a `contextMenuHandler: "click"` element we
              // have to open the menu HERE, because the click never comes.
              //
              // Why: these menus hang off IconButton, which is built on
              // @solid-aria/button's createButton. Solid-aria drives touch
              // through its own press abstraction and suppresses the
              // synthesised click, so the raw "click" listener this directive
              // registers fires on desktop and never fires on a handset.
              // Measured symptom (Bunjie, 2026-09-02): the profile "..." did
              // nothing on tap, while a long press opened it - the long press
              // works precisely because it bypasses click.
              //
              // Long-press behaviour is unchanged, and elements using the
              // default "contextmenu" handler still open ONLY on long press:
              // a tap must not open those.
              if (
                e.type === "pointerup" &&
                accessor().contextMenuHandler === "click"
              ) {
                suppressNextClick = true;
                // Same reason as the long-press above: the synthesised click
                // that follows this lift would otherwise reach
                // FloatingManager and dismiss the menu we just opened.
                suppressedDocumentClick = true;
                trigger("contextMenu");
              }
            }
          }

          function onTouchContextMenu(e: Event) {
            // Suppress browser context menu if our long-press already fired
            if (longPressFired) {
              e.preventDefault();
              longPressFired = false;
            }
          }

          element.addEventListener("pointerdown", onPointerDown);
          element.addEventListener("pointermove", onPointerMove);
          element.addEventListener("pointerup", onPointerUp);
          element.addEventListener("pointercancel", onPointerUp);
          element.addEventListener("contextmenu", onTouchContextMenu);

          onCleanup(() => {
            element.removeEventListener(
              config.contextMenuHandler ?? "contextmenu",
              onContextMenu,
            );
            element.removeEventListener("pointerdown", onPointerDown);
            element.removeEventListener("pointermove", onPointerMove);
            element.removeEventListener("pointerup", onPointerUp);
            element.removeEventListener("pointercancel", onPointerUp);
            element.removeEventListener("contextmenu", onTouchContextMenu);
            if (longPressTimer) clearTimeout(longPressTimer);
          });
        }
      },
    ),
  );

  onCleanup(() => unregisterFloatingElement(element));
}
