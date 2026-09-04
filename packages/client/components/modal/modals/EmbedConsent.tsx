import { createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { grantEmbedConsent, useClient } from "@revolt/client";
import { Checkbox, Column, Dialog, DialogProps, Text } from "@revolt/ui";

import { Modals } from "../types";

/**
 * Asked before a third-party player is loaded for the first time.
 *
 * The point is that the member decides BEFORE anything is sent, so the wording
 * names the company and says plainly what it receives. Vagueness here would
 * make the consent meaningless - "we may share data with partners" is exactly
 * the sentence this gate exists to not be.
 *
 * The IP line is not a disclaimer, it is the honest limit. Everything else can
 * be masked; the address cannot, short of proxying the video through our own
 * box, which is not viable for YouTube on bandwidth or terms and would make NAC
 * the requester instead. Saying so is better than implying a protection that
 * does not exist.
 */
export function EmbedConsentModal(
  props: DialogProps & Modals & { type: "embed_consent" },
) {
  const client = useClient();
  const [remember, setRemember] = createSignal(true);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Play this from {props.provider}?</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          // Offered FIRST of the two real choices because it is the private
          // one: opening the link yourself sends nothing from here, and
          // rel="noreferrer" means the provider is not told where you came
          // from. For this community that association is the sensitive part.
          text: <Trans>Open in your own browser</Trans>,
          onClick: () => {
            window.open(props.url, "_blank", "noreferrer,noopener");
          },
        },
        {
          text: <Trans>Play here</Trans>,
          onClick: () => {
            grantEmbedConsent(client(), props.provider, remember());
            props.onPlay();
          },
        },
      ]}
    >
      <Column gap="lg">
        <Text class="body">
          <Trans>
            Playing this here loads a player from {props.provider}. To do that,
            your browser has to contact them directly.
          </Trans>
        </Text>

        <Column gap="sm">
          <Text class="label">
            <Trans>What {props.provider} receives</Trans>
          </Text>
          <Text class="body">
            <Trans>
              Your IP address, your browser and language, and which item you
              played. We block the rest: they are not told which community you
              came from, and their cookies are blocked, so a {props.provider}
              account you are signed in to is not connected to you being here.
            </Trans>
          </Text>
        </Column>

        <Text class="body">
          <Trans>
            Your IP address cannot be hidden — the player has to be fetched from
            somewhere. If you would rather they saw nothing at all from this
            page, use "Open in your own browser" instead.
          </Trans>
        </Text>

        <Checkbox
          checked={remember()}
          onChange={() => setRemember((v) => !v)}
        >
          <Trans>Remember this for {props.provider}</Trans>
        </Checkbox>

        <Text class="label">
          <Trans>
            This only covers {props.provider}. You will be asked separately for
            any other service, and you can change your mind in Settings.
          </Trans>
        </Text>
      </Column>
    </Dialog>
  );
}
