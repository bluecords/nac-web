import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { Button, Dialog, Slider } from "../../design";
import {
  type CropView,
  type Size,
  MAX_ZOOM,
  clampView,
  imagePlacement,
  initialView,
  outputSize,
  panView,
  visibleSize,
} from "./cropMath";

interface Props {
  file: File;
  /** Width divided by height of the saved image */
  aspect: number;
  /** Whether the image is shown in a circle (avatars, icons) */
  rounded: boolean;
  onConfirm: (file: File) => void;
  onCancel: () => void;
  /** The image could not be read or cropped; the caller should use the original file */
  onError: () => void;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Lets the member choose which part of a photo becomes their picture: drag to
 * move, slider / scroll wheel / pinch to zoom. The result is cropped in the
 * browser, so the file that gets uploaded is already the right shape and small.
 */
export function ImageCropDialog(props: Props) {
  const { t } = useLingui();

  // eslint-disable-next-line solid/reactivity -- the dialog is remounted per file
  const url = URL.createObjectURL(props.file);
  onCleanup(() => URL.revokeObjectURL(url));

  const image = new Image();
  const [img, setImg] = createSignal<Size>();
  const [view, setView] = createSignal<CropView>();
  const [frameW, setFrameW] = createSignal(0);
  const [saving, setSaving] = createSignal(false);

  // Once the dialog is gone, a late image load or error must not reach the form.
  let disposed = false;
  const fail = () => {
    if (!disposed) props.onError();
  };
  onCleanup(() => {
    disposed = true;
    image.onload = image.onerror = null;
  });

  image.onload = () => {
    const size = { w: image.naturalWidth, h: image.naturalHeight };
    if (!size.w || !size.h) return fail();
    setImg(size);
    setView(initialView(size));
  };
  image.onerror = fail;
  image.src = url;

  let container: HTMLDivElement | undefined;
  let frame: HTMLDivElement | undefined;

  onMount(() => {
    const measure = () => setFrameW(frame!.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame!);
    onCleanup(() => observer.disconnect());

    // needs to be non-passive so the page does not scroll while zooming
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Firefox reports mouse wheels in lines (1) rather than pixels (0)
      const pixels =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomTo((view()?.zoom ?? 1) * Math.exp(-pixels * 0.002));
    };
    frame!.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => frame!.removeEventListener("wheel", onWheel));

    // Capture phase, so Escape closes only this dialog and not the settings
    // window behind it (which would throw away the member's unsaved edits).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        props.onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => window.removeEventListener("keydown", onKey, true));

    // Put keyboard focus in the dialog, and give it back when it closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    container!.focus();
    onCleanup(() => previouslyFocused?.focus?.());
  });

  function zoomTo(zoom: number) {
    const current = view();
    const size = img();
    if (!current || !size) return;
    setView(clampView({ ...current, zoom }, size, props.aspect));
  }

  function panBy(dx: number, dy: number) {
    const current = view();
    const size = img();
    if (!current || !size || !frameW()) return;
    setView(panView(current, dx, dy, frameW(), size, props.aspect));
  }

  // Dragging with one pointer pans; two pointers (a pinch) zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number } | undefined;

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(e: PointerEvent) {
    frame!.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch =
      pointers.size === 2
        ? { distance: pinchDistance(), zoom: view()?.zoom ?? 1 }
        : undefined;
  }

  function onPointerMove(e: PointerEvent) {
    const previous = pointers.get(e.pointerId);
    if (!previous) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      panBy(e.clientX - previous.x, e.clientY - previous.y);
    } else if (pointers.size === 2 && pinch && pinch.distance > 0) {
      zoomTo(pinch.zoom * (pinchDistance() / pinch.distance));
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    pinch = undefined;
  }

  function onKeyDown(e: KeyboardEvent) {
    const step = 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      panBy(move[0], move[1]);
    }
  }

  const placement = (boxW: number) => {
    const current = view();
    const size = img();
    return current && size
      ? imagePlacement(current, size, props.aspect, boxW)
      : undefined;
  };

  const imageStyle = (boxW: () => number) => {
    const p = placement(boxW());
    return p
      ? {
          width: `${p.width}px`,
          height: `${p.height}px`,
          left: `${p.left}px`,
          top: `${p.top}px`,
        }
      : { display: "none" };
  };

  const circle = createMemo(() => props.rounded && props.aspect === 1);

  async function confirm() {
    const current = view();
    const size = img();
    if (!current || !size || saving()) return;
    setSaving(true);

    let result: File | undefined;
    try {
      const vis = visibleSize(size, props.aspect, current.zoom);
      const out = outputSize(vis, props.aspect);

      const canvas = document.createElement("canvas");
      canvas.width = out.w;
      canvas.height = out.h;
      canvas
        .getContext("2d")!
        .drawImage(
          image,
          current.cx - vis.w / 2,
          current.cy - vis.h / 2,
          vis.w,
          vis.h,
          0,
          0,
          out.w,
          out.h,
        );

      // Keep transparency for PNG / WebP, everything else becomes a JPEG.
      const wanted =
        props.file.type === "image/png" || props.file.type === "image/webp"
          ? props.file.type
          : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, wanted, 0.92),
      );
      const extension = blob && EXTENSIONS[blob.type];
      if (blob && extension) {
        const base = props.file.name.replace(/\.[^.]*$/, "") || "image";
        result = new File([blob], `${base}.${extension}`, {
          type: blob.type,
          lastModified: Date.now(),
        });
      }
    } catch {
      result = undefined;
    }

    if (result) props.onConfirm(result);
    else fail();
  }

  // Only a click that both started and ended on the dark backdrop cancels;
  // letting go of the slider out there must not.
  let pressStartedOnScrim = false;

  return (
    <Portal mount={document.getElementById("floating")!}>
      <Dialog.Scrim
        padding={false}
        style={{ padding: "16px", "--background": "rgba(0, 0, 0, 0.6)" }}
        onPointerDown={(e) => {
          pressStartedOnScrim = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pressStartedOnScrim && e.target === e.currentTarget) {
            props.onCancel();
          }
        }}
      >
        <Container
          ref={container}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t`Adjust your photo`}
          onClick={(e) => e.stopPropagation()}
        >
          <Title>
            <Trans>Adjust your photo</Trans>
          </Title>
          <Hint>
            <Trans>Drag to move. Use the slider to zoom.</Trans>
          </Hint>

          <Frame
            ref={frame}
            tabIndex={0}
            role="group"
            aria-label={t`Photo preview. Use the arrow keys to move it.`}
            style={{
              "aspect-ratio": `${props.aspect}`,
              // the floor keeps it usable where vh resolves to 0 (some Android WebViews)
              width: `max(200px, min(100%, ${60 * props.aspect}vh))`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <img
              src={url}
              alt=""
              draggable={false}
              style={imageStyle(frameW)}
            />
            <Show when={circle()}>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  fill="rgba(0, 0, 0, 0.55)"
                  d="M0 0H100V100H0Z M50 0a50 50 0 1 0 0.01 0Z"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="49.6"
                  fill="none"
                  stroke="#fff"
                  stroke-width="0.6"
                />
              </svg>
            </Show>
          </Frame>

          <Slider
            min={100}
            max={MAX_ZOOM * 100}
            step={1}
            value={Math.round((view()?.zoom ?? 1) * 100)}
            onInput={(e) => zoomTo(e.currentTarget.value / 100)}
            aria-label={t`Zoom`}
          />

          <Show when={circle()}>
            <Previews>
              <Preview style={{ width: "40px", height: "40px" }}>
                <img src={url} alt="" style={imageStyle(() => 40)} />
              </Preview>
              <Preview style={{ width: "28px", height: "28px" }}>
                <img src={url} alt="" style={imageStyle(() => 28)} />
              </Preview>
              <Hint>
                <Trans>How it looks in chat</Trans>
              </Hint>
            </Previews>
          </Show>

          <Actions>
            <Button variant="text" size="sm" onPress={props.onCancel}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="filled"
              size="sm"
              onPress={confirm}
              isDisabled={!view() || saving()}
            >
              <Trans>Use photo</Trans>
            </Button>
          </Actions>
        </Container>
      </Dialog.Scrim>
    </Portal>
  );
}

const Container = styled("div", {
  base: {
    width: "min(100%, 400px)",
    padding: "24px",
    borderRadius: "28px",

    display: "flex",
    flexDirection: "column",
    gap: "12px",

    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-high)",
    outline: "none",
  },
});

const Title = styled("span", {
  base: {
    fontSize: "1.5rem",
    lineHeight: "2rem",
  },
});

const Hint = styled("span", {
  base: {
    fontSize: "0.875rem",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Frame = styled("div", {
  base: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    margin: "0 auto",

    borderRadius: "12px",
    background: "var(--md-sys-color-surface-dim)",

    cursor: "grab",
    touchAction: "none",
    userSelect: "none",

    "&:active": {
      cursor: "grabbing",
    },

    "& img": {
      position: "absolute",
      maxWidth: "none",
      pointerEvents: "none",
    },

    "& svg": {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    },
  },
});

const Previews = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
});

const Preview = styled("div", {
  base: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "50%",
    background: "var(--md-sys-color-surface-dim)",

    "& img": {
      position: "absolute",
      maxWidth: "none",
    },
  },
});

const Actions = styled("div", {
  base: {
    gap: "8px",
    display: "flex",
    justifyContent: "end",
    marginBlockStart: "12px",
  },
});
