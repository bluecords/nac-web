import { createFormControl, createFormGroup } from "solid-forms";
import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { styled } from "styled-system/jsx";

import { useUser } from "@revolt/client";
import { Column, Dialog, DialogProps, Form2, Text } from "@revolt/ui";

import { useModals } from "..";
import { Modals } from "../types";

const SPONSOR_CHECKOUT_WEBHOOK =
  "https://automate.bluecords.solutions/webhook/sponsor-checkout";

type Tier = "2_99" | "9_99" | "gift";

const TIERS: { id: Tier; name: string; blurb: string }[] = [
  {
    id: "2_99",
    name: "Sponsor — $2.99/mo",
    blurb: "Longer text posts",
  },
  {
    id: "9_99",
    name: "Sustainer — $9.99/mo",
    blurb: "All Sponsor perks + even longer posts",
  },
  {
    id: "gift",
    name: "One-time gift",
    blurb: "$10 = 1 month of Sustainer perks",
  },
];

/**
 * Pick a sponsorship tier and start FossBilling checkout
 */
export function SponsorNacModal(
  props: DialogProps & Modals & { type: "sponsor_nac" },
) {
  const { t } = useLingui();
  const { showError } = useModals();
  const user = useUser();

  const [tier, setTier] = createSignal<Tier>("2_99");
  const [isSubmitting, setSubmitting] = createSignal(false);

  const group = createFormGroup({
    amount: createFormControl("50", { required: false }),
  });

  const canSubmit = createMemo(() => {
    if (tier() !== "gift") return true;
    const amount = parseFloat(group.controls.amount.value);
    return amount > 0;
  });

  async function onSubmit() {
    setSubmitting(true);
    try {
      const response = await fetch(SPONSOR_CHECKOUT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nac_user_id: user()!.id,
          tier: tier(),
          ...(tier() === "gift" && {
            amount: parseFloat(group.controls.amount.value),
          }),
        }),
      });

      if (!response.ok) throw new Error(`Checkout failed (${response.status})`);

      const data: { checkout_url: string } = await response.json();
      window.open(data.checkout_url, "_blank");
      props.onClose();
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Sponsor NAC</Trans>}
      actions={[
        { text: <Trans>Cancel</Trans> },
        {
          text: <Trans>Continue</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !canSubmit(),
        },
      ]}
      isDisabled={isSubmitting()}
    >
      <Column gap="md">
        <For each={TIERS}>
          {(option) => (
            <TierCard
              style={{
                "border-color":
                  tier() === option.id
                    ? "var(--md-sys-color-tertiary)"
                    : "var(--md-sys-color-outline-variant)",
                background:
                  tier() === option.id
                    ? "var(--md-sys-color-surface-container-high)"
                    : "transparent",
              }}
              onClick={() => setTier(option.id)}
            >
              <Text>{option.name}</Text>
              <Text class="label">{option.blurb}</Text>
            </TierCard>
          )}
        </For>

        <Show when={tier() === "gift"}>
          <Form2.TextField
            name="amount"
            type="number"
            control={group.controls.amount}
            label={t`Amount (USD)`}
            placeholder={t`50`}
          />
        </Show>
      </Column>
    </Dialog>
  );
}

const TierCard = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    cursor: "pointer",
    borderWidth: "1.5px",
    borderStyle: "solid",
  },
});
