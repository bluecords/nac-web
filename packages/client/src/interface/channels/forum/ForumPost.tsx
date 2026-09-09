import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Channel, Message } from "stoat.js";
import { styled } from "styled-system/jsx";

import { Message as MessageView } from "@revolt/app";
import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { Button, IconButton, Text } from "@revolt/ui";

import { MessageComposition } from "../text/Composition";

import { fetchAllMessages } from "./fetchAllMessages";

import MdArrowBack from "@material-design-icons/svg/outlined/arrow_back.svg?component-solid";

interface Props {
  channel: Channel;
  postId: string;
  /**
   * A reply within this post to scroll to and flash - set when the reader
   * arrived via a deep link or a notification pointing at that reply.
   */
  highlightMessageId?: string;
  onBack: () => void;
}

/**
 * Single forum post: the root message plus its flat list of replies.
 *
 * The post and every reply render through the shared `<Message>` view, and the
 * reply box is the shared `<MessageComposition>` - so timestamps, edit with
 * autocomplete, embeds, badges, attachments, drag/paste, GIF and emoji pickers,
 * slowmode and Enter-to-send all behave exactly as they do in a text channel.
 * The forum only adds what is genuinely forum-specific: the title, the tag row,
 * and the "mark as solution" control.
 */
export function ForumPost(props: Props) {
  const client = useClient();
  const state = useState();
  const { showError } = useModals();

  // Tag editing for the root post. The author picks from the channel's
  // allowed_tags; saved via message.edit({ forum_tags }).
  const [editingTags, setEditingTags] = createSignal(false);
  const [tagDraft, setTagDraft] = createSignal<Set<string>>(new Set());

  // The channel's allowed_tags, fetched directly rather than trusted from
  // `props.channel.allowedTags`. The Ready payload carries the field but
  // `ChannelCollection` returns cached channels without re-hydrating it, so on
  // a reconnect / partial the "Edit tags" button silently never appears on a
  // channel whose tags the server has (Bunjie hit exactly this, repeatedly —
  // BUG_BASH_2026-09-09 #5). Owning the fetch here decouples post tagging from
  // that race; the result is also written back to the store so the channel
  // settings picker and CreateForumPost heal too. On failure we warn (not a
  // silent catch) and fall back to whatever is cached.
  const [fetchedTags] = createResource(
    () => props.channel.id,
    async (id) => {
      if (props.channel.type !== "ForumChannel") return undefined;
      try {
        const data = (await client().api.get(
          `/channels/${id as ""}`,
        )) as unknown as { allowed_tags?: string[] };
        const tags = data.allowed_tags ?? [];
        if (
          JSON.stringify(tags) !==
          JSON.stringify(props.channel.allowedTags ?? [])
        ) {
          client().channels.updateUnderlyingObject(id, "allowedTags", tags);
        }
        return tags;
      } catch (err) {
        console.warn(
          "[ForumPost] could not fetch allowed_tags for channel",
          id,
          err,
        );
        return undefined;
      }
    },
  );

  /** Best available allowed_tags: freshly fetched, else whatever is cached. */
  const allowedTags = () => fetchedTags() ?? props.channel.allowedTags ?? [];

  function startEditTags(post: Message) {
    setTagDraft(new Set(post.forumTags ?? []));
    setEditingTags(true);
  }

  function toggleTag(tag: string) {
    setTagDraft((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function saveTags(post: Message) {
    try {
      // forum_tags isn't in stoat-api's DataEditMessage type yet, but is sent
      // over the wire and handled by the backend. TODO: drop the local field
      // once stoat-api is regenerated from a release with it (nac-server#10).
      const data: Parameters<Message["edit"]>[0] & { forum_tags?: string[] } = {
        forum_tags: [...tagDraft()],
      };
      await post.edit(data);
      setEditingTags(false);
    } catch (error) {
      showError(error);
    }
  }

  const [post] = createResource(
    () => props.postId,
    (id) => props.channel.fetchMessage(id),
  );

  // Replies to this post, kept live via the gateway. Seeded from a full fetch
  // (a reply is any message pointing at this post), then patched on
  // messageCreate/messageDelete - the same idiom the text-channel view uses.
  // Ordered oldest-first (fetch returns newest-first, so reverse); new replies
  // append at the end. Content edits and solution mark/unmark reflect
  // reactively because the Message objects are reactive.
  const [replies, setReplies] = createSignal<Message[]>([]);

  async function reloadReplies() {
    const messages = await fetchAllMessages(props.channel);
    setReplies(
      messages
        .filter((message) => message.replyIds?.includes(props.postId))
        .reverse(),
    );
  }

  createEffect(
    on(
      () => props.postId,
      (id) => {
        setReplies([]);
        // Reply chips are stored per CHANNEL but only mean anything within one
        // post, so a target picked in another post must not follow the reader
        // here. The root post is re-attached at send time by the composer's
        // `forcedReplyId`, so it does not need to live in the draft.
        state.draft.setDraft(props.channel.id, (data) => ({
          ...data,
          replies: [],
        }));
        setEditingTags(false);
        let cancelled = false;
        fetchAllMessages(props.channel)
          .then((messages) => {
            if (cancelled) return;
            setReplies(
              messages
                .filter((message) => message.replyIds?.includes(id))
                .reverse(),
            );
          })
          .catch(() => {});
        onCleanup(() => {
          cancelled = true;
        });
      },
    ),
  );

  function onMessageCreate(message: Message) {
    if (message.channelId !== props.channel.id) return;
    if (!message.replyIds?.includes(props.postId)) return;
    setReplies((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message],
    );
  }

  function onMessageDelete(message: { id: string; channelId: string }) {
    if (message.channelId !== props.channel.id) return;
    // The post itself was deleted remotely - leave the (now empty) post view.
    if (message.id === props.postId) {
      props.onBack();
      return;
    }
    setReplies((prev) => prev.filter((m) => m.id !== message.id));
  }

  onMount(() => {
    const c = client();
    c.addListener("messageCreate", onMessageCreate);
    c.addListener("messageDelete", onMessageDelete);
  });

  onCleanup(() => {
    const c = client();
    c.removeListener("messageCreate", onMessageCreate);
    c.removeListener("messageDelete", onMessageDelete);
  });

  // Scroll a deep-linked reply into view once it is in the list. `<Message>`
  // stamps the message id onto its container element, and the `highlight` prop
  // below flashes it.
  createEffect(
    on([() => props.highlightMessageId, replies], ([id, list]) => {
      if (!id || !list.some((m) => m.id === id)) return;
      queueMicrotask(() =>
        document
          .getElementById(id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }),
  );

  async function toggleSolution(replyId: string, isSolution: boolean) {
    try {
      const reply = replies().find((m) => m.id === replyId);
      if (!reply) return;

      if (isSolution) {
        await reply.unmarkSolution();
      } else {
        await reply.markSolution();
      }
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Container>
      <Scroll>
        <BackRow>
          <IconButton onPress={props.onBack}>
            <MdArrowBack />
          </IconButton>
          <Text class="label" size="large">
            <Trans>Back to posts</Trans>
          </Text>
        </BackRow>

        <Show when={post()}>
          {(post) => (
            <PostBody>
              <Text class="label" size="large">
                {post().forumTitle}
              </Text>
              <Show
                when={editingTags()}
                fallback={
                  <Show
                    when={
                      post().forumTags?.length ||
                      (post().author?.self && allowedTags().length)
                    }
                  >
                    <TagRow>
                      <For each={post().forumTags}>
                        {(tag) => <Tag>{tag}</Tag>}
                      </For>
                      <Show
                        when={post().author?.self && allowedTags().length}
                      >
                        <TagEditButton onClick={() => startEditTags(post())}>
                          <Trans>Edit tags</Trans>
                        </TagEditButton>
                      </Show>
                    </TagRow>
                  </Show>
                }
              >
                <TagRow>
                  <For each={allowedTags()}>
                    {(tag) => (
                      <TagToggle
                        active={tagDraft().has(tag)}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </TagToggle>
                    )}
                  </For>
                  <Button size="sm" onPress={() => saveTags(post())}>
                    <Trans>Save</Trans>
                  </Button>
                  <Button
                    size="sm"
                    variant="text"
                    onPress={() => setEditingTags(false)}
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </TagRow>
              </Show>
              <MessageView
                message={post()}
                editing={state.draft.editingMessageId === post().id}
              />
            </PostBody>
          )}
        </Show>

        <RepliesHeading>
          <Text class="label" size="medium">
            <Trans>Replies</Trans>
          </Text>
        </RepliesHeading>

        <For each={replies()}>
          {(reply) => (
            <ReplyCard isSolution={reply.forumSolution}>
              <MessageView
                message={reply}
                editing={state.draft.editingMessageId === reply.id}
                highlight={props.highlightMessageId === reply.id}
                omitReplyIds={[props.postId]}
              />
              <Show when={props.channel.solutionEnabled}>
                <SolutionRow>
                  <Show when={reply.forumSolution}>
                    <SolutionBadge>
                      <Trans>Solution</Trans>
                    </SolutionBadge>
                  </Show>
                  <Button
                    size="sm"
                    variant="text"
                    onPress={() =>
                      toggleSolution(reply.id, reply.forumSolution)
                    }
                  >
                    {reply.forumSolution ? (
                      <Trans>Unmark as solution</Trans>
                    ) : (
                      <Trans>Mark as solution</Trans>
                    )}
                  </Button>
                </SolutionRow>
              </Show>
            </ReplyCard>
          )}
        </For>
      </Scroll>

      <ComposerSlot>
        <MessageComposition
          channel={props.channel}
          forcedReplyId={() => props.postId}
          placeholder="Write a reply..."
          onMessageSend={() => window.setTimeout(reloadReplies, 1500)}
        />
      </ComposerSlot>
    </Container>
  );
}

const Container = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    flexGrow: 1,
  },
});

const Scroll = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    overflowY: "auto",
    minWidth: 0,
    flexGrow: 1,
  },
});

const BackRow = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

const PostBody = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container)",
  },
});

const TagRow = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-xs)",
  },
});

const Tag = styled("span", {
  base: {
    padding: "2px 8px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
    fontSize: "12px",
  },
});

const TagToggle = styled("button", {
  base: {
    padding: "2px 10px",
    borderRadius: "var(--borderRadius-full)",
    fontSize: "12px",
    cursor: "pointer",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    "&:hover": {
      background: "var(--md-sys-color-surface-container-high)",
    },
  },
  variants: {
    active: {
      true: {
        background: "var(--md-sys-color-secondary-container)",
        color: "var(--md-sys-color-on-secondary-container)",
        borderColor: "transparent",
      },
    },
  },
});

const TagEditButton = styled("button", {
  base: {
    padding: "2px 8px",
    borderRadius: "var(--borderRadius-full)",
    fontSize: "12px",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "var(--md-sys-color-primary)",
    "&:hover": {
      textDecoration: "underline",
    },
  },
});

const RepliesHeading = styled("div", {
  base: {
    marginTop: "var(--gap-md)",
  },
});

const ReplyCard = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    borderRadius: "var(--borderRadius-lg)",
    padding: "var(--gap-sm)",
  },
  variants: {
    isSolution: {
      true: {
        border: "1px solid var(--md-sys-color-primary)",
      },
    },
  },
});

const SolutionRow = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    paddingInlineStart: "54px",
  },
});

const SolutionBadge = styled("span", {
  base: {
    padding: "2px 8px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-primary)",
    color: "var(--md-sys-color-on-primary)",
    fontSize: "12px",
  },
});

const ComposerSlot = styled("div", {
  base: {
    flexShrink: 0,
    padding: "0 var(--gap-md) var(--gap-md)",
  },
});
