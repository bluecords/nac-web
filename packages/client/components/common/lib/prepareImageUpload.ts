/**
 * Largest file (bytes) the media server accepts for each image upload tag.
 * Mirrors `[features.limits.default.file_upload_size_limit]` in the server's
 * Revolt.toml - if those change, change these. A phone camera photo is
 * routinely over the 4 MB avatar cap, which is why this exists.
 */
const IMAGE_SIZE_LIMITS: Record<string, number> = {
  avatars: 4_000_000,
  icons: 2_500_000,
  banners: 6_000_000,
  backgrounds: 6_000_000,
};

/** Longest edge to try, largest first. Avatars/icons render far smaller. */
const MAX_EDGES = [2048, 1600, 1200, 800, 512];

const SHRINKABLE = ["image/jpeg", "image/png", "image/webp"];

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Make an image fit the media server's size limit for the given upload tag.
 *
 * Files already under the limit are returned untouched. Oversized JPEG, PNG
 * and WebP images are scaled down (keeping their format, so transparency
 * survives). Anything else that is too big - a GIF, most likely, since
 * redrawing it would silently freeze the animation - is rejected here with a
 * message that says what to do, instead of failing on the server.
 */
export async function prepareImageUpload(
  tag: string,
  file: File,
): Promise<File> {
  const limit = IMAGE_SIZE_LIMITS[tag];
  if (!limit || file.size <= limit) return file;

  const limitMb = limit / 1_000_000;

  if (!SHRINKABLE.includes(file.type)) {
    throw new Error(
      `That image is over ${limitMb} MB and can't be shrunk automatically. Please choose a smaller one.`,
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `That image is over ${limitMb} MB and couldn't be shrunk. Please choose a smaller one.`,
    );
  }

  try {
    for (const maxEdge of MAX_EDGES) {
      const scale = Math.min(
        1,
        maxEdge / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, file.type, 0.85);

      // toBlob quietly falls back to PNG when a type isn't supported, so
      // only accept a result that is the format we asked for.
      if (blob && blob.type === file.type && blob.size <= limit) {
        return new File([blob], file.name, {
          type: blob.type,
          lastModified: Date.now(),
        });
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error(
    `That image is over ${limitMb} MB and couldn't be shrunk enough. Please choose a smaller one.`,
  );
}
