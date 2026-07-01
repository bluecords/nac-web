import { For, Show, createResource, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Channel, Message } from "stoat.js";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { Markdown } from "@revolt/markdown";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { Avatar, Button, IconButton, Text } from "@revolt/ui";

import { MessageContextMenu } from "@revolt/app/menus/MessageContextMenu";

import MdArrowBack from "@material-design-icons/svg/outlined/arrow_back.svg?component-solid";
import MdMoreVert from "@material-design-icons/svg/outlined/more_vert.svg?component-solid";

interface Props {
  channel: Channel;
  postId: string;
  onBack: () => void;
}

/**
 * Single forum post: the root message plus its flat list of replies.
 *
 * Known v1 limitation: same as `ForumChannel` - replies are fetched once,
 * not kept live via the gateway. Sending a reply locally refetches.
 */
export function ForumPost(props: Props) {
  const state = useState();
  const { showError } = useModals();
  const [replyContent, setReplyContent] = createSignal("");

  /**
   * Inline editor for a forum post or reply.
   *
   * The shared MessageContextMenu "Edit" action sets the global editing draft
   * (`state.draft.setEditingMessage`), which is normally rendered by the text
   * channel composer. The forum view doesn't mount that composer, so without
   * this the Edit action silently no-ops. Render an inline editor here for
   * whichever message is currently being edited, saving via `message.edit`.
   */
  function editor(message: Message) {
    return (
      <EditBox>
        <textarea
          ref={(el) => queueMicrotask(() => el.focus())}
          value={state.draft.editingMessageContent ?? ""}
          onInput={(event) =>
            state.draft.setEditingMessageContent(event.currentTarget.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              state.draft.setEditingMessage(undefined);
            }
          }}
        />
        <EditActions>
          <Button
            size="sm"
            variant="text"
            onPress={() => state.draft.setEditingMessage(undefined)}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button size="sm" onPress={() => saveEdit(message)}>
            <Trans>Save</Trans>
          </Button>
        </EditActions>
      </EditBox>
    );
  }

  async function saveEdit(message: Message) {
    const content = (state.draft.editingMessageContent ?? "").trim();
    try {
      if (content && content !== message.content) {
        await message.edit({ content });
      }
      state.draft.setEditingMessage(undefined);
    } catch (error) {
      showError(error);
    }
  }

  // Tag editing for the root post. The author picks from the channel's
  // allowed_tags; saved via message.edit({ forum_tags }).
  const [editingTags, setEditingTags] = createSignal(false);
  const [tagDraft, setTagDraft] = createSignal<Set<string>>(new Set());

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

  const [replies, { refetch: refetchReplies }] = createResource(
    () => props.postId,
    async (id) => {
      const messages = await props.channel.fetchMessages({ sort: "Latest" });
      return messages
        .filter((message) => message.replyIds?.includes(id))
        .reverse();
    },
  );

  async function sendReply() {
    const content = replyContent().trim();
    if (!content) return;

    try {
      await props.channel.sendMessage({
        content,
        replies: [{ id: props.postId, mention: false }],
      });

      setReplyContent("");
      refetchReplies();
    } catch (error) {
      showError(error);
    }
  }

  async function toggleSolution(replyId: string, isSolution: boolean) {
    try {
      const reply = (await replies())?.find((m) => m.id === replyId);
      if (!reply) return;

      if (isSolution) {
        await reply.unmarkSolution();
      } else {
        await reply.markSolution();
      }

      refetchReplies();
    } catch (error) {
      showError(error);
    }
  }

  return (
    <Container>
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
            <TitleRow>
              <Text class="label" size="large">
                {post().forumTitle}
              </Text>
              <div
                class={menuTrigger}
                title="Post actions"
                use:floating={{
                  contextMenu: () => <MessageContextMenu message={post()} />,
                  contextMenuHandler: "click",
                }}
              >
                <MdMoreVert />
              </div>
            </TitleRow>
            <Show
              when={editingTags()}
              fallback={
                <Show
                  when={
                    post().forumTags?.length ||
                    (post().author?.self && props.channel.allowedTags?.length)
                  }
                >
                  <TagRow>
                    <For each={post().forumTags}>
                      {(tag) => <Tag>{tag}</Tag>}
                    </For>
                    <Show
                      when={
                        post().author?.self && props.channel.allowedTags?.length
                      }
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
                <For each={props.channel.allowedTags}>
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
            <Author>
              <Avatar src={post().author?.animatedAvatarURL} size={24} />
              <Text class="label" size="small">
                {post().author?.username}
              </Text>
            </Author>
            <Show
              when={state.draft.editingMessageId === post().id}
              fallback={<Markdown content={post().content} />}
            >
              {editor(post())}
            </Show>
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
            <Author>
              <Avatar src={reply.author?.animatedAvatarURL} size={24} />
              <Text class="label" size="small">
                {reply.author?.username}
              </Text>
              <Show when={reply.forumSolution}>
                <SolutionBadge>
                  <Trans>Solution</Trans>
                </SolutionBadge>
              </Show>
              <div
                class={menuTrigger}
                title="Reply actions"
                use:floating={{
                  contextMenu: () => <MessageContextMenu message={reply} />,
                  contextMenuHandler: "click",
                }}
              >
                <MdMoreVert />
              </div>
            </Author>
            <Show
              when={state.draft.editingMessageId === reply.id}
              fallback={<Markdown content={reply.content} />}
            >
              {editor(reply)}
            </Show>
            <Show when={props.channel.solutionEnabled}>
              <Button
                size="sm"
                variant="text"
                onPress={() => toggleSolution(reply.id, reply.forumSolution)}
              >
                {reply.forumSolution ? (
                  <Trans>Unmark as solution</Trans>
                ) : (
                  <Trans>Mark as solution</Trans>
                )}
              </Button>
            </Show>
          </ReplyCard>
        )}
      </For>

      <ReplyBox>
        <textarea
          value={replyContent()}
          onInput={(event) => setReplyContent(event.currentTarget.value)}
          placeholder="Write a reply..."
        />
        <Button onPress={sendReply} isDisabled={!replyContent().trim()}>
          <Trans>Reply</Trans>
        </Button>
      </ReplyBox>
    </Container>
  );
}

const Container = styled("div", {
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

const TitleRow = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

const menuTrigger = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  marginLeft: "auto",
  width: "32px",
  height: "32px",
  borderRadius: "var(--borderRadius-full)",
  cursor: "pointer",
  color: "var(--md-sys-color-on-surface-variant)",
  "&:hover": {
    background: "var(--md-sys-color-surface-container-highest)",
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

const Author = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
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
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container-low)",
  },
  variants: {
    isSolution: {
      true: {
        border: "1px solid var(--md-sys-color-primary)",
      },
    },
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

const EditBox = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",

    "& textarea": {
      minHeight: "60px",
      borderRadius: "var(--borderRadius-md)",
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-on-surface)",
      border: "none",
      padding: "var(--gap-sm)",
      resize: "vertical",
      font: "inherit",
    },
  },
});

const EditActions = styled("div", {
  base: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--gap-sm)",
  },
});

const ReplyBox = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-sm)",
    marginTop: "var(--gap-md)",

    "& textarea": {
      flexGrow: 1,
      minHeight: "60px",
      borderRadius: "var(--borderRadius-md)",
      background: "var(--md-sys-color-surface-container-highest)",
      color: "var(--md-sys-color-on-surface)",
      border: "none",
      padding: "var(--gap-sm)",
      resize: "vertical",
      font: "inherit",
    },
  },
});
