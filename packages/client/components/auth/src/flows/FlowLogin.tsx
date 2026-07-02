import { Match, Show, Switch, createMemo, untrack } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";

import { useClient, useClientLifecycle } from "@revolt/client";
import { State, TransitionType } from "@revolt/client/Controller";
import { useModals } from "@revolt/modal";
import { Navigate } from "@revolt/routing";
import {
  Button,
  CircularProgress,
  Column,
  LinkButton,
  Row,
  SubmitButton,
  Text,
  iconSize,
} from "@revolt/ui";

import MdArrowBack from "@material-design-icons/svg/filled/arrow_back.svg?component-solid";

import { useState } from "@revolt/state";
import { FlowTitle } from "./Flow";
import { Fields, Form } from "./Form";

/**
 * Flow for logging into an account
 */
export default function FlowLogin() {
  const state = useState();
  const modals = useModals();
  const getClient = useClient();
  const { lifecycle, isLoggedIn, login, selectUsername } = useClientLifecycle();

  /**
   * Whether the server has email enabled (SMTP configured).
   * Reset/resend flows are dead ends without it, so we hide the links.
   */
  const emailEnabled = () => getClient().configuration?.features.email;

  /**
   * Where to redirect once logged in — popped exactly once, memoized on the
   * isLoggedIn() transition. popNextPath() destructively clears the stored
   * path as a side effect of reading it; calling it inline in a JSX prop
   * (the previous code) let Solid re-evaluate it more than once, so a
   * second read came back undefined (already cleared) and silently fell
   * back to "/app" — losing the original destination (e.g. an invite link)
   * even though the user was correctly routed back here to resume it.
   *
   * Wrapping in createMemo() was not enough on its own: popNextPath() reads
   * state.layout.nextPath, and a read inside a memo's computation IS a
   * tracked dependency -- so the memo ended up depending on the very value
   * it clears. The first run pops the real destination and clears
   * nextPath; that clear immediately invalidates the memo (nextPath
   * changed), triggering a second run before the router ever acts on the
   * first value, which now finds nextPath already empty and falls back to
   * "/app" -- silently overwriting the correct navigation. untrack() stops
   * the read inside popNextPath() from registering as a dependency, so the
   * memo only re-runs when isLoggedIn() itself changes, not as a side
   * effect of its own pop. Confirmed via live repro (brand-new account
   * through an invite link landed at /app every time) before this fix and
   * fixed after. See nac-web#44.
   */
  const redirectTarget = createMemo(() =>
    isLoggedIn() ? untrack(() => state.layout.popNextPath()) ?? "/app" : undefined,
  );

  /**
   * Log into account
   * @param data Form Data
   */
  async function performLogin(data: FormData) {
    const email = data.get("email") as string;
    const password = data.get("password") as string;

    if (!email || !password) return;

    await login(
      {
        email,
        password,
      },
      modals,
    );
  }

  /**
   * Select a new username
   * @param data Form Data
   */
  async function select(data: FormData) {
    const username = data.get("username") as string;
    await selectUsername(username);
  }

  return (
    <>
      <Switch
        fallback={
          <>
            <FlowTitle subtitle={<Trans>Sign into NAC</Trans>} emoji="wave">
              <Trans>Welcome!</Trans>
            </FlowTitle>
            <Form onSubmit={performLogin}>
              <Fields fields={["email", "password"]} />
              <Show when={emailEnabled()}>
                <Column gap="xl" align>
                  <a href="/login/reset">
                    <Button variant="text">
                      <Trans>Reset password</Trans>
                    </Button>
                  </a>
                  <a href="/login/resend">
                    <Button variant="text">
                      <Trans>Resend verification</Trans>
                    </Button>
                  </a>
                </Column>
              </Show>
              <Row align justify>
                <LinkButton href=".." variant="text">
                  <MdArrowBack {...iconSize("1.2em")} /> <Trans>Back</Trans>
                </LinkButton>
                <SubmitButton>
                  <Trans>Login</Trans>
                </SubmitButton>
              </Row>
            </Form>
          </>
        }
      >
        <Match when={redirectTarget()}>
          <Navigate href={redirectTarget()!} />
        </Match>
        <Match when={lifecycle.state() === State.LoggingIn}>
          <CircularProgress />
        </Match>
        <Match when={lifecycle.state() === State.Onboarding}>
          <FlowTitle>
            <Trans>Choose a username</Trans>
          </FlowTitle>

          <Text>
            <Trans>
              Pick a username that you want people to be able to find you by.
              This can be changed later in your user settings.
            </Trans>
          </Text>

          <Form onSubmit={select}>
            <Fields fields={["username"]} />
            <Row align justify>
              <Button
                variant="text"
                onPress={() =>
                  lifecycle.transition({
                    type: TransitionType.Cancel,
                  })
                }
              >
                <MdArrowBack {...iconSize("1.2em")} /> <Trans>Cancel</Trans>
              </Button>
              <SubmitButton>
                <Trans>Confirm</Trans>
              </SubmitButton>
            </Row>
          </Form>
        </Match>
      </Switch>
    </>
  );
}
