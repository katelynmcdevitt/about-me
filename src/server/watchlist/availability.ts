const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
type LookupOptions = { apiKey?: string; region?: string; fetcher?: typeof fetch };

// Match only unambiguous exact titles; a wrong show is worse than no result.
export async function findAvailability(title: string, kind: string, options: LookupOptions = {}): Promise<string | null> {
  if (!title.trim() || title.length > 200 || !["Movie", "TV show"].includes(kind)) return null;
  const fetcher = options.fetcher ?? fetch;
  if (options.apiKey) {
    try {
      const type = kind === "Movie" ? "movie" : "tv";
      const region = /^[A-Z]{2}$/.test(options.region ?? "") ? options.region! : "US";
      const search = new URL(`https://api.themoviedb.org/3/search/${type}`);
      search.searchParams.set("query", title.trim());
      const init: RequestInit = { headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(4000) };
      const response = await fetcher(search, init);
      if (response.ok) {
        const body = await response.json();
        const matches = Array.isArray(body?.results) ? body.results.filter((item: { id?: unknown; title?: unknown; name?: unknown }) => Number.isSafeInteger(item?.id) && Number(item.id) > 0 && typeof (type === "movie" ? item.title : item.name) === "string" && normalize((type === "movie" ? item.title : item.name) as string) === normalize(title)) : [];
        if (matches.length === 1) {
          const providers = await fetcher(`https://api.themoviedb.org/3/${type}/${matches[0].id}/watch/providers`, { ...init, signal: AbortSignal.timeout(4000) });
          if (providers.ok) {
            const data = await providers.json(); const country = data?.results?.[region];
            const groups: string[] = [];
            for (const [field, label] of [["flatrate", "Stream"], ["free", "Free"], ["ads", "With ads"], ["rent", "Rent"], ["buy", "Buy"]]) {
              const names = Array.isArray(country?.[field]) ? [...new Set<string>(country[field].map((item: { provider_name?: unknown }) => item?.provider_name).filter((name: unknown): name is string => typeof name === "string" && !!name.trim() && name.length <= 100))] : [];
              if (names.length) groups.push(`${label}: ${names.join(", ")}`);
            }
            if (groups.length) {
              const prefix = `${region} · `; const suffix = " · JustWatch via TMDB";
              return prefix + groups.join("; ").slice(0, 200 - prefix.length - suffix.length).trimEnd() + suffix;
            }
          }
        }
      }
    } catch { /* Network failures do not prevent saving a title. */ }
  }
  if (kind === "TV show") {
    try {
      const url = new URL("https://api.tvmaze.com/search/shows"); url.searchParams.set("q", title.trim());
      const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (!response.ok) return null;
      const body = await response.json();
      const matches = Array.isArray(body) ? body.map((result) => result?.show).filter((show) => typeof show?.name === "string" && normalize(show.name) === normalize(title)) : [];
      if (matches.length !== 1) return null;
      const show = matches[0], name = show?.webChannel?.name || show?.network?.name;
      if (typeof name !== "string" || !name.trim() || name.length > 120) return null;
      return `Original ${show.webChannel?.name ? "streaming service" : "network"}: ${name.trim()} (TVMaze)`;
    } catch { return null; }
  }
  return null;
}
