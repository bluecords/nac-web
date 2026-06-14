import { Accessor, JSX, createContext, createSignal, onCleanup, useContext } from "solid-js";

interface MobileNavContextValue {
  isMobile: Accessor<boolean>;
  navOpen: Accessor<boolean>;
  openNav: () => void;
  closeNav: () => void;
  membersOpen: Accessor<boolean>;
  openMembers: () => void;
  closeMembers: () => void;
  editMode: Accessor<boolean>;
  setEditMode: (v: boolean) => void;
  searchOpen: Accessor<boolean>;
  openSearch: () => void;
  closeSearch: () => void;
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
  const [editMode, setEditMode] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);

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
        editMode,
        setEditMode: (v: boolean) => {
          setEditMode(v);
          if (!v) setNavOpen(true);
        },
        searchOpen,
        openSearch: () => setSearchOpen(true),
        closeSearch: () => setSearchOpen(false),
      }}
    >
      {props.children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext)!;
}
