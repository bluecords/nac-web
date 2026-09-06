import { For, Show, createSignal } from "solid-js";

import { createFormControl, createFormGroup } from "solid-forms";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { useClient } from "@revolt/client";
import { Button, Column, Dialog, DialogProps, Form2, Row, Text } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create a new forum post (root message in a `ForumChannel`)
 */
export function CreateForumPostModal(
  props: DialogProps & Modals & { type: "create_forum_post" },
) {
  const { t } = useLingui();
  const { showError } = useModals();
  const client = useClient();

  const [files, setFiles] = createSignal<File[]>([]);
  const [uploading, setUploading] = createSignal(false);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setFiles((current) => [...current, ...Array.from(list)]);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  /**
   * Upload one file to Autumn and resolve its attachment id.
   *
   * Uses the SDK's own `uploadFile` rather than a hand-rolled request: it
   * already reports the real failure on a non-success response (a size-limit
   * rejection, a proxy error page) instead of a cryptic JSON parse error.
   */
  function uploadOne(file: File) {
    return client().uploadFile("attachments", file);
  }

  const group = createFormGroup({
    title: createFormControl("", { required: true }),
    content: createFormControl("", { required: true }),
  });

  const allowedTags = () => props.channel.allowedTags ?? [];
  const [selectedTags, setSelectedTags] = createSignal<Set<string>>(new Set());

  function toggleTag(tag: string) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  async function onSubmit() {
    try {
      setUploading(true);

      // Upload first: a post that references an id Autumn rejected is worse
      // than no post at all, so nothing is sent until every file has an id.
      const pending = files();
      const attachments: string[] = [];
      for (const file of pending) {
        attachments.push(await uploadOne(file));
      }

      const message = await props.channel.sendMessage({
        content: group.controls.content.value,
        forum_title: group.controls.title.value,
        forum_tags: selectedTags().size ? [...selectedTags()] : undefined,
        ...(attachments.length ? { attachments } : {}),
      });

      props.cb?.(message);
      props.onClose();
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>New post</Trans>}
      actions={[
        { text: <Trans>Close</Trans> },
        {
          text: <Trans>Post</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group) || uploading(),
        },
      ]}
      isDisabled={group.isPending || uploading()}
    >
      <form onSubmit={submit}>
        <Column>
          <Form2.TextField
            minlength={1}
            maxlength={100}
            counter
            name="title"
            control={group.controls.title}
            label={t`Title`}
          />

          <Form2.TextEditor
            control={group.controls.content}
            placeholder={t`Write your post...`}
          />

          <Column gap="sm">
            <input
              type="file"
              multiple
              accept="image/*,video/*,.pdf"
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            <Show when={files().length}>
              <Column gap="xs">
                <For each={files()}>
                  {(file, index) => (
                    <Row align gap="sm">
                      <Text class="label">{file.name}</Text>
                      <Button
                        type="button"
                        size="sm"
                        variant="plain"
                        onPress={() => removeFile(index())}
                      >
                        <Trans>Remove</Trans>
                      </Button>
                    </Row>
                  )}
                </For>
              </Column>
            </Show>
          </Column>

          <Show when={allowedTags().length}>
            <Row wrap>
              <For each={allowedTags()}>
                {(tag) => (
                  <Button
                    type="button"
                    size="sm"
                    group="standard"
                    groupActive={selectedTags().has(tag)}
                    onPress={() => toggleTag(tag)}
                  >
                    {tag}
                  </Button>
                )}
              </For>
            </Row>
          </Show>
        </Column>
      </form>
    </Dialog>
  );
}
