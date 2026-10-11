import { Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { useState } from "@revolt/state";
import {
  CategoryButton,
  Checkbox,
  Column,
  Text,
  iconSize,
  useSnackbar,
} from "@revolt/ui";

import MdContentCopy from "@material-design-icons/svg/outlined/content_copy.svg?component-solid";
import MdSend from "@material-design-icons/svg/outlined/send.svg?component-solid";

import {
  diagnosticsEnabled,
  diagnosticsExpiresAt,
  formatDiagnosticsReport,
  getDiagnosticsEvents,
  newReportCode,
  sendDiagnosticsReport,
  setDiagnosticsEnabled,
} from "../../../../../src/diagnostics";

/**
 * Advanced settings
 */
export default function AdvancedSettings() {
  const state = useState();

  return (
    <Column gap="xl">
      <Column>
        <Checkbox
          checked={state.settings.getValue("appearance:compact_mode")}
          onChange={(e) =>
            state.settings.setValue(
              "appearance:compact_mode",
              e.currentTarget.checked,
            )
          }
        >
          Compact mode
        </Checkbox>
        <Checkbox
          checked={state.settings.getValue("advanced:copy_id")}
          onChange={(e) =>
            state.settings.setValue("advanced:copy_id", e.currentTarget.checked)
          }
        >
          Show 'copy ID' in context menus
        </Checkbox>
      </Column>
      <Diagnostics />
    </Column>
  );
}

/**
 * Diagnostics: an opt-in log kept only on this device, handed over only when
 * the member presses Copy or Send. See src/diagnostics.ts for the rules.
 */
function Diagnostics() {
  const { t } = useLingui();
  const snackbar = useSnackbar();

  const [on, setOn] = createSignal(diagnosticsEnabled());
  const [count, setCount] = createSignal(getDiagnosticsEvents().length);
  const [busy, setBusy] = createSignal(false);

  const say = (message: string) =>
    snackbar.show({ message, placement: "bottom", closeable: true });

  const toggle = (enabled: boolean) => {
    setDiagnosticsEnabled(enabled);
    setOn(enabled);
    setCount(getDiagnosticsEvents().length);
  };

  const expires = () => {
    const at = diagnosticsExpiresAt();
    return at ? new Date(at).toLocaleDateString() : "";
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        formatDiagnosticsReport(newReportCode()),
      );
      say(t`Diagnostics copied to clipboard`);
    } catch {
      say(t`Couldn't copy. Try Send to NAC admins instead.`);
    }
  };

  const send = async () => {
    if (busy()) return;
    setBusy(true);
    const code = newReportCode();
    const ok = await sendDiagnosticsReport(code);
    setBusy(false);
    say(
      ok
        ? t`Sent to NAC admins. Your report code is ${code}`
        : t`Couldn't send. Check your connection and try again.`,
    );
  };

  return (
    <Column gap="md">
      <Checkbox checked={on()} onChange={(e) => toggle(e.currentTarget.checked)}>
        <Trans>Diagnostics</Trans>
      </Checkbox>
      <Text class="body">
        <Trans>
          Keeps a short log on this device to help fix problems such as missing
          notifications. Nothing is sent unless you press Send.
        </Trans>
      </Text>

      <Show when={on()}>
        <Text class="body">
          <Trans>
            Saves the last 200 events: notification status, reloads, dropped
            connections, and errors. No message text and nothing about who you
            talk to. It turns itself off and deletes the log on {expires()}.
          </Trans>
        </Text>
        <Text class="label">
          <Trans>{count()} events saved</Trans>
        </Text>
        <CategoryButton.Group>
          <CategoryButton
            icon={<MdContentCopy {...iconSize(22)} />}
            action="copy"
            onClick={copy}
          >
            <Trans>Copy</Trans>
          </CategoryButton>
          <CategoryButton
            icon={<MdSend {...iconSize(22)} />}
            onClick={send}
            description={
              <Trans>Reports are deleted from our server after 30 days.</Trans>
            }
          >
            <Trans>Send to NAC admins</Trans>
          </CategoryButton>
        </CategoryButton.Group>
      </Show>
    </Column>
  );
}
