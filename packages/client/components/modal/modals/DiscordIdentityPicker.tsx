import { For, Show, createSignal, onCleanup } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import type { DiscordMemberSuggestion } from "stoat.js";

import { useClient } from "@revolt/client";
import { Checkbox, Column, Row, Text, TextField } from "@revolt/ui";

/**
 * How long to wait after the last keystroke before asking the server.
 *
 * The search is a real database query behind a ratelimit bucket, so a request
 * per character is both slow and rude. 250ms is short enough that it still
 * feels like typing.
 */
const DEBOUNCE_MS = 250;

/** Results shown at once. The server caps this at 50 regardless. */
const PAGE_SIZE = 8;

interface Props {
  /** The account the member has picked, if any */
  selected: DiscordMemberSuggestion | undefined;
  /** Called when they pick one, or clear their pick */
  onSelect: (member: DiscordMemberSuggestion | undefined) => void;
  /** Whether they have said they were never on Discord */
  skipped: boolean;
  /** Called when they tick or untick that */
  onSkip: (skipped: boolean) => void;
  /** A claim they made previously, which they cannot change here */
  confirmedName?: string;
}

/**
 * "Which account is yours on Discord?"
 *
 * WHY THIS EXISTS
 * ---------------
 * Every message migrated from Discord is posted by the bot wearing the original
 * author's name as a masquerade. Good enough to read, and wrong in three ways:
 * the member cannot edit or delete their own history, a data-erasure request
 * cannot find it, and their reactions have nowhere to go. All three need one
 * thing - which NAC account is which Discord account.
 *
 * `[RULED BY BUNJIE]` 2026-09-06: "everyone is going to get prompted on the
 * first login to provide their user info from Discord so we can confirm match
 * then." This is that prompt.
 *
 * WHY IT IS A LIST AND NOT A TEXT BOX
 * -----------------------------------
 * A typed name cannot be matched reliably, and cannot be shown back to an admin
 * as the thing they are confirming. Every option here is a real Discord account
 * from the snapshot, and the value sent to the server is its id.
 *
 * WHY THE SEARCH IS SERVER-SIDE
 * -----------------------------
 * `[RULED BY BUNJIE]`: "some groups have thousands. That would be a nightmare."
 * Fetching the whole roster and filtering it in the browser works at 130 people
 * and dies at 3,000 - and the same screen has to serve a white-label tenant
 * that size.
 */
export function DiscordIdentityPicker(props: Props) {
  const client = useClient();

  const [term, setTerm] = createSignal("");
  const [results, setResults] = createSignal<DiscordMemberSuggestion[]>([]);
  const [total, setTotal] = createSignal(0);
  const [searching, setSearching] = createSignal(false);
  const [searched, setSearched] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  let timer: number | undefined;
  // Every request carries a sequence number and a late reply for an older one
  // is dropped. Without this, a slow response for "bu" can land after the
  // response for "bunjie" and silently replace the right answer with a stale
  // one - the classic search-as-you-type bug, and invisible when it happens.
  let sequence = 0;

  onCleanup(() => clearTimeout(timer));

  async function run(query: string, forRequest: number) {
    try {
      setSearching(true);
      const page = await client().searchDiscordMembers(query, {
        limit: PAGE_SIZE,
      });

      if (forRequest !== sequence) return;
      setResults(page.items);
      setTotal(page.total);
      setFailed(false);
    } catch {
      if (forRequest !== sequence) return;
      // Say so rather than showing an empty list. "No results" and "the search
      // is broken" look identical otherwise, and one of them means a member
      // gives up on a name that is really there.
      setResults([]);
      setTotal(0);
      setFailed(true);
    } finally {
      if (forRequest === sequence) {
        setSearching(false);
        setSearched(true);
      }
    }
  }

  function onInput(value: string) {
    setTerm(value);
    clearTimeout(timer);

    if (value.trim().length === 0) {
      sequence++;
      setResults([]);
      setTotal(0);
      setSearched(false);
      setSearching(false);
      return;
    }

    const forRequest = ++sequence;
    timer = setTimeout(
      () => run(value.trim(), forRequest),
      DEBOUNCE_MS,
    ) as never;
  }

  /** The name a member would recognise themselves by. */
  function label(member: DiscordMemberSuggestion) {
    const shown = member.nickname ?? member.display_name;
    return shown && shown !== member.username
      ? `${shown} (${member.username})`
      : member.username;
  }

  return (
    <Column gap="md">
      <Text class="label">
        <Trans>Which account is yours on Discord?</Trans>
      </Text>

      <Text class="label">
        <Trans>
          Your posts from Discord are here, but they are still filed under the
          bot. Once an admin confirms this, they become yours — you can edit and
          delete them, and your reactions come back.
        </Trans>
      </Text>

      {/* Somebody an admin has already confirmed is not asked again. Changing a
          confirmed link can move real posts between accounts, so it is an admin
          action, not a picker on a signup screen. */}
      <Show
        when={!props.confirmedName}
        fallback={
          <Text class="body">
            <Trans>
              Already linked to your Discord account. Ask an admin if this is
              wrong.
            </Trans>{" "}
            <strong>{props.confirmedName}</strong>
          </Text>
        }
      >
        <Show
          when={!props.selected}
          fallback={
            <Row gap="md" align>
              <Text class="body">
                <strong>{props.selected && label(props.selected)}</strong>
              </Text>
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  props.onSelect(undefined);
                }}
              >
                <Text class="label">
                  <Trans>Choose a different one</Trans>
                </Text>
              </a>
            </Row>
          }
        >
          <Column gap="sm">
            <TextField
              type="search"
              variant="outlined"
              autocomplete="off"
              disabled={props.skipped}
              label="Search your Discord name"
              value={term()}
              onInput={(event) =>
                onInput((event.currentTarget as HTMLInputElement).value)
              }
            />

            <Show when={failed()}>
              <Text class="label">
                <Trans>
                  The name search is not answering. Skip this for now — an admin
                  can link your account later.
                </Trans>
              </Text>
            </Show>

            <Show when={searching()}>
              <Text class="label">
                <Trans>Searching…</Trans>
              </Text>
            </Show>

            <Show when={!searching() && searched() && results().length === 0}>
              <Text class="label">
                <Trans>
                  No Discord names match that. Try part of the name instead.
                </Trans>
              </Text>
            </Show>

            <For each={results()}>
              {(member) => (
                <Row gap="md" align>
                  <button
                    type="button"
                    disabled={member.claimed}
                    onClick={() => props.onSelect(member)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px 0",
                      cursor: member.claimed ? "default" : "pointer",
                      "text-align": "left",
                      opacity: member.claimed ? 0.5 : 1,
                      color: "inherit",
                      font: "inherit",
                    }}
                  >
                    <Text class="body">{label(member)}</Text>
                  </button>
                  {/* Shown in the list rather than after pressing Continue:
                      two people reaching for the same name is a real thing that
                      needs an admin, and it should be visible when it happens. */}
                  <Show when={member.claimed}>
                    <Text class="label">
                      <Trans>already claimed</Trans>
                    </Text>
                  </Show>
                </Row>
              )}
            </For>

            <Show when={total() > results().length}>
              <Text class="label">
                <Trans>
                  Showing the closest matches. Type more of your name to narrow
                  it down.
                </Trans>
              </Text>
            </Show>
          </Column>
        </Show>

        {/* The escape hatch is deliberate. Not everybody here came from
            Discord, and a member who cannot find their name must not be
            trapped on a screen that blocks the whole app. An admin can link
            them later - nothing is lost, it just is not automatic. */}
        <Row gap="md">
          <div style={{ "align-self": "flex-start" }}>
            <Checkbox
              checked={props.skipped}
              onChange={() => props.onSkip(!props.skipped)}
            />
          </div>
          <div
            style={{ cursor: "pointer" }}
            onClick={() => props.onSkip(!props.skipped)}
          >
            <Text class="body">
              <Trans>
                I was never in the NAC Discord, or I cannot find my name.
              </Trans>
            </Text>
          </div>
        </Row>
      </Show>
    </Column>
  );
}
