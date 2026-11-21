const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

type Cover = { url: string; sourceUrl: string };

// TVMaze provides series artwork; iTunes provides movie artwork and a store link.
export async function findCover(title: string, kind: string, fetcher: typeof fetch = fetch): Promise<Cover | null> {
  if (!title.trim() || title.length > 200 || !["Movie", "TV show"].includes(kind)) return null;
  try {
    const url = kind === "TV show" ? new URL("https://api.tvmaze.com/search/shows") : new URL("https://itunes.apple.com/search");
    if (kind === "TV show") url.searchParams.set("q", title);
    else { url.searchParams.set("term", title); url.searchParams.set("media", "movie"); url.searchParams.set("entity", "movie"); url.searchParams.set("limit", "20"); }
    const response = await fetcher(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (kind === "TV show" && Array.isArray(data)) {
      const matches = data.map((item) => item?.show).filter((item) => typeof item?.name === "string" && normalize(item.name) === normalize(title));
      const show = matches.length === 1 ? matches[0] : null;
      if (typeof show?.image?.medium === "string" && typeof show?.url === "string" && validUrl(show.image.medium, "tvmaze.com") && validUrl(show.url, "tvmaze.com")) return { url: show.image.medium, sourceUrl: show.url };
    }
    if (kind === "Movie" && Array.isArray(data?.results)) {
      const matches = data.results.filter((item: { trackName?: unknown }) => typeof item?.trackName === "string" && normalize(item.trackName) === normalize(title));
      const movie = matches.length === 1 ? matches[0] : null;
      if (typeof movie?.artworkUrl100 === "string" && typeof movie?.trackViewUrl === "string" && validUrl(movie.artworkUrl100, "mzstatic.com") && validUrl(movie.trackViewUrl, "apple.com")) return { url: movie.artworkUrl100.replace("100x100", "600x600"), sourceUrl: movie.trackViewUrl };
    }
  } catch { /* A lookup failure must never prevent saving. */ }
  return null;
}
function validUrl(value: string, domain: string) {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === domain || url.hostname.endsWith(`.${domain}`)); } catch { return false; }
}
