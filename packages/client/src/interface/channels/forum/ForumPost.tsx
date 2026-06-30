import { For, Show, createResource, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { Markdown } from "@revolt/markdown";
import { useModals } from "@revolt/modal";
import { Avatar, Button, IconButton, Text } from "@revolt/ui";

import MdArrowBack from "@material-design-icons/svg/outlined/arrow_back.svg?component-solid";

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
  const { showError } = useModals();
  const [replyContent, setReplyContent] = createSignal("");

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
            <Text class="label" size="large">
              {post().forumTitle}
            </Text>
            <Author>
              <Avatar src={post().author?.animatedAvatarURL} size={24} />
              <Text class="label" size="small">
                {post().author?.username}
              </Text>
            </Author>
            <Markdown content={post().content} />
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
            </Author>
            <Markdown content={reply.content} />
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
