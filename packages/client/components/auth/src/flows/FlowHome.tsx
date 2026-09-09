import {
  Match,
  Show,
  Switch,
  createMemo,
  createResource,
  untrack,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { PublicChannelInvite, ServerPublicInvite } from "stoat.js";
import { css } from "styled-system/css";

import { useClient, useClientLifecycle } from "@revolt/client";
import { TransitionType } from "@revolt/client/Controller";
import { Navigate } from "@revolt/routing";
import { Avatar, Button, Column, LinkButton } from "@revolt/ui";

import { useState } from "@revolt/state";
import nacIcon from "../../../../scripts/assets_fallback/web/android-chrome-192x192.png";

/**
 * Flow for logging into an account
 *
 * When an invite link (/invite/:code) bounces an unauthenticated visitor to
 * /login, Interface's own effect (src/Interface.tsx) has already stored that
 * path as `layout.nextPath` — the <Show when={isLoggedIn()}> below picks it
 * back up via popNextPath() once the user logs in or creates an account. See
 * src/index.tsx's InviteRedirect for the full explanation.
 *
 * Registration additionally needs the invite CODE itself, not just the return
 * path: the server is invite-gated, so account creation submits the code for
 * validation. That's why the Create Account link below is built from the
 * pending invite rather than pointing at a bare /login/create.
 */
export default function FlowHome() {
  const state = useState();
  const getClient = useClient();
  const { lifecycle, isLoggedIn, isError } = useClientLifecycle();

  /**
   * Invite code this visitor arrived with, if any.
   *
   * Read via peekNextPath() — deliberately NOT popNextPath(), which would
   * consume the path that the post-login redirect above depends on.
   */
  const inviteCode = createMemo(
    () => state.layout.peekNextPath()?.match(/^\/invite\/([^/?#]+)/)?.[1],
  );

  /**
   * Public details for that invite (server name, icon, member count, inviter).
   * `GET /invites/:code` is unauthenticated, so this works before the visitor
   * has an account. A Discord user expects "you've been invited to join X"
   * with proof — not a bare marketing card. See BUG_BASH_2026-09-09 #3.
   */
  const [invite] = createResource(
    inviteCode,
    async (code) => {
      const data = await getClient().api.get(`/invites/${code}` as never);
      const parsed = PublicChannelInvite.from(getClient(), data as never);
      return parsed instanceof ServerPublicInvite ? parsed : undefined;
    },
  );

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
   * it clears, triggering a second self-inflicted run that found nextPath
   * already empty and fell back to "/app" before the router ever acted on
   * the first (correct) value. untrack() stops that read from registering
   * as a dependency. See FlowLogin.tsx (same fix, same root cause) and
   * nac-web#44 -- this is the actual fix for the bug this comment block
   * already thought it had fixed.
   */
  const redirectTarget = createMemo(() =>
    isLoggedIn() ? untrack(() => state.layout.popNextPath()) ?? "/app" : undefined,
  );

  return (
    <Switch
      fallback={
        <>
          <Show when={redirectTarget()}>
            <Navigate href={redirectTarget()!} />
          </Show>

          <Column gap="xl">
            <Show
              when={invite()}
              fallback={
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
              }
            >
              <div class={css({ margin: "auto" })}>
                <Avatar
                  size={96}
                  src={invite()!.serverIcon?.previewUrl}
                  fallback={invite()!.serverName}
                />
              </div>
            </Show>

            <Column>
              <Show
                when={invite()}
                fallback={
                  <>
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
                      A private community of Jesus Followers built around
                      naturism and authentic human connection.
                    </span>
                  </>
                }
              >
                <span
                  style={{ "text-align": "center", opacity: "0.6" }}
                  class="label"
                >
                  <Trans>You've been invited to join</Trans>
                </span>
                <b
                  style={{
                    "font-weight": 800,
                    "font-size": "1.4em",
                    "text-align": "center",
                  }}
                >
                  {invite()!.serverName}
                </b>
                <span style={{ "text-align": "center", opacity: "0.5" }}>
                  <Trans>
                    {invite()!.memberCount.toLocaleString()} members
                  </Trans>
                  <Show when={invite()!.userName}>
                    {" · "}
                    <Trans>invited by {invite()!.userName}</Trans>
                  </Show>
                </span>
              </Show>
            </Column>

            <Column>
              {/*
                NAC is invite-only: registration is possible only through an
                invite link, so Create Account is shown solely to visitors who
                arrived with one. Anyone landing on /login directly gets Log In
                alone. The server enforces this independently (authifier
                `invite_only`) — hiding the button stops people ending up on a
                form they can't complete, it is not the access control itself.
              */}
              <Show when={inviteCode()}>
                <LinkButton href={`/login/create/${inviteCode()}`} variant="filled">
                  <Trans>Create Account</Trans>
                </LinkButton>
              </Show>
              <LinkButton
                href="/login/auth"
                variant={inviteCode() ? "outlined" : "filled"}
              >
                <Trans>Log In</Trans>
              </LinkButton>
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
