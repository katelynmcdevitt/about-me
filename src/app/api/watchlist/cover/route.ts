import { findCover } from "@/server/watchlist/cover";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cover = await findCover(params.get("title") ?? "", params.get("kind") ?? "");
  return Response.json({ cover }, { headers: { "Cache-Control": "no-store" } });
}
