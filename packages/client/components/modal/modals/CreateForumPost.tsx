import { For, Show, createSignal } from "solid-js";

import { createFormControl, createFormGroup } from "solid-forms";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { Button, Column, Dialog, DialogProps, Form2, Row } from "@revolt/ui";

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
      const message = await props.channel.sendMessage({
        content: group.controls.content.value,
        forum_title: group.controls.title.value,
        forum_tags: selectedTags().size ? [...selectedTags()] : undefined,
      });

      props.cb?.(message);
      props.onClose();
    } catch (error) {
      showError(error);
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
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
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
