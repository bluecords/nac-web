import { Match, Show, Switch, createSignal, splitProps } from "solid-js";

import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { ALLOWED_IMAGE_TYPES } from "@revolt/state";

import { Button, Ripple } from "../../design";
import { Row } from "../../layout";
import { Symbol } from "../Symbol";

import { ImageCropDialog } from "./ImageCropDialog";
import { parseAspect } from "./cropMath";

interface Props {
  /**
   * Currently selected file(s),
   * a URL for a preview,
   * or no file at all.
   */
  file: File[] | string | null;

  /**
   * Callback for selected file(s)
   *
   * Your consumer code should perform
   * additional validation such as file size.
   * @param files Selected File(s)
   */
  onFiles: (files: File[] | null) => void;

  /**
   * Whether to accept multiple files
   */
  multiple?: false;

  /**
   * What type of files to accept
   */
  accept?: "image/*";

  imageAspect?: string;
  imageRounded?: boolean;
  imageJustify?: boolean;
  allowRemoval?: boolean;

  /**
   * Let the member choose which part of a picked photo to keep, cropped to
   * `imageAspect` (square by default). Animated GIFs skip this because
   * redrawing one would freeze it.
   */
  crop?: boolean;

  required: boolean;
  disabled: boolean;
}

/**
 * Whether an image is animated, in which case cropping it (which redraws a
 * single frame) would freeze it. GIFs always are; PNG and WebP only sometimes.
 */
async function isAnimated(file: File): Promise<boolean> {
  if (file.type === "image/gif") return true;

  try {
    const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const text = (from: number, to: number) =>
      String.fromCharCode(...head.subarray(from, to));

    if (file.type === "image/webp") {
      // extended-format header; bit 1 of its flags byte is "has animation"
      return text(12, 16) === "VP8X" && (head[20] & 0x02) !== 0;
    }
    if (file.type === "image/png") {
      return text(0, head.length).includes("acTL");
    }
  } catch {
    // unreadable here means unreadable in the dialog too, which falls back
  }
  return false;
}

/**
 * Form element for collecting files
 */
export function FileInput(props: Props) {
  const [local, remote] = splitProps(props, [
    "file",
    "onFiles",
    "multiple",
    "accept",
    "crop",
  ]);
  let inputRef: HTMLInputElement | undefined;

  // A photo waiting in the crop dialog. The form is not touched until the
  // member confirms, so cancelling leaves their current picture alone.
  const [cropping, setCropping] = createSignal<File>();

  /**
   * Handle file selection
   */
  async function onChange(e: Event & { currentTarget: HTMLInputElement }) {
    // currentTarget is cleared once an event handler yields (the crop check awaits)
    const input = e.currentTarget;

    if (input.files) {
      const picked = [...input.files];

      if (
        local.crop &&
        local.accept === "image/*" &&
        picked.length === 1 &&
        ALLOWED_IMAGE_TYPES.includes(picked[0].type) &&
        !(await isAnimated(picked[0]))
      ) {
        setCropping(picked[0]);
        return;
      }

      // NB. need to help out with the reactivity by
      //     first removing the array, and then setting
      //     the new one; otherwise no update! ¯\_(ツ)_/¯
      local.onFiles(null);

      // If accept is an image, check all the files submitted if they match our accept values
      if (local.accept === "image/*") {
        for (const file of input.files) {
          if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            // If they were stubborn enough to disable our filter for files then just ignore the file.
            // No need for feedback, they know what they did.
            local.onFiles(null);
            input.files = null;
            return;
          }
        }
      }
      local.onFiles([...input.files]);
    }
  }

  /**
   * Crop dialog finished, hand the result to the form
   */
  function onCropped(file: File | undefined) {
    setCropping(undefined);
    // let the same file be picked again later
    inputRef!.value = "";

    if (file) {
      local.onFiles(null);
      local.onFiles([file]);
    }
  }

  /**
   * Handle clear
   */
  function onClear() {
    inputRef!.value = null!;
    local.onFiles(null);
  }

  function imageSrc() {
    if (typeof local.file === "string") {
      return local.file;
    } else if (Array.isArray(local.file)) {
      // purportedly, we don't need to revoke:
      // https://stackoverflow.com/a/49346614
      return URL.createObjectURL(local.file[0]);
    } else {
      return "";
    }
  }

  return (
    <Switch
      fallback={
        <>
          <input ref={inputRef} type="file" onChange={onChange} {...remote} />
          <Show when={local.file?.length || 0 > 0}>
            <Button
              size="icon"
              variant="text"
              onPress={onClear}
              isDisabled={!props.file}
            >
              X
            </Button>
          </Show>
        </>
      }
    >
      <Match when={local.accept === "image/*"}>
        <input
          type="file"
          ref={inputRef}
          class={css({
            display: "none",
          })}
          onChange={onChange}
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          {...remote}
        />
        <Row align justify={props.imageJustify ?? true} gap="lg">
          <ImagePreview
            onClick={() => inputRef!.click()}
            style={{
              "aspect-ratio": props.imageAspect ?? "1/1",
            }}
            rounded={props.imageRounded ?? true}
          >
            <Ripple />
            <Show when={local.file}>
              <img src={imageSrc()} />
            </Show>
          </ImagePreview>
          <Show when={props.allowRemoval !== false}>
            <Button
              size="icon"
              variant="text"
              onPress={onClear}
              isDisabled={!props.file}
            >
              <Symbol>close</Symbol>
            </Button>
          </Show>
        </Row>
        <Show when={cropping()} keyed>
          {(file) => (
            <ImageCropDialog
              file={file}
              aspect={parseAspect(props.imageAspect)}
              rounded={props.imageRounded ?? true}
              onConfirm={onCropped}
              onCancel={() => onCropped(undefined)}
              // could not read the picture: behave as before, upload it as chosen
              onError={() => {
                onCropped(file);
              }}
            />
          )}
        </Show>
      </Match>
    </Switch>
  );
}

const ImagePreview = styled("div", {
  base: {
    cursor: "pointer",
    position: "relative",
    height: "96px",

    backgroundColor: "var(--md-sys-color-surface-dim)",

    "& img": {
      display: "block",
      height: "100%",
      width: "100%",

      objectFit: "cover",
    },
  },
  variants: {
    rounded: {
      true: {
        borderRadius: "50%",

        "& img": {
          borderRadius: "50%",
        },
      },
      false: {
        borderRadius: "var(--borderRadius-lg)",

        "& img": {
          borderRadius: "var(--borderRadius-lg)",
        },
      },
    },
  },
});
