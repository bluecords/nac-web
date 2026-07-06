import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Message } from "stoat.js";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { MessageContextMenu } from "@revolt/app/menus/MessageContextMenu";
import { useClient } from "@revolt/client";
import { useModals } from "@revolt/modal";
import { Avatar, Button, Header, Text } from "@revolt/ui";

import MdMoreVert from "@material-design-icons/svg/outlined/more_vert.svg?component-solid";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { fetchAllMessages } from "./fetchAllMessages";
import { ForumPost } from "./ForumPost";

type SortMode = "latest" | "top" | "active";

/**
 * Forum channel component
 *
 * Shows a list of posts (root messages with `forumTitle` set) in the
 * channel; selecting one shows the post + its replies via `ForumPost`.
 *
 * Live updates: the channel's messages are fetched once when the channel
 * changes, then kept current via the gateway (`messageCreate`/`messageDelete`)
 * - the same idiom the text-channel `Messages` view uses. New posts and replies
 * from other members, and remote deletions, now reflect without a reload. Post
 * titles, tags, content and reaction counts already update reactively because
 * the `Message` objects themselves are reactive.
 */
export function ForumChannel(props: ChannelPageProps) {
  const client = useClient();
  const { openModal } = useModals();

  const [selectedPostId, setSelectedPostId] = createSignal<string>();

  // Every message in the channel (posts + replies). Posts and reply counts are
  // derived from this; keeping the whole list live means one pair of gateway
  // handlers covers both the post list and each post's reply count.
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(true);

  async function reload() {
    const msgs = await fetchAllMessages(props.channel);
    setMessages(msgs);
    setLoading(false);
  }

  // (Re)load whenever the channel changes.
  createEffect(
    on(
      () => props.channel.id,
      () => {
        setLoading(true);
        setMessages([]);
        let cancelled = false;
        fetchAllMessages(props.channel)
          .then((msgs) => {
            if (cancelled) return;
            setMessages(msgs);
            setLoading(false);
          })
          .catch(() => {
            if (!cancelled) setLoading(false);
          });
        onCleanup(() => {
          cancelled = true;
        });
      },
    ),
  );

  function onMessageCreate(message: Message) {
    if (message.channelId !== props.channel.id) return;
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [message, ...prev],
    );
  }

  function onMessageDelete(message: { id: string; channelId: string }) {
    if (message.channelId !== props.channel.id) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
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

  const posts = createMemo(() => messages().filter((m) => m.forumTitle));

  const replyCounts = createMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages()) {
      if (!message.forumTitle) {
        for (const replyId of message.replyIds ?? []) {
          counts.set(replyId, (counts.get(replyId) ?? 0) + 1);
        }
      }
    }
    return counts;
  });

  const replyCountFor = (postId: string) => replyCounts().get(postId) ?? 0;

  // Tags available to filter by: the channel's defined keywords, falling
  // back to whatever tags actually appear on posts (covers channels whose
  // allowed_tags were cleared but old posts still carry tags).
  const filterableTags = () => {
    const defined = props.channel.allowedTags ?? [];
    if (defined.length) return defined;
    const seen = new Set<string>();
    for (const post of posts()) {
      for (const tag of post.forumTags ?? []) seen.add(tag);
    }
    return [...seen];
  };

  const [activeFilters, setActiveFilters] = createSignal<Set<string>>(
    new Set(),
  );

  function toggleFilter(tag: string) {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const [sortMode, setSortMode] = createSignal<SortMode>("latest");

  function reactionCount(message: Message): number {
    let total = 0;
    for (const users of message.reactions.values()) {
      total += users.size;
    }
    return total;
  }

  // Posts after tag filtering, ordered by the active sort. "Latest" is newest
  // first (ULID ids sort chronologically); "Top" ranks by total reactions -
  // the "better than Discord" signal from the original design; "Most active"
  // ranks by reply count. Both fall back to newest-first on ties.
  const visiblePosts = createMemo(() => {
    const filters = activeFilters();
    let list = posts();
    if (filters.size) {
      list = list.filter((post) =>
        post.forumTags?.some((tag) => filters.has(tag)),
      );
    }

    const mode = sortMode();
    return [...list].sort((a, b) => {
      if (mode === "top") {
        const diff = reactionCount(b) - reactionCount(a);
        if (diff) return diff;
      } else if (mode === "active") {
        const diff = replyCountFor(b.id) - replyCountFor(a.id);
        if (diff) return diff;
      }
      return b.id.localeCompare(a.id);
    });
  });

  // First image attachment on a post, if any - used for the list's thumbnail
  // preview (matching Discord forum "grid view" cover images).
  function thumbnailFor(post: Message) {
    return post.attachments?.find((file) => file.metadata.type === "Image");
  }

  // One-line body preview for the post list. Collapsed to the first non-empty
  // line and truncated, so scanning the list gives a sense of each post beyond
  // its title.
  function snippet(post: Message): string {
    const content = post.content?.trim();
    if (!content) return "";
    const firstLine = content.split("\n").find((line) => line.trim()) ?? "";
    return firstLine.length > 140 ? firstLine.slice(0, 140) + "…" : firstLine;
  }

  function openCreatePost() {
    openModal({
      type: "create_forum_post",
      channel: props.channel,
      cb: () => reload(),
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
              <SortBar>
                <FilterChip
                  active={sortMode() === "latest"}
                  onClick={() => setSortMode("latest")}
                >
                  <Trans>Latest</Trans>
                </FilterChip>
                <FilterChip
                  active={sortMode() === "top"}
                  onClick={() => setSortMode("top")}
                >
                  <Trans>Top</Trans>
                </FilterChip>
                <FilterChip
                  active={sortMode() === "active"}
                  onClick={() => setSortMode("active")}
                >
                  <Trans>Most active</Trans>
                </FilterChip>
              </SortBar>
              <Button onPress={openCreatePost}>
                <Trans>New post</Trans>
              </Button>
            </Toolbar>

            <Show when={filterableTags().length}>
              <FilterBar>
                <FilterChip
                  active={activeFilters().size === 0}
                  onClick={() => setActiveFilters(new Set())}
                >
                  <Trans>All</Trans>
                </FilterChip>
                <For each={filterableTags()}>
                  {(tag) => (
                    <FilterChip
                      active={activeFilters().has(tag)}
                      onClick={() => toggleFilter(tag)}
                    >
                      {tag}
                    </FilterChip>
                  )}
                </For>
              </FilterBar>
            </Show>

            <Show when={!loading() && posts().length === 0}>
              <Empty>
                <Text class="label" size="large">
                  <Trans>No posts yet - be the first!</Trans>
                </Text>
              </Empty>
            </Show>

            <Show when={posts().length !== 0 && visiblePosts().length === 0}>
              <Empty>
                <Text class="label" size="large">
                  <Trans>No posts match the selected tags.</Trans>
                </Text>
              </Empty>
            </Show>

            <For each={visiblePosts()}>
              {(post) => (
                <PostCard onClick={() => setSelectedPostId(post.id)}>
                  <Avatar src={post.animatedAvatarURL} size={32} />
                  <PostInfo>
                    <Text class="label" size="large">
                      {post.forumTitle}
                    </Text>
                    <Show when={snippet(post)}>
                      <Snippet>{snippet(post)}</Snippet>
                    </Show>
                    <Meta>
                      <Text class="label" size="small">
                        {post.username}
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
                  <Show when={thumbnailFor(post)}>
                    {(file) => (
                      <Thumbnail src={file().createFileURL()} loading="lazy" />
                    )}
                  </Show>
                  <div
                    class={postMenuTrigger}
                    title="Post actions"
                    use:floating={{
                      contextMenu: () => <MessageContextMenu message={post} />,
                      contextMenuHandler: "click",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MdMoreVert />
                  </div>
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
            reload();
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--gap-md)",
    flexWrap: "wrap",
  },
});

const SortBar = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
  },
});

const FilterBar = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
  },
});

const FilterChip = styled("button", {
  base: {
    padding: "4px 12px",
    borderRadius: "var(--borderRadius-full)",
    fontSize: "13px",
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
    flexGrow: 1,
  },
});

const Snippet = styled("span", {
  base: {
    fontSize: "13px",
    color: "var(--md-sys-color-on-surface-variant)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  },
});

const postMenuTrigger = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "32px",
  height: "32px",
  borderRadius: "var(--borderRadius-full)",
  cursor: "pointer",
  color: "var(--md-sys-color-on-surface-variant)",
  "&:hover": {
    background: "var(--md-sys-color-surface-container-highest)",
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

const Thumbnail = styled("img", {
  base: {
    width: "64px",
    height: "64px",
    borderRadius: "var(--borderRadius-md)",
    objectFit: "cover",
    flexShrink: 0,
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
