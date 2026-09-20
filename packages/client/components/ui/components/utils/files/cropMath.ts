/**
 * Geometry for the image crop dialog. Everything is in source-image pixels,
 * so the maths does not depend on how big the dialog happens to be drawn.
 */

/** Furthest the member can zoom in, as a multiple of the "fills the frame" size. */
export const MAX_ZOOM = 4;

export interface CropView {
  /** 1 = the smallest crop that still covers the whole frame; higher zooms in */
  zoom: number;
  /** The point of the source image that sits at the centre of the frame */
  cx: number;
  cy: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Parse a CSS aspect-ratio such as "232/100" or "1/1"; falls back to square. */
export function parseAspect(value: string | undefined): number {
  if (!value) return 1;
  const [a, b] = value.split("/").map((part) => parseFloat(part));
  const ratio = b === undefined ? a : a / b;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/** The part of the image visible at zoom 1: the largest `aspect` rectangle that fits. */
function coverSize(img: Size, aspect: number): Size {
  return img.w / img.h > aspect
    ? { w: img.h * aspect, h: img.h }
    : { w: img.w, h: img.w / aspect };
}

/** The part of the image visible at a given zoom. */
export function visibleSize(img: Size, aspect: number, zoom: number): Size {
  const cover = coverSize(img, aspect);
  return { w: cover.w / zoom, h: cover.h / zoom };
}

/** Keep the zoom in range and the crop window inside the image. */
export function clampView(view: CropView, img: Size, aspect: number): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const vis = visibleSize(img, aspect, zoom);
  return {
    zoom,
    cx: Math.min(img.w - vis.w / 2, Math.max(vis.w / 2, view.cx)),
    cy: Math.min(img.h - vis.h / 2, Math.max(vis.h / 2, view.cy)),
  };
}

/** Start centred and fully zoomed out: what the picture looked like before cropping existed. */
export function initialView(img: Size): CropView {
  return { zoom: 1, cx: img.w / 2, cy: img.h / 2 };
}

/** Drag the photo by (dx, dy) pixels of a frame that is `frameW` pixels wide. */
export function panView(
  view: CropView,
  dx: number,
  dy: number,
  frameW: number,
  img: Size,
  aspect: number,
): CropView {
  const vis = visibleSize(img, aspect, view.zoom);
  const perPixel = vis.w / frameW;
  return clampView(
    { ...view, cx: view.cx - dx * perPixel, cy: view.cy - dy * perPixel },
    img,
    aspect,
  );
}

/** Where to draw the whole image inside a frame `boxW` pixels wide. */
export function imagePlacement(
  view: CropView,
  img: Size,
  aspect: number,
  boxW: number,
) {
  const vis = visibleSize(img, aspect, view.zoom);
  const k = boxW / vis.w;
  return {
    width: img.w * k,
    height: img.h * k,
    left: boxW / 2 - view.cx * k,
    top: boxW / aspect / 2 - view.cy * k,
  };
}

/**
 * Size of the saved image: never larger than the part of the photo being kept
 * (no pointless upscaling) and never larger than needed to look sharp.
 */
export function outputSize(vis: Size, aspect: number): Size {
  const cap = aspect > 1.5 ? 1200 : 512;
  const scale = Math.min(1, cap / Math.max(vis.w, vis.h));
  return {
    w: Math.max(1, Math.round(vis.w * scale)),
    h: Math.max(1, Math.round(vis.h * scale)),
  };
}
