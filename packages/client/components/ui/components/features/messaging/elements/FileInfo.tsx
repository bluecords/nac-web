import {
  BiRegularHeadphone,
  BiSolidFile,
  BiSolidFileTxt,
  BiSolidImage,
  BiSolidVideo,
} from "solid-icons/bi";
import { Match, Show, Switch } from "solid-js";

import { File, MessageEmbed } from "stoat.js";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { IconButton, Text } from "@revolt/ui/components/design";
import { Column, Row } from "@revolt/ui/components/layout";
import { humanFileSize } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Base container
 */
const Base = styled(Row, {
  base: { minWidth: 0 },
});

interface Props {
  /**
   * File information
   */
  file?: File;

  /**
   * Embed information
   */
  embed?: MessageEmbed;
}

/**
 * Information about a given attachment or embed
 */
export function FileInfo(props: Props) {
  return (
    <Base align>
      <Switch fallback={<BiSolidFile size={24} />}>
        <Match
          when={
            props.file?.metadata.type === "Image" ||
            props.embed?.type === "Image"
          }
        >
          <BiSolidImage size={24} />
        </Match>
        <Match
          when={
            props.file?.metadata.type === "Video" ||
            props.embed?.type === "Video"
          }
        >
          <BiSolidVideo size={24} />
        </Match>
        <Match when={props.file?.metadata.type === "Audio"}>
          <BiRegularHeadphone size={24} />
        </Match>
        <Match when={props.file?.metadata.type === "Text"}>
          <BiSolidFileTxt size={24} />
        </Match>
      </Switch>
      {/* min-width: 0 lets a long filename shrink instead of pushing the
          download button off the right edge on narrow screens. */}
      <Column grow class={css({ minWidth: 0 })}>
        <span class={css({ overflowWrap: "anywhere" })}>
          {props.file?.filename}
        </span>
        <Show when={props.file?.size}>
          <Text class="label" size="small">
            {humanFileSize(props.file!.size!)}
          </Text>
        </Show>
      </Column>
      <Show when={props.file}>
        <a
          class={css({ flexShrink: 0 })}
          target="_blank"
          href={props.file?.originalUrl}
          download={props.file?.filename}
        >
          <IconButton>
            <Symbol>download</Symbol>
          </IconButton>
        </a>
      </Show>
    </Base>
  );
}
