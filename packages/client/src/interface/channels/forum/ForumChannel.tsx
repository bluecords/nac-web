import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { Message } from "stoat.js";
import { css, cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { Keybind, KeybindAction } from "@revolt/keybinds";
import { useModals } from "@revolt/modal";
import { useSmartParams } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import { Avatar, Button, Header, Text } from "@revolt/ui";

import MdMoreVert from "@material-design-icons/svg/outlined/more_vert.svg?component-solid";

import { MobileSearchOverlay } from "../../mobile/MobileSearchOverlay";
import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";
import { MemberSidebar } from "../text/MemberSidebar";
import { SidebarState } from "../text/TextChannel";
import { TextSearchSidebar } from "../text/TextSearchSidebar";

import { fetchAllMessages } from "./fetchAllMessages";
import { ForumPost } from "./ForumPost";
import { ForumPostCardMenu } from "./ForumPostCardMenu";

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
  const params = useSmartParams();
  const state = useState();

  const [selectedPostId, setSelectedPostId] = createSignal<string>();

  // Right-hand sidebar, mirroring the text channel: members by default, or a
  // message-search / pinned-posts panel. Reset when the channel changes.
  const isMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;

  const [sidebarState, setSidebarState] = createSignal<SidebarState>({
    state: "default",
  });

  createEffect(
    on(
      () => props.channel.id,
      () => setSidebarState({ state: "default" }),
    ),
  );

  // Refresh the channel's tag list from the API on entry.
  //
  // `allowed_tags` is in the Ready payload and the SDK hydrates it, but
  // `ChannelCollection.fetch()`/`getOrCreate()` return the cached channel
  // WITHOUT re-hydrating - so any load where the cached copy is missing tags
  // (a reconnect, a partial, a channel edited after connect) leaves the tag
  // picker permanently empty with no way to recover. Bunjie hit exactly this:
  // "Edit tags" opening to nothing on a channel whose tags the server has.
  // Write the fresh list straight into the reactive store so every consumer
  // (`ForumPost` editor, `CreateForumPost`, the filter bar) sees it.
  createEffect(
    on(
      () => props.channel.id,
      async (id) => {
        if (props.channel.type !== "ForumChannel") return;
        try {
          const data = (await client().api.get(
            `/channels/${id as ""}`,
          )) as unknown as {
            allowed_tags?: string[];
            solution_enabled?: boolean;
          };
          const tags = data.allowed_tags ?? [];
          if (
            JSON.stringify(tags) !==
            JSON.stringify(props.channel.allowedTags ?? [])
          ) {
            client().channels.updateUnderlyingObject(id, "allowedTags", tags);
          }
        } catch {
          /* keep whatever is cached */
        }
      },
    ),
  );

  let sidebarScrollTargetElement!: HTMLDivElement;

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

  // Mark the channel read while it is being viewed.
  //
  // Acking only ever happened in `TextChannel`, so a member could open a forum,
  // read every post, and the unread dot never cleared - no `channel_unreads`
  // row was ever written for the channel. A channel-level ack is the whole
  // story here: posts and their replies are all messages in this one channel.
  createEffect(
    on(
      () => props.channel.unread,
      (unread) => {
        if (unread && document.hasFocus()) {
          props.channel.ack();
        }
      },
    ),
  );

  // ...and again when the tab regains focus, for a post that arrived while it
  // was in the background. On `window`, because focus events do not bubble.
  function onFocus() {
    if (props.channel.unread) {
      props.channel.ack();
    }
  }

  onMount(() => window.addEventListener("focus", onFocus));
  onCleanup(() => window.removeEventListener("focus", onFocus));

  const posts = createMemo(() => messages().filter((m) => m.forumTitle));

  // Deep link: /server/x/channel/y/<messageId> should open the post that
  // message belongs to (the post itself, or the post a reply points at) and
  // highlight it. Without this a shared link or a notification tap just landed
  // on the post list. Runs once messages are loaded and whenever the id
  // changes; a stale highlight is cleared when the id goes away.
  createEffect(
    on([() => params().messageId, messages], ([messageId, all]) => {
      if (!messageId) return;
      const target = all.find((m) => m.id === messageId);
      if (!target) return; // not loaded yet, or not in this channel
      if (target.forumTitle) {
        setSelectedPostId(messageId);
      } else {
        const parentPost = (target.replyIds ?? []).find((id) =>
          all.some((m) => m.id === id && m.forumTitle),
        );
        if (parentPost) setSelectedPostId(parentPost);
      }
    }),
  );

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
      <MobileSearchOverlay channel={props.channel} />
      <Header placement="primary">
        <ChannelHeader
          channel={props.channel}
          sidebarState={sidebarState}
          setSidebarState={setSidebarState}
        />
      </Header>
      <ContentRow>
        <MainColumn>
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

                <Show
                  when={posts().length !== 0 && visiblePosts().length === 0}
                >
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
                          <Thumbnail
                            src={file().createFileURL()}
                            loading="lazy"
                          />
                        )}
                      </Show>
                      <div
                        class={postMenuTrigger}
                        title="Post actions"
                        use:floating={{
                          contextMenu: () => (
                            <ForumPostCardMenu
                              post={post}
                              openPost={() => setSelectedPostId(post.id)}
                            />
                          ),
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
              highlightMessageId={
                params().messageId && params().messageId !== selectedPostId()
                  ? params().messageId
                  : undefined
              }
              onBack={() => {
                setSelectedPostId(undefined);
                reload();
              }}
            />
          </Show>
        </MainColumn>

        <Show
          when={
            !isMobile() &&
            (state.layout.getSectionState(
              LAYOUT_SECTIONS.MEMBER_SIDEBAR,
              true,
            ) ||
              sidebarState().state !== "default")
          }
        >
          <div
            ref={sidebarScrollTargetElement}
            use:scrollable={{
              direction: "y",
              showOnHover: !isMobile(),
              class: sidebar(),
            }}
            style={
              sidebarState().state !== "default"
                ? { width: "min(85vw, 360px)" }
                : {}
            }
          >
            <Switch
              fallback={
                <MemberSidebar
                  channel={props.channel}
                  scrollTargetElement={sidebarScrollTargetElement}
                />
              }
            >
              <Match when={sidebarState().state === "search"}>
                <WideSidebarContainer>
                  <SidebarTitle>
                    <Text class="label" size="large">
                      <Trans>Search Results</Trans>
                    </Text>
                  </SidebarTitle>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{
                      query: (sidebarState() as { query: string }).query,
                    }}
                  />
                </WideSidebarContainer>
              </Match>
              <Match when={sidebarState().state === "pins"}>
                <WideSidebarContainer>
                  <SidebarTitle>
                    <Text class="label" size="large">
                      <Trans>Pinned Messages</Trans>
                    </Text>
                  </SidebarTitle>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{ pinned: true, sort: "Latest" }}
                  />
                </WideSidebarContainer>
              </Match>
            </Switch>

            <Show when={sidebarState().state !== "default"}>
              <Keybind
                keybind={KeybindAction.CLOSE_SIDEBAR}
                onPressed={() => setSidebarState({ state: "default" })}
              />
            </Show>
          </div>
        </Show>
      </ContentRow>
    </>
  );
}

const ContentRow = styled("div", {
  base: {
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
  },
});

const MainColumn = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
  },
});

const sidebar = cva({
  base: {
    flexShrink: 0,
    width: "var(--layout-width-channel-sidebar)",
    borderRadius: "var(--borderRadius-lg)",
  },
});

const WideSidebarContainer = styled("div", {
  base: {
    paddingRight: "var(--gap-md)",
    width: "360px",
  },
});

const SidebarTitle = styled("div", {
  base: {
    padding: "var(--gap-md)",
    color: "var(--md-sys-color-on-surface)",
  },
});

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
  // The muted `on-surface-variant` grey on the dark card was near-invisible
  // (Bunjie: "3 dots on a dark background are hard to see"). Full-contrast icon
  // sitting in its own chip, darker still on hover.
  color: "var(--md-sys-color-on-surface)",
  background: "var(--md-sys-color-surface-container-highest)",
  "&:hover": {
    background: "var(--md-sys-color-primary-container)",
    color: "var(--md-sys-color-on-primary-container)",
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
