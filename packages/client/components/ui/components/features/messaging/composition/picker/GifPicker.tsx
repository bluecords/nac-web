import {
  Match,
  Suspense,
  Switch,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { VirtualContainer } from "@minht11/solid-virtual-container";
import { useQuery } from "@tanstack/solid-query";
import { styled } from "styled-system/jsx";

import env from "@revolt/common/lib/env";
import {
  CircularProgress,
  TextField,
  typography,
} from "@revolt/ui/components/design";

import { CompositionMediaPickerContext } from "./CompositionMediaPicker";

const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

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

type CategoryItem =
  | { t: 0; category: GifCategory }
  | { t: 1; gif: GifResult | null };

function giphyUrl(path: string, extra = "") {
  return `${GIPHY_BASE}${path}?api_key=${encodeURIComponent(env.GIPHY_KEY)}&rating=pg-13&limit=20${extra}`;
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
  let targetElement!: HTMLDivElement;

  const trendingCategories = useQuery<GifCategory[]>(() => ({
    queryKey: ["giphyCategories"],
    queryFn: () =>
      fetch(
        `https://api.giphy.com/v1/gifs/categories?api_key=${encodeURIComponent(env.GIPHY_KEY)}`,
      )
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
    <div ref={targetElement} use:invisibleScrollable>
      <VirtualContainer
        items={items()}
        scrollTarget={targetElement}
        itemSize={{ height: 120, width: 200 }}
        crossAxisCount={(measurements) =>
          Math.floor(measurements.container.cross / measurements.itemSize.cross)
        }
      >
        {CategoryItem}
      </VirtualContainer>
    </div>
  );
}

const CategoryItem = (props: {
  style: unknown;
  tabIndex: number;
  item: CategoryItem;
}) => {
  const setFilter = useContext(FilterContext);

  return (
    <Category
      style={{
        ...(props.style as object),
        "background-image": `linear-gradient(to right, #0006, #0006), url("${props.item.t === 0 ? props.item.category.image : (props.item.gif?.previewMp4 ?? "")}")`,
      }}
      tabIndex={props.tabIndex}
      role="listitem"
      onClick={() =>
        setFilter!(
          props.item.t === 0 ? props.item.category.title : "trending",
        )
      }
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }}
    >
      <Switch fallback={<Trans>Trending GIFs</Trans>}>
        <Match when={props.item.t === 0}>
          {(props.item as CategoryItem & { t: 0 }).category.title}
        </Match>
      </Switch>
    </Category>
  );
};

const Category = styled("div", {
  base: {
    ...typography.raw({ class: "title", size: "small" }),

    width: "200px",
    height: "120px",
    backgroundSize: "cover",
    backgroundPosition: "center",

    color: "white",
    display: "flex",
    padding: "var(--gap-md)",

    alignItems: "end",
    justifyContent: "end",

    cursor: "pointer",
  },
});

function GifSearch(props: { query: string }) {
  let targetElement!: HTMLDivElement;

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
    <div ref={targetElement} use:invisibleScrollable>
      <VirtualContainer
        items={search.data as never}
        scrollTarget={targetElement}
        itemSize={{ height: 120, width: 200 }}
        crossAxisCount={(measurements) =>
          Math.floor(measurements.container.cross / measurements.itemSize.cross)
        }
      >
        {GifItem}
      </VirtualContainer>
    </div>
  );
}

const GifItem = (props: {
  style: unknown;
  tabIndex: number;
  item: GifResult;
}) => {
  const { onMessage } = useContext(CompositionMediaPickerContext);

  return (
    <Gif
      loop
      autoplay
      muted
      preload="auto"
      role="listitem"
      style={props.style as string}
      tabIndex={props.tabIndex}
      src={props.item.previewMp4}
      onClick={() => onMessage(props.item.url)}
    />
  );
};

const Gif = styled("video", {
  base: {
    width: "200px",
    height: "120px",
    cursor: "pointer",
    objectFit: "cover",
  },
});
