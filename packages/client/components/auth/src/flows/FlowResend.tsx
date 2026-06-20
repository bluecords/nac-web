import { Trans } from "@lingui-solid/solid/macro";

import { useApi, useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { Navigate, useNavigate } from "@revolt/routing";
import { Button } from "@revolt/ui";
import { Show } from "solid-js";

import { FlowTitle } from "./Flow";
import { setFlowCheckEmail } from "./FlowCheck";
import { Fields, Form } from "./Form";

/**
 * Flow for resending email verification
 */
export default function FlowResend() {
  const api = useApi();
  const navigate = useNavigate();
  const getClient = useClient();

  /**
   * Resend email verification
   * @param data Form Data
   */
  async function resend(data: FormData) {
    const email = data.get("email") as string;
    const captcha = data.get("captcha") as string;

    await api.post("/auth/account/reverify", {
      email,
      captcha,
    });

    setFlowCheckEmail(email);
    navigate("/login/check", { replace: true });
  }

  return (
    <Show
      when={getClient().configuration?.features.email}
      fallback={<Navigate href="/login/auth" />}
    >
      <FlowTitle>
        <Trans>Resend verification</Trans>
      </FlowTitle>
      <Form onSubmit={resend} captcha={CONFIGURATION.HCAPTCHA_SITEKEY}>
        <Fields fields={["email"]} />
        <Button type="submit">
          <Trans>Resend</Trans>
        </Button>
      </Form>
      <a href="/login/auth">
        <Button variant="text">
          <Trans>Go back to login</Trans>
        </Button>
      </a>
    </Show>
  );
}
