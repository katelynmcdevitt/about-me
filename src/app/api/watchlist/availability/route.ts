import { findAvailability } from "../../../../server/watchlist/availability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const where = await findAvailability(params.get("title") ?? "", params.get("kind") ?? "", { apiKey: process.env.TMDB_READ_ACCESS_TOKEN, region: process.env.WATCHLIST_REGION?.toUpperCase() });
  return Response.json({ where }, { headers: { "Cache-Control": "no-store" } });
}
