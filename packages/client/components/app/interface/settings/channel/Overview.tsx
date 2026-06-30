import { createFormControl, createFormGroup } from "solid-forms";
import { For, Match, Show, Switch, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import type { API } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { useModals } from "@revolt/modal";
import {
  Button,
  CircularProgress,
  Column,
  Form2,
  IconButton,
  MenuItem,
  Row,
  Text,
} from "@revolt/ui";

import MdAdd from "@material-design-icons/svg/outlined/add.svg?component-solid";
import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";

import { ChannelSettingsProps } from "../ChannelSettings";

/**
 * Channel overview
 */
export default function ChannelOverview(props: ChannelSettingsProps) {
  const { t } = useLingui();
  const client = useClient();
  const { openModal } = useModals();

  /* eslint-disable solid/reactivity */
  // we want to take the initial value only
  const editGroup = createFormGroup({
    name: createFormControl(props.channel.name),
    description: createFormControl(props.channel.description || ""),
    icon: createFormControl<string | File[] | null>(
      props.channel.animatedIconURL,
    ),
    slowmode: createFormControl<string>(
      props.channel.slowmode.toString() ?? "0",
    ),
  });

  const [allowedTags, setAllowedTags] = createSignal<string[]>(
    props.channel.allowedTags ?? [],
  );
  const [solutionEnabled, setSolutionEnabled] = createSignal(
    props.channel.solutionEnabled ?? false,
  );
  const [newTag, setNewTag] = createSignal("");
  /* eslint-enable solid/reactivity */

  function onReset() {
    editGroup.controls.name.setValue(props.channel.name);
    editGroup.controls.description.setValue(props.channel.description || "");
    editGroup.controls.icon.setValue(props.channel.animatedIconURL ?? null);
    editGroup.controls.slowmode.setValue(
      props.channel.slowmode.toString() ?? "0",
    );
  }

  async function onSubmit() {
    const changes: API.DataEditChannel = {
      remove: [],
    };

    if (editGroup.controls.name.isDirty) {
      changes.name = editGroup.controls.name.value.trim();
    }

    if (editGroup.controls.description.isDirty) {
      const description = editGroup.controls.description.value.trim();

      if (description) {
        changes.description = description;
      } else {
        changes.remove!.push("Description");
      }
    }

    if (editGroup.controls.icon.isDirty) {
      if (!editGroup.controls.icon.value) {
        changes.remove!.push("Icon");
      } else if (Array.isArray(editGroup.controls.icon.value)) {
        const body = new FormData();
        body.append("file", editGroup.controls.icon.value[0]);

        const [key, value] = client().authenticationHeader;
        const data: { id: string } = await fetch(
          `${CONFIGURATION.DEFAULT_MEDIA_URL}/icons`,
          {
            method: "POST",
            body,
            headers: {
              [key]: value,
            },
          },
        ).then((res) => res.json());

        changes.icon = data.id;
      }
    }

    if (editGroup.controls.slowmode.isDirty) {
      changes.slowmode = Number(editGroup.controls.slowmode.value);
    }

    const forumChanges: Record<string, unknown> = {};
    if (props.channel.type === "ForumChannel") {
      forumChanges.allowed_tags = allowedTags();
      forumChanges.solution_enabled = solutionEnabled();
    }

    await props.channel.edit({ ...changes, ...forumChanges } as Parameters<typeof props.channel.edit>[0]);
  }

  const submit = Form2.useSubmitHandler(editGroup, onSubmit, onReset);

  const isForumDirty = () =>
    props.channel.type === "ForumChannel" &&
    (JSON.stringify(allowedTags()) !==
      JSON.stringify(props.channel.allowedTags ?? []) ||
      solutionEnabled() !== (props.channel.solutionEnabled ?? false));

  return (
    <Column gap="xl">
      <form onSubmit={submit}>
        <Column>
          <Text class="label">
            <Trans>Channel Info</Trans>
          </Text>
          <Form2.FileInput control={editGroup.controls.icon} accept="image/*" />
          <Form2.TextField
            minlength={1}
            maxlength={32}
            counter
            name="name"
            control={editGroup.controls.name}
            label={t`Channel Name`}
          />
          <Form2.TextField
            autosize
            min-rows={2}
            maxlength={1024}
            counter
            name="description"
            control={editGroup.controls.description}
            label={t`Channel Description`}
            placeholder={t`This channel is about...`}
          />
          <Show when={props.channel.type === "ForumChannel"}>
            <Column gap="sm">
              <Text class="label">
                <Trans>Keywords</Trans>
              </Text>
              <Text size="small" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                <Trans>
                  Define the tags members can apply when creating a post.
                </Trans>
              </Text>
              <Row wrap gap="sm">
                <For each={allowedTags()}>
                  {(tag) => (
                    <TagChip>
                      {tag}
                      <IconButton
                        size="x-small"
                        onPress={() =>
                          setAllowedTags((t) => t.filter((x) => x !== tag))
                        }
                      >
                        <MdClose />
                      </IconButton>
                    </TagChip>
                  )}
                </For>
              </Row>
              <Row gap="sm">
                <input
                  style={{
                    flex: 1,
                    padding: "6px 12px",
                    "border-radius": "var(--borderRadius-md)",
                    background: "var(--md-sys-color-surface-container-highest)",
                    color: "var(--md-sys-color-on-surface)",
                    border: "none",
                    font: "inherit",
                  }}
                  placeholder={t`Add keyword...`}
                  value={newTag()}
                  onInput={(e) => setNewTag(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const tag = newTag().trim();
                      if (tag && !allowedTags().includes(tag)) {
                        setAllowedTags((t) => [...t, tag]);
                      }
                      setNewTag("");
                    }
                  }}
                />
                <IconButton
                  onPress={() => {
                    const tag = newTag().trim();
                    if (tag && !allowedTags().includes(tag)) {
                      setAllowedTags((t) => [...t, tag]);
                    }
                    setNewTag("");
                  }}
                >
                  <MdAdd />
                </IconButton>
              </Row>
            </Column>
            <Column gap="sm">
              <Text class="label">
                <Trans>Solution Marking</Trans>
              </Text>
              <Row gap="md" style={{ "align-items": "center" }}>
                <input
                  type="checkbox"
                  id="solution-enabled"
                  checked={solutionEnabled()}
                  onChange={(e) => setSolutionEnabled(e.currentTarget.checked)}
                />
                <label for="solution-enabled" style={{ color: "var(--md-sys-color-on-surface-variant)" }}>
                  <Trans>Allow post authors to mark a reply as the solution</Trans>
                </label>
              </Row>
            </Column>
          </Show>
          <Show when={props.channel.type === "TextChannel"}>
            <Form2.Select
              label={t`Channel Slowmode`}
              control={editGroup.controls.slowmode}
            >
              <MenuItem value="0">
                <Trans>Slowmode off</Trans>
              </MenuItem>
              <MenuItem value="5">
                <Trans>5 seconds</Trans>
              </MenuItem>
              <MenuItem value="10">
                <Trans>10 seconds</Trans>
              </MenuItem>
              <MenuItem value="30">
                <Trans>30 seconds</Trans>
              </MenuItem>
              <MenuItem value="60">
                <Trans>1 minute</Trans>
              </MenuItem>
              <MenuItem value="300">
                <Trans>5 minutes</Trans>
              </MenuItem>
              <MenuItem value="600">
                <Trans>10 minutes</Trans>
              </MenuItem>
              <MenuItem value="1800">
                <Trans>30 minutes</Trans>
              </MenuItem>
              <MenuItem value="3600">
                <Trans>1 hour</Trans>
              </MenuItem>
              <MenuItem value="7200">
                <Trans>2 hours</Trans>
              </MenuItem>
              <MenuItem value="21600">
                <Trans>6 hours</Trans>
              </MenuItem>
            </Form2.Select>
          </Show>
          <Row>
            <Form2.Reset group={editGroup} onReset={onReset} />
            <Form2.Submit group={editGroup} requireDirty={!isForumDirty()}>
              <Trans>Save</Trans>
            </Form2.Submit>
            <Show when={editGroup.isPending}>
              <CircularProgress />
            </Show>
          </Row>
        </Column>
      </form>
      <Column>
        <Text class="label">
          <Trans>Mark as Mature</Trans>
        </Text>
        <Text>
          <Trans>
            Users will be asked to confirm their age before opening this
            channel.
          </Trans>
        </Text>
        <div>
          <Button
            onPress={() =>
              openModal({
                type: "channel_toggle_mature",
                channel: props.channel,
              })
            }
          >
            <Switch fallback={<Trans>Mark as Mature</Trans>}>
              <Match when={props.channel.mature}>
                <Trans>Unmark as Mature</Trans>
              </Match>
            </Switch>
          </Button>
        </div>
      </Column>
    </Column>
  );
}

const TagChip = styled("span", {
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px 2px 10px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
    fontSize: "12px",
  },
});
