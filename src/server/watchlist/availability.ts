const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type LookupOptions = { apiKey?: string; region?: string; fetcher?: typeof fetch; tmdbId?: number };

// Watchmode results are returned to the current session and are not persisted.
export async function findAvailability(title: string, kind: string, options: LookupOptions = {}): Promise<{ where: string | null; cover?: { url: string; sourceUrl: string } } | null> {
  if (!options.apiKey || !title.trim() || title.length > 200 || !["Movie", "TV show"].includes(kind)) return null;
  const fetcher = options.fetcher ?? fetch;
  const region = /^[A-Z]{2}$/.test(options.region ?? "") ? options.region! : "US";
  const headers = { "X-API-Key": options.apiKey, Accept: "application/json" };
  try {
    let watchmodeId: string;
    if (options.tmdbId !== undefined) {
      if (!Number.isSafeInteger(options.tmdbId) || options.tmdbId <= 0) return null;
      watchmodeId = `${kind === "Movie" ? "movie" : "tv"}-${options.tmdbId}`;
    } else {
      const search = new URL("https://api.watchmode.com/v1/search/");
      search.searchParams.set("search_field", "name");
      search.searchParams.set("search_value", title.trim());
      search.searchParams.set("types", kind === "Movie" ? "movie" : "tv");
      const response = await fetcher(search, { headers, signal: AbortSignal.timeout(4000), cache: "no-store" });
      if (!response.ok) throw new Error("Watchmode search unavailable");
      const data = await response.json();
      const allowed = kind === "Movie" ? ["movie", "tv_movie", "short_film"] : ["tv_series", "tv_miniseries", "tv_special"];
      const matches = Array.isArray(data?.title_results) ? data.title_results.filter((item: { id?: unknown; name?: unknown; type?: unknown }) => Number.isSafeInteger(item?.id) && Number(item.id) > 0 && typeof item.name === "string" && normalize(item.name) === normalize(title) && allowed.includes(item.type as string)) : [];
      if (matches.length !== 1) return null;
      watchmodeId = String(matches[0].id);
    }
    const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeId}/details/`);
    url.searchParams.set("regions", region);
    url.searchParams.set("append_to_response", "sources");
    const sources = await fetcher(url, { headers, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!sources.ok) throw new Error("Watchmode availability unavailable");
    const details = await sources.json();
    if (!details || !Array.isArray(details.sources)) throw new Error("Invalid Watchmode response");
    if (options.tmdbId !== undefined && (details.tmdb_id !== options.tmdbId || details.tmdb_type !== (kind === "Movie" ? "movie" : "tv"))) return null;
    const items = details.sources as Array<{ type?: unknown; region?: unknown; name?: unknown }>;
    const groups: string[] = [];
    for (const [type, label] of [["sub", "Stream"], ["free", "Free"], ["tve", "TV provider"], ["rent", "Rent"], ["buy", "Buy"]]) {
      const names = [...new Set(items.flatMap((item) => item?.type === type && item?.region === region && typeof item.name === "string" && item.name.trim() && item.name.length <= 100 ? [item.name.trim()] : []))];
      if (names.length) groups.push(`${label}: ${names.join(", ")}`);
    }
    let cover: { url: string; sourceUrl: string } | undefined;
    if (typeof details.poster === "string" && Number.isSafeInteger(details.tmdb_id) && details.tmdb_id > 0 && details.tmdb_type === (kind === "Movie" ? "movie" : "tv")) {
      try {
        const poster = new URL(details.poster);
        if (poster.protocol === "https:" && poster.hostname === "image.tmdb.org" && /^\/t\/p\/[a-zA-Z0-9_]+\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(poster.pathname) && !poster.search && !poster.hash) cover = { url: poster.href, sourceUrl: `https://www.themoviedb.org/${details.tmdb_type}/${details.tmdb_id}` };
      } catch { /* Ignore unsupported poster URLs. */ }
    }
    return { where: groups.length ? `${region} · ${groups.join("; ")}` : null, ...(cover ? { cover } : {}) };
  } catch { throw new Error("Watchmode is unavailable. Check your key and try again."); }
}
