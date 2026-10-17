import { createFormControl, createFormGroup } from "solid-forms";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { Column, Dialog, DialogProps, Form2 } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal for editing user's custom status
 */
export function CustomStatusModal(
  props: DialogProps & Modals & { type: "custom_status" },
) {
  const { t } = useLingui();
  const { showError } = useModals();

  /* eslint-disable solid/reactivity */
  const group = createFormGroup({
    text: createFormControl(props.client.user?.status?.text ?? ""),
  });
  /* eslint-enable solid/reactivity */

  async function onSubmit() {
    try {
      const text = group.controls.text.value;
      await props.client.user!.edit({
        status: {
          ...props.client.user?.status,
          text: text.trim().length > 0 ? text : undefined,
        },
      });
      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  /**
   * Copying a custom emoji can leave only an image (and HTML pointing at it)
   * on the clipboard, which would paste as nothing. Turn emoji images into
   * their `:ID:` text form.
   */
  function onPaste(event: ClipboardEvent) {
    const html = event.clipboardData?.getData("text/html");
    if (!html) return;

    const doc = new DOMParser().parseFromString(html, "text/html");
    let found = false;
    for (const img of doc.querySelectorAll("img")) {
      const id = img.src.match(/\/emojis\/([0-9A-Z]{26})/)?.[1];
      if (id) {
        img.replaceWith(`:${id}:`);
        found = true;
      }
    }
    if (!found) return;

    const input = event.composedPath()[0] as HTMLInputElement;
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    event.preventDefault();
    input.setRangeText(
      text,
      input.selectionStart ?? 0,
      input.selectionEnd ?? 0,
      "end",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Set your status</Trans>}
      actions={[
        { text: <Trans>Close</Trans> },
        {
          text: <Trans>Save</Trans>,
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
            maxlength={128}
            onPaste={onPaste}
            counter
            name="text"
            control={group.controls.text}
            label={t`Custom status`}
          />
        </Column>
      </form>
    </Dialog>
  );
}
