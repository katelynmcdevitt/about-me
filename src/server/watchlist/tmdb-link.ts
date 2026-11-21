// Accept only a TMDB title page of the expected media type; never fetch the URL itself.
export function tmdbIdFromLink(value: unknown, kind: string): number | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.themoviedb.org", "themoviedb.org"].includes(url.hostname) || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/(movie|tv)\/(\d+)(?:-[^/]*)?\/?$/);
    if (!match || match[1] !== (kind === "Movie" ? "movie" : kind === "TV show" ? "tv" : "")) return null;
    const id = Number(match[2]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}
