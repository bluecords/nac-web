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
 * The IP line is not a disclaimer, it is the honest limit: the address cannot
 * be masked, short of proxying the video through our own box, which is not
 * viable for YouTube on bandwidth or terms and would make NAC the requester
 * instead. Saying so is better than implying a protection that does not exist.
 *
 * The same goes for the rest of the list. The player is NOT locked down after
 * the member agrees (it used to be, and the players did not work - see
 * SpecialEmbed), so the wording says what the provider really receives:
 * including that the member is on NAC, and that cookies they already have with
 * the provider work as usual. The private route stays offered: opening the link
 * yourself sends nothing from here and is not tied to this community.
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
              Your IP address, your browser and language, which item you
              played, and that you played it from NAC. Cookies you already
              have with {props.provider} work as usual, so if you are signed in
              to a {props.provider} account, they may be able to connect it to
              you watching this.
            </Trans>
          </Text>
        </Column>

        <Text class="body">
          <Trans>
            Your IP address cannot be hidden — the player has to be fetched from
            somewhere. If you would rather they were not told you came from
            NAC, use "Open in your own browser" instead.
          </Trans>
        </Text>

        <Checkbox
          checked={remember()}
          onChange={() => setRemember((v) => !v)}
        >
          <Trans>
            Remember this for {props.provider}: load its players without asking
            from now on
          </Trans>
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
