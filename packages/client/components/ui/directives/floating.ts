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
            longPressTimer = setTimeout(() => {
              longPressFired = true;
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
