import {
  For,
  Match,
  Show,
  Suspense,
  Switch,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { useQuery } from "@tanstack/solid-query";
import { styled } from "styled-system/jsx";

import {
  CircularProgress,
  TextField,
  typography,
} from "@revolt/ui/components/design";

import { CompositionMediaPickerContext } from "./CompositionMediaPicker";

/**
 * GIF search goes through our own origin, not to Giphy directly.
 *
 * Calling api.giphy.com from the browser handed Giphy (Google) each member's IP
 * address, User-Agent and search terms, and required the API key to be shipped
 * in the client bundle where anyone could read it. nginx now proxies these three
 * endpoints and appends the key server-side, so Giphy sees the server once
 * instead of seeing every member.
 *
 * The residual, stated honestly: Giphy still receives the search terms. What it
 * no longer receives is who searched.
 */
const GIPHY_BASE = "/giphy";

type GifCategory = { title: string; image: string };

type GifResult = {
  url: string;
  previewMp4: string;
};

const FilterContext = createContext<(value: string) => void>();

export function GifPicker() {
  const [filter, setFilter] = createSignal("");

  const filterLowercase = () => filter().toLowerCase();

  return (
    <Stack>
      <TextField
        autoFocus
        variant="filled"
        placeholder="Search for GIFs..."
        value={filter()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }}
        onChange={(e) => setFilter(e.currentTarget.value)}
      />
      <Suspense fallback={<CircularProgress />}>
        <Switch
          fallback={
            <FilterContext.Provider value={setFilter}>
              <Categories />
            </FilterContext.Provider>
          }
        >
          <Match when={filterLowercase()}>
            <GifSearch query={filterLowercase()} />
          </Match>
        </Switch>
      </Suspense>
    </Stack>
  );
}

const Stack = styled("div", {
  base: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

const Grid = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "3px",
    padding: "3px",
    overflowY: "auto",
  },
});

type CategoryItem =
  | { t: 0; category: GifCategory }
  | { t: 1; gif: GifResult | null };

function giphyUrl(path: string, extra = "") {
  // No api_key here: the proxy appends it. See GIPHY_BASE above.
  return `${GIPHY_BASE}${path}?rating=pg-13&limit=20${extra}`;
}

function mapGif(g: Record<string, never>): GifResult {
  const images = g.images as Record<string, Record<string, string>>;
  return {
    url: images.original?.url ?? images.fixed_height?.url ?? "",
    previewMp4:
      images.fixed_height_small?.mp4 ??
      images.fixed_height?.mp4 ??
      images.original?.mp4 ??
      images.original?.url ??
      "",
  };
}

function Categories() {
  const setFilter = useContext(FilterContext);

  const trendingCategories = useQuery<GifCategory[]>(() => ({
    queryKey: ["giphyCategories"],
    queryFn: () =>
      fetch(`${GIPHY_BASE}/categories`)
        .then((r) => r.json())
        .then((resp) =>
          (resp.data as Record<string, never>[]).map((c) => ({
            title: (c.name as string)
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase()),
            image:
              (
                (c.gif as Record<string, never>)
                  ?.images as Record<string, Record<string, string>>
              )?.fixed_height?.url ?? "",
          })),
        ),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  }));

  const trendingGif = useQuery<GifResult | null>(() => ({
    queryKey: ["giphyTrending1"],
    queryFn: () =>
      fetch(giphyUrl("/trending", "&limit=1"))
        .then((r) => r.json())
        .then((resp) => {
          const g = (resp.data as Record<string, never>[])[0];
          return g ? mapGif(g) : null;
        }),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    initialData: null,
  }));

  const items = createMemo(
    () =>
      [
        { t: 1, gif: trendingGif.data },
        ...(trendingCategories.data?.map((category) => ({
          t: 0,
          category,
        })) ?? []),
      ] as CategoryItem[],
  );

  return (
    <Grid use:invisibleScrollable>
      <For each={items()}>
        {(item) => (
          <Category
            style={{
              "background-image": `linear-gradient(to right, #0006, #0006), url("${item.t === 0 ? item.category.image : (item.gif?.previewMp4 ?? "")}")`,
            }}
            role="listitem"
            onClick={() =>
              setFilter!(item.t === 0 ? item.category.title : "trending")
            }
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
            }}
          >
            <Switch fallback={<Trans>Trending GIFs</Trans>}>
              <Match when={item.t === 0}>
                {(item as CategoryItem & { t: 0 }).category.title}
              </Match>
            </Switch>
          </Category>
        )}
      </For>
    </Grid>
  );
}

const Category = styled("div", {
  base: {
    ...typography.raw({ class: "title", size: "small" }),

    width: "100%",
    height: "100px",
    backgroundSize: "cover",
    backgroundPosition: "center",

    color: "white",
    display: "flex",
    padding: "var(--gap-md)",

    alignItems: "end",
    justifyContent: "end",

    cursor: "pointer",
    borderRadius: "4px",
  },
});

function GifSearch(props: { query: string }) {
  const search = useQuery<GifResult[]>(() => ({
    queryKey: ["giphySearch", props.query],
    queryFn: () =>
      fetch(
        props.query === "trending"
          ? giphyUrl("/trending")
          : giphyUrl("/search", `&q=${encodeURIComponent(props.query)}`),
      )
        .then((r) => r.json())
        .then((resp) =>
          (resp.data as Record<string, never>[]).map(mapGif),
        ),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  }));

  return (
    <Grid use:invisibleScrollable>
      <For each={search.data ?? []}>
        {(gif) => (
          <GifItem gif={gif} />
        )}
      </For>
    </Grid>
  );
}

function GifItem(props: { gif: GifResult }) {
  const { onMessage, close } = useContext(CompositionMediaPickerContext);

  return (
    <Gif
      loop
      autoplay
      muted
      // Without this, iOS Safari forces every autoplaying <video> into
      // native fullscreen playback instead of rendering inline -- looks
      // exactly like "GIFs render full-screen one at a time" and the
      // fullscreen player swallows the tap meant to select the GIF
      // ("gets stuck"). See nac-web#43.
      playsInline
      preload="auto"
      role="listitem"
      src={props.gif.previewMp4}
      // Selecting a GIF sends it, so there is nothing left to do in the picker.
      // It used to stay open, and because it covers the screen on a phone there
      // was no "outside" left to tap to dismiss it.
      onClick={() => {
        onMessage(props.gif.url);
        close();
      }}
    />
  );
}

const Gif = styled("video", {
  base: {
    width: "100%",
    height: "100px",
    cursor: "pointer",
    objectFit: "cover",
    borderRadius: "4px",
    display: "block",
  },
});
