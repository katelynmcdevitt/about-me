import { LibraryError } from "./errors";

export const noCache = { "Cache-Control": "no-store" };
export async function readJson(request: Request): Promise<unknown> {
  // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
  // Compare against the actual Host header, restricted to loopback addresses.
  const requestUrl = new URL(request.url);
  const local = new URL(
    `${requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`,
  );
  const origin = request.headers.get("origin");
  let sameOrigin = !origin;
  try {
    if (origin) sameOrigin = new URL(origin).origin === local.origin;
  } catch {}
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) ||
    !sameOrigin
  )
    throw new LibraryError(
      "Use this app's local address to make changes.",
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new LibraryError("Send JSON data.", 415);
  const max = 5 * 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new LibraryError("Choose a file smaller than 5 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LibraryError("Missing request data.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new LibraryError("Choose a file smaller than 5 MB.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof LibraryError) throw error;
    throw new LibraryError("The uploaded data is not valid JSON.");
  } finally {
    reader.releaseLock();
  }
}
export function apiError(error: unknown): Response {
  if (error instanceof LibraryError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: noCache },
    );
  console.error(
    "Books database request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "The library could not be saved or loaded. Check that the database file is writable and try again.",
    },
    { status: 500, headers: noCache },
  );
}
