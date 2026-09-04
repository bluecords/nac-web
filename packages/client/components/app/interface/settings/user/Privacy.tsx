import { For, Show, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import {
  embedConsentGranted,
  grantEmbedConsent,
  mediaConsentGranted,
  useClient,
  withdrawEmbedConsent,
  withdrawMediaConsent,
} from "@revolt/client";
import { CategoryButton, Column, Text } from "@revolt/ui";

/**
 * Privacy settings: what you have agreed to, and taking it back.
 *
 * WHY THIS PAGE HAD TO EXIST. Both consent gates could be granted and neither
 * could be withdrawn - `withdrawMediaConsent` was written, exported, and called
 * from nowhere in the UI. So the app asked for consent and then offered no way
 * out of it, which is not consent, and Bunjie's own ruling on the gate was
 * "Withdrawal and regated."
 *
 * It also makes the embed modal's closing line true: it tells members they can
 * change their mind in Settings, and until this page shipped that sentence was
 * false.
 *
 * Withdrawing is not an edit. Each choice writes a NEW consent row against the
 * policy in force, so the audit trail shows what was agreed, when, and when it
 * was taken back - the same rule the first-login gate follows.
 */

/**
 * Every provider that can appear in an embed.
 *
 * Listed explicitly rather than derived from whatever has been granted, so a
 * member can see the full set they might be asked about - including the ones
 * they have never allowed. A list that only showed past grants would answer
 * "what did I agree to" but not "what could this ask me for".
 */
const PROVIDERS = [
  "YouTube",
  "Twitch",
  "Spotify",
  "Soundcloud",
  "Bandcamp",
  "Lightspeed",
] as const;

export function PrivacySettings() {
  const client = useClient();
  const imageryGranted = mediaConsentGranted();
  const [busy, setBusy] = createSignal<string>();

  /**
   * Flip one provider, keeping the button responsive while it saves.
   */
  async function toggleProvider(provider: string) {
    setBusy(provider);
    try {
      if (embedConsentGranted(provider)) {
        await withdrawEmbedConsent(client(), provider);
      } else {
        await grantEmbedConsent(client(), provider, true);
      }
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Column gap="lg">
      <Column gap="sm">
        <Text class="label">
          <Trans>Images and video posted here</Trans>
        </Text>
        <CategoryButton
          action={imageryGranted() ? <Trans>Turn off</Trans> : undefined}
          onClick={() => imageryGranted() && withdrawMediaConsent(client())}
          description={
            imageryGranted() ? (
              <Trans>
                You have agreed to see simple non-sexual nude imagery posted by
                members. Turning this off covers pictures and video again.
              </Trans>
            ) : (
              <Trans>
                Pictures and video are covered. You can agree from any covered
                item.
              </Trans>
            )
          }
        >
          <Trans>Member-posted imagery</Trans>
        </CategoryButton>
      </Column>

      <Column gap="sm">
        <Text class="label">
          <Trans>Outside players</Trans>
        </Text>
        <Text class="body">
          <Trans>
            These load from another company's servers, which means contacting
            them directly. Each is separate — agreeing to one is not agreeing to
            the rest.
          </Trans>
        </Text>

        <For each={PROVIDERS}>
          {(provider) => (
            <CategoryButton
              action={
                <Show
                  when={busy() !== provider}
                  fallback={<Trans>Saving…</Trans>}
                >
                  <Show
                    when={embedConsentGranted(provider)}
                    fallback={<Trans>Allow</Trans>}
                  >
                    <Trans>Turn off</Trans>
                  </Show>
                </Show>
              }
              onClick={() => toggleProvider(provider)}
              description={
                embedConsentGranted(provider) ? (
                  <Trans>
                    Plays here without asking. {provider} receives your IP
                    address when you play something.
                  </Trans>
                ) : (
                  <Trans>Blocked until you agree, each time you play.</Trans>
                )
              }
            >
              {provider}
            </CategoryButton>
          )}
        </For>

        <Text class="label">
          <Trans>
            Your IP address cannot be hidden from a player you choose to load.
            Opening a link in your own browser instead sends nothing from here.
          </Trans>
        </Text>
      </Column>
    </Column>
  );
}

export default PrivacySettings;
