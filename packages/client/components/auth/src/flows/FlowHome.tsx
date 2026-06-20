import { Match, Show, Switch, createMemo } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { css } from "styled-system/css";

import { useClientLifecycle } from "@revolt/client";
import { TransitionType } from "@revolt/client/Controller";
import { Navigate } from "@revolt/routing";
import { Button, Column } from "@revolt/ui";

import { useState } from "@revolt/state";
import nacIcon from "../../../../scripts/assets_fallback/web/android-chrome-192x192.png";

/**
 * Flow for logging into an account
 *
 * Note: no special invite-code handling is needed here. When an invite link
 * (/invite/:code) bounces an unauthenticated visitor to /login, Interface's
 * own effect (src/Interface.tsx) has already stored that path as
 * `layout.nextPath` — the <Show when={isLoggedIn()}> below picks it back up
 * via popNextPath() once the user logs in or creates an account. See
 * src/index.tsx's InviteRedirect for the full explanation.
 */
export default function FlowHome() {
  const state = useState();
  const { lifecycle, isLoggedIn, isError } = useClientLifecycle();

  /**
   * Where to redirect once logged in — popped exactly once, memoized on the
   * isLoggedIn() transition. popNextPath() destructively clears the stored
   * path as a side effect of reading it; calling it inline in a JSX prop
   * (the previous code) let Solid re-evaluate it more than once, so a
   * second read came back undefined (already cleared) and silently fell
   * back to "/app" — losing the original destination (e.g. an invite link)
   * even though the user was correctly routed back here to resume it.
   */
  const redirectTarget = createMemo(() =>
    isLoggedIn() ? state.layout.popNextPath() ?? "/app" : undefined,
  );

  return (
    <Switch
      fallback={
        <>
          <Show when={redirectTarget()}>
            <Navigate href={redirectTarget()!} />
          </Show>

          <Column gap="xl">
            <img
              src={nacIcon}
              alt="NAC"
              class={css({
                width: "96px",
                height: "96px",
                margin: "auto",
                borderRadius: "20px",
              })}
            />

            <Column>
              <b
                style={{
                  "font-weight": 800,
                  "font-size": "1.4em",
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "text-align": "center",
                }}
              >
                <span>NAC — Naked as Created</span>
              </b>
              <span style={{ "text-align": "center", opacity: "0.5" }}>
                A private community of Jesus Followers built around naturism and
                authentic human connection.
              </span>
            </Column>

            <Column>
              <a href="/login/auth">
                <Column>
                  <Button>
                    <Trans>Log In</Trans>
                  </Button>
                </Column>
              </a>
              <a href="/login/create">
                <Column>
                  <Button variant="plain">
                    <Trans>Create Account</Trans>
                  </Button>
                </Column>
              </a>
            </Column>
          </Column>
        </>
      }
    >
      <Match when={isError()}>
        <Switch fallback={"an unknown error occurred"}>
          <Match when={lifecycle.permanentError === "InvalidSession"}>
            <h1>
              <Trans>You were logged out!</Trans>
            </h1>
          </Match>
        </Switch>

        <Button
          variant="filled"
          onPress={() =>
            lifecycle.transition({
              type: TransitionType.Dismiss,
            })
          }
        >
          <Trans>OK</Trans>
        </Button>
      </Match>
    </Switch>
  );
}
