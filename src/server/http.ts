export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

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
    throw new HttpError("Use this app's local address to make changes.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError("Send JSON data.", 415);
  const max = 5 * 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new HttpError("Choose a file smaller than 5 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Missing request data.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError("Choose a file smaller than 5 MB.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("The uploaded data is not valid JSON.");
  } finally {
    reader.releaseLock();
  }
}
