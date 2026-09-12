import { Accessor, JSX, createContext, createSignal, onCleanup, useContext } from "solid-js";

interface MobileNavContextValue {
  isMobile: Accessor<boolean>;
  navOpen: Accessor<boolean>;
  openNav: () => void;
  closeNav: () => void;
  membersOpen: Accessor<boolean>;
  openMembers: () => void;
  closeMembers: () => void;
  messagesOpen: Accessor<boolean>;
  openMessages: () => void;
  closeMessages: () => void;
  editMode: Accessor<boolean>;
  setEditMode: (v: boolean) => void;
  searchOpen: Accessor<boolean>;
  openSearch: () => void;
  closeSearch: () => void;
  /**
   * When a forum post is open on mobile, this holds the callback to close it
   * (return to the post list). The hardware/browser back button checks this
   * first, before falling through to the channel-drawer behavior below it.
   */
  forumBackHandler: Accessor<(() => void) | undefined>;
  setForumBackHandler: (handler: (() => void) | undefined) => void;
}

const MobileNavContext = createContext<MobileNavContextValue>();

export function MobileNavProvider(props: { children: JSX.Element }) {
  const mq =
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)")
      : null;

  const [isMobile, setIsMobile] = createSignal(mq?.matches ?? false);
  const [navOpen, setNavOpen] = createSignal(false);
  const [membersOpen, setMembersOpen] = createSignal(false);
  const [messagesOpen, setMessagesOpen] = createSignal(false);
  const [editMode, setEditMode] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [forumBackHandler, setForumBackHandler] = createSignal<
    (() => void) | undefined
  >(undefined);

  if (mq) {
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  }

  return (
    <MobileNavContext.Provider
      value={{
        isMobile,
        navOpen,
        openNav: () => setNavOpen(true),
        closeNav: () => setNavOpen(false),
        membersOpen,
        openMembers: () => {
          setMembersOpen(true);
          setNavOpen(false);
        },
        closeMembers: () => setMembersOpen(false),
        messagesOpen,
        openMessages: () => {
          setMessagesOpen(true);
          setNavOpen(false);
        },
        closeMessages: () => setMessagesOpen(false),
        editMode,
        setEditMode: (v: boolean) => {
          setEditMode(v);
          if (!v) setNavOpen(true);
        },
        searchOpen,
        openSearch: () => setSearchOpen(true),
        closeSearch: () => setSearchOpen(false),
        forumBackHandler,
        setForumBackHandler: (handler) => setForumBackHandler(() => handler),
      }}
    >
      {props.children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext)!;
}
