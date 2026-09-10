import { Trans } from "@lingui-solid/solid/macro";

import { useApi, useClient, useClientLifecycle } from "@revolt/client";
import { CONFIGURATION, rememberPendingInvite } from "@revolt/common";
import { useModals } from "@revolt/modal";
import { useNavigate, useParams } from "@revolt/routing";
import {
  Column,
  LinkButton,
  Row,
  SubmitButton,
  Text,
  iconSize,
} from "@revolt/ui";

import MdArrowBack from "@material-design-icons/svg/filled/arrow_back.svg?component-solid";

import { Show, createSignal } from "solid-js";

import { FlowTitle } from "./Flow";
import { setFlowCheckEmail } from "./FlowCheck";
import { emailIsBroken, suggestEmail } from "./emailSanity";
import { Fields, Form } from "./Form";

/**
 * Flow for creating a new account
 */
export default function FlowCreate() {
  const api = useApi();
  const getClient = useClient();
  const navigate = useNavigate();
  const { code } = useParams();
  const modals = useModals();
  const { login } = useClientLifecycle();

  /**
   * An address the user has explicitly confirmed despite a "did you mean …"
   * suggestion. Lets a real (but unusual-looking) address through on the
   * second submit without nagging forever.
   */
  const [confirmedEmail, setConfirmedEmail] = createSignal<string>();

  /**
   * Create an account
   * @param data Form Data
   */
  async function create(data: FormData) {
    const email = (data.get("email") as string)?.trim();
    const password = data.get("new-password") as string;
    const confirm = data.get("confirm-password") as string;
    const captcha = data.get("captcha") as string;
    const invite = data.get("invite") as string;

    // Invite-only + emailed verification means a mistyped password here is a
    // locked-out member who has to run the reset flow. Catch it before submit.
    if (confirm != null && password !== confirm) {
      throw new Error("Those passwords don't match.");
    }

    // An unverifiable address here means a permanently-stuck Pending account
    // with no self-serve recovery — block it before the account exists.
    if (emailIsBroken(email)) {
      throw new Error(
        `"${email}" doesn't look like it can receive mail — check the part after the "@" (for example ".comcom" should be ".com").`,
      );
    }

    if (email !== confirmedEmail()) {
      const suggestion = suggestEmail(email);
      if (suggestion) {
        setConfirmedEmail(email);
        throw new Error(
          `Did you mean ${suggestion}? If ${email} is correct, press Register again.`,
        );
      }
    }

    await api.post("/auth/account/create", {
      email,
      password,
      captcha,
      ...(invite ? { invite } : {}),
    });

    // Stash the invite so the join still happens if verification completes in a
    // different tab/browser and the in-memory nextPath is lost. See
    // resumePendingInvite.ts — this is the capture point where the code is
    // certain (they just submitted it).
    rememberPendingInvite(invite || code);

    const client = getClient();
    if (client.configuration && !client.configuration.features.email) {
      await login(
        {
          email,
          password,
        },
        modals,
      );
      navigate("/login/auth", { replace: true });
    } else {
      setFlowCheckEmail(email);
      navigate("/login/check", { replace: true });
    }
  }

  const isInviteOnly = () => {
    const client = getClient();
    if (client.configured()) {
      return client.configuration?.features.invite_only;
    }
    return false;
  };

  /**
   * NAC is invite-only and the code rides in the URL (`/login/create/:code`),
   * put there by the invite-link → /login → "Create Account" chain. If someone
   * reaches this page without it (a bookmarked/shared bare URL, a lost
   * `nextPath`), submitting just earns a server rejection they can't fix.
   * Several real people hit exactly this on migration eve — tell them plainly
   * what they need instead of showing a form that can't succeed.
   */
  const missingInvite = () => isInviteOnly() && !code;

  return (
    <>
      <FlowTitle subtitle={<Trans>Create an account</Trans>} emoji="wave">
        <Trans>Hello!</Trans>
      </FlowTitle>

      <Show when={missingInvite()}>
        <Column gap="lg">
          <Text class="label">
            <Trans>
              NAC is invite-only. To create an account, open the invite link you
              were sent — it carries the code you need. If you already have an
              account, log in instead.
            </Trans>
          </Text>
          <Column gap="sm">
            <LinkButton href="/login/auth" variant="filled">
              <Trans>Log In</Trans>
            </LinkButton>
            <LinkButton href=".." variant="text">
              <MdArrowBack {...iconSize("1.2em")} /> <Trans>Back</Trans>
            </LinkButton>
          </Column>
        </Column>
      </Show>

      <Show when={!missingInvite()}>
        <Form onSubmit={create} captcha={CONFIGURATION.HCAPTCHA_SITEKEY}>
        <Fields fields={["email", "new-password", "confirm-password"]} />
        <Show when={isInviteOnly()}>
          <Fields fields={[{ field: "invite", value: code }]} />
        </Show>
        <Text class="label" size="small">
          <Trans>By registering you agree to our</Trans>{" "}
          <a href="https://terms.nac.social" target="_blank" rel="noreferrer">
            <Trans>Terms of Service</Trans>
          </a>{" "}
          <Trans>and</Trans>{" "}
          <a href="https://privacy.nac.social" target="_blank" rel="noreferrer">
            <Trans>Privacy Policy</Trans>
          </a>
          .
        </Text>
          <Row justify>
            <LinkButton href=".." variant="text">
              <MdArrowBack {...iconSize("1.2em")} /> <Trans>Back</Trans>
            </LinkButton>
            <SubmitButton>
              <Trans>Register</Trans>
            </SubmitButton>
          </Row>
        </Form>
      </Show>
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            background: "white",
            color: "black",
            cursor: "pointer",
          }}
          onClick={() => {
            setFlowCheckEmail("test@nac.social");
            navigate("/login/check", { replace: true });
          }}
        >
          Mock Submission
        </div>
      )}
    </>
  );
}
