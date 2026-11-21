import { findAvailability } from "../../../../server/watchlist/availability";
import { HttpError, noCache, readJson } from "../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Invalid lookup request.");
    const { title, kind } = body as { title?: unknown; kind?: unknown };
    if (typeof title !== "string" || !title.trim() || title.length > 200 || (kind !== "Movie" && kind !== "TV show")) throw new HttpError("Enter a valid title and type.");
    if (!process.env.WATCHMODE_API_KEY) return Response.json({ error: "Add WATCHMODE_API_KEY to .env.local and restart the server to use Watchmode." }, { status: 503, headers: noCache });
    const result = await findAvailability(title, kind, { apiKey: process.env.WATCHMODE_API_KEY, region: process.env.WATCHLIST_REGION?.toUpperCase() });
    return Response.json(result ?? { where: null }, { headers: noCache });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers: noCache });
    return Response.json({ error: "Watchmode is unavailable. Check your key and try again." }, { status: 502, headers: noCache });
  }
}
