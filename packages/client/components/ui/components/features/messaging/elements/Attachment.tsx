import { Match, Show, Switch } from "solid-js";

import { File, ImageEmbed, Message, VideoEmbed } from "stoat.js";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { MessageContextMenu } from "@revolt/app";
import {
  grantMediaConsent,
  mediaConsentGranted,
  useClient,
} from "@revolt/client";
import { useModals } from "@revolt/modal";
import { Column } from "@revolt/ui/components/layout";
import {
  MediaConsentGate,
  SizedContent,
  Spoiler,
} from "@revolt/ui/components/utils";

import { FileInfo } from "./FileInfo";
import { TextFile } from "./TextFile";

/**
 * List of attachments
 */
export const AttachmentContainer = styled(Column, {
  base: {
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    color: "var(--md-sys-color-inverse-on-surface)",
    background: "var(--md-sys-color-inverse-surface)",
  },
});

/**
 * Render a given list of files
 */
export function Attachment(props: { file: File; message?: Message }) {
  const { openModal } = useModals();
  const client = useClient();
  const consented = mediaConsentGranted();

  // Images and video only. Audio, text and plain files are not what the
  // gate is about, and blurring a filename would be theatre.
  const gated = () => !consented();

  return (
    <Switch fallback={`Could not render ${props.file.metadata.type}!`}>
      <Match when={props.file.metadata.type === "Image"}>
        <SizedContent
          width={(props.file.metadata as ImageEmbed).width}
          height={(props.file.metadata as ImageEmbed).height}
        >
          <Show when={gated()}>
            <MediaConsentGate onConsent={() => grantMediaConsent(client())} />
          </Show>
          <Show when={!gated() && props.file.isSpoiler}>
            <Spoiler contentType="Image" />
          </Show>
          {/* Not rendered at all while gated, rather than rendered and
              blurred: a blurred image has still been downloaded, and the
              gate is about whether the member agreed to receive it. */}
          <Show when={!gated()}>
            <img
              class={css({ cursor: "pointer" })}
              onClick={() =>
                openModal({
                  type: "image_viewer",
                  file: props.file,
                })
              }
              loading="lazy"
              src={props.file.createFileURL()}
              use:floating={{
                contextMenu: () => (
                  <MessageContextMenu
                    message={props.message}
                    file={props.file}
                  />
                ),
              }}
            />
          </Show>
        </SizedContent>
      </Match>
      <Match when={props.file.metadata.type === "Video"}>
        <SizedContent
          width={(props.file.metadata as VideoEmbed).width}
          height={(props.file.metadata as VideoEmbed).height}
        >
          <Show when={gated()}>
            <MediaConsentGate onConsent={() => grantMediaConsent(client())} />
          </Show>
          <Show when={!gated() && props.file.isSpoiler}>
            <Spoiler contentType="Video" />
          </Show>
          <Show when={!gated()}>
            <video
              controls
              preload="metadata"
              src={props.file.originalUrl}
              use:floating={{
                contextMenu: () => (
                  <MessageContextMenu
                    message={props.message}
                    file={props.file}
                  />
                ),
              }}
            />
          </Show>
        </SizedContent>
      </Match>
      <Match when={props.file.metadata.type === "Audio"}>
        <AttachmentContainer>
          <FileInfo file={props.file} />
          <SizedContent width={360} height={48}>
            <audio
              controls
              src={props.file.originalUrl}
              use:floating={{
                contextMenu: () => (
                  <MessageContextMenu
                    message={props.message}
                    file={props.file}
                  />
                ),
              }}
            />
          </SizedContent>
        </AttachmentContainer>
      </Match>
      <Match when={props.file.metadata.type === "File"}>
        <AttachmentContainer>
          <FileInfo file={props.file} />
        </AttachmentContainer>
      </Match>
      <Match when={props.file.metadata.type === "Text"}>
        <AttachmentContainer>
          <FileInfo file={props.file} />
          <SizedContent width={480} height={120}>
            <TextFile file={props.file} />
          </SizedContent>
        </AttachmentContainer>
      </Match>
    </Switch>
  );
}
