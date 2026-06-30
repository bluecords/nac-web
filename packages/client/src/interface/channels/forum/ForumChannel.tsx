import { For, Show, createResource, createSignal } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Message } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useModals } from "@revolt/modal";
import { Avatar, Button, Header, Text } from "@revolt/ui";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { ForumPost } from "./ForumPost";

/**
 * Forum channel component
 *
 * Shows a list of posts (root messages with `forumTitle` set) in the
 * channel; selecting one shows the post + its replies via `ForumPost`.
 *
 * Known v1 limitation: the post list is fetched once on mount/refresh
 * rather than kept live via the gateway - creating a post locally
 * refetches, but another member's new post won't appear until reload.
 */
export function ForumChannel(props: ChannelPageProps) {
  const { openModal } = useModals();

  const [selectedPostId, setSelectedPostId] = createSignal<string>();

  const [postData, { refetch }] = createResource(
    () => props.channel.id,
    async () => {
      const messages = await props.channel.fetchMessages({ sort: "Latest" });
      const posts = messages.filter((message) => message.forumTitle);
      const replyCounts = new Map<string, number>();
      for (const message of messages) {
        if (!message.forumTitle) {
          for (const replyId of message.replyIds ?? []) {
            replyCounts.set(replyId, (replyCounts.get(replyId) ?? 0) + 1);
          }
        }
      }
      return { posts, replyCounts };
    },
  );

  const posts = () => postData()?.posts;
  const replyCountFor = (postId: string) =>
    postData()?.replyCounts.get(postId) ?? 0;

  function reactionCount(message: Message): number {
    let total = 0;
    for (const users of message.reactions.values()) {
      total += users.size;
    }
    return total;
  }

  function openCreatePost() {
    openModal({
      type: "create_forum_post",
      channel: props.channel,
      cb: () => refetch(),
    });
  }

  return (
    <>
      <Header placement="primary">
        <ChannelHeader channel={props.channel} />
      </Header>
      <Show
        when={selectedPostId()}
        fallback={
          <Container>
            <Toolbar>
              <Button onPress={openCreatePost}>
                <Trans>New post</Trans>
              </Button>
            </Toolbar>

            <Show when={posts()?.length === 0}>
              <Empty>
                <Text class="label" size="large">
                  <Trans>No posts yet - be the first!</Trans>
                </Text>
              </Empty>
            </Show>

            <For each={posts()}>
              {(post) => (
                <PostCard onClick={() => setSelectedPostId(post.id)}>
                  <Avatar src={post.author?.animatedAvatarURL} size={32} />
                  <PostInfo>
                    <Text class="label" size="large">
                      {post.forumTitle}
                    </Text>
                    <Meta>
                      <Text class="label" size="small">
                        {post.author?.username}
                      </Text>
                      <Show when={post.forumTags?.length}>
                        <For each={post.forumTags}>
                          {(tag) => <Tag>{tag}</Tag>}
                        </For>
                      </Show>
                      <Show when={reactionCount(post)}>
                        <Text class="label" size="small">
                          {reactionCount(post)} ▲
                        </Text>
                      </Show>
                      <Show when={replyCountFor(post.id)}>
                        <Text class="label" size="small">
                          {replyCountFor(post.id)} 💬
                        </Text>
                      </Show>
                    </Meta>
                  </PostInfo>
                </PostCard>
              )}
            </For>
          </Container>
        }
      >
        <ForumPost
          channel={props.channel}
          postId={selectedPostId()!}
          onBack={() => {
            setSelectedPostId(undefined);
            refetch();
          }}
        />
      </Show>
    </>
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

const Toolbar = styled("div", {
  base: {
    display: "flex",
    justifyContent: "flex-end",
  },
});

const Empty = styled("div", {
  base: {
    display: "flex",
    justifyContent: "center",
    padding: "var(--gap-xl)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const PostCard = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container)",
    cursor: "pointer",
    "&:hover": {
      background: "var(--md-sys-color-surface-container-high)",
    },
  },
});

const PostInfo = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    minWidth: 0,
  },
});

const Meta = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    color: "var(--md-sys-color-on-surface-variant)",
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
