import {
  GOOGLE_SHEET_GIDS,
  GOOGLE_SHEET_ID,
} from "../../../../../features/books/sheet";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gid: string }> },
) {
  const { gid } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!GOOGLE_SHEET_GIDS.includes(gid)) {
    return Response.json(
      { error: "Unknown reading sheet tab." },
      { status: 404, headers },
    );
  }
  try {
    const upstream = await fetch(
      `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${gid}`,
      { cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    if (!upstream.ok) {
      return Response.json(
        {
          error:
            "The reading sheet is unavailable. Check its access or import a CSV instead.",
        },
        { status: 502, headers },
      );
    }
    const csv = await upstream.text();
    if (/^\s*</.test(csv) || !csv.trim()) {
      return Response.json(
        { error: "The reading sheet did not return CSV data." },
        { status: 502, headers },
      );
    }
    return new Response(csv, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch {
    return Response.json(
      {
        error: "Could not reach the reading sheet. Try again or import a CSV.",
      },
      { status: 502, headers },
    );
  }
}
