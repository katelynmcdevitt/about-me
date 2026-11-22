import { getWatchlistStore } from "../../../../server/watchlist/database";
import { HttpError, noCache, readJson } from "../../../../server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: noCache },
    );
  console.error(
    "Watchlist database error:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "The watchlist could not be loaded or saved. Check that the database is writable and try again.",
    },
    { status: 500, headers: noCache },
  );
}
export async function GET() {
  try {
    return Response.json(getWatchlistStore().get(), { headers: noCache });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    return Response.json(getWatchlistStore().apply(await readJson(request)), {
      headers: noCache,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
