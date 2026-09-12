import { createFormControl, createFormGroup } from "solid-forms";
import { Show } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import {
  Avatar,
  Column,
  Dialog,
  DialogProps,
  Form2,
  MenuItem,
  Text,
} from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

const DURATIONS_SECONDS: Record<string, number> = {
  "60": 60,
  "300": 5 * 60,
  "600": 10 * 60,
  "3600": 60 * 60,
  "86400": 24 * 60 * 60,
  "604800": 7 * 24 * 60 * 60,
};

/**
 * Time out a server member, or clear an existing timeout.
 *
 * `timeout` on the member object is just a future timestamp - there is no
 * separate "un-timeout" endpoint, clearing it is `remove: ["Timeout"]` on the
 * same PATCH `member.edit()` already uses for nickname/roles.
 */
export function TimeoutMemberModal(
  props: DialogProps & Modals & { type: "timeout_member" },
) {
  const { t } = useLingui();
  const { showError } = useModals();

  const isTimedOut = () =>
    !!props.member.timeout && props.member.timeout.getTime() > Date.now();

  const group = createFormGroup({
    duration: createFormControl("3600"),
  });

  async function apply() {
    try {
      const seconds = DURATIONS_SECONDS[group.controls.duration.value];
      await props.member.edit({
        timeout: new Date(Date.now() + seconds * 1000).toISOString(),
      });
      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  async function clear() {
    try {
      await props.member.edit({ remove: ["Timeout"] });
      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  const submit = Form2.useSubmitHandler(group, apply);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Timeout Member</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        ...(isTimedOut()
          ? [{ text: <Trans>Remove Timeout</Trans>, onClick: clear }]
          : []),
        {
          text: <Trans>Timeout</Trans>,
          onClick: () => {
            apply();
            return false;
          },
        },
      ]}
    >
      <form onSubmit={submit}>
        <Column align>
          <Avatar src={props.member.user?.animatedAvatarURL} size={64} />
          <Show
            when={isTimedOut()}
            fallback={
              <Text>
                <Trans>
                  {props.member.user?.username} won't be able to send messages,
                  react, or speak in voice until the timeout expires
                </Trans>
              </Text>
            }
          >
            <Text>
              <Trans>
                {props.member.user?.username} is timed out until{" "}
                {props.member.timeout!.toLocaleString()}
              </Trans>
            </Text>
          </Show>
          <Form2.Select label={t`Duration`} control={group.controls.duration}>
            <MenuItem value="60">
              <Trans>60 Seconds</Trans>
            </MenuItem>
            <MenuItem value="300">
              <Trans>5 Minutes</Trans>
            </MenuItem>
            <MenuItem value="600">
              <Trans>10 Minutes</Trans>
            </MenuItem>
            <MenuItem value="3600">
              <Trans>1 Hour</Trans>
            </MenuItem>
            <MenuItem value="86400">
              <Trans>1 Day</Trans>
            </MenuItem>
            <MenuItem value="604800">
              <Trans>1 Week</Trans>
            </MenuItem>
          </Form2.Select>
        </Column>
      </form>
    </Dialog>
  );
}
