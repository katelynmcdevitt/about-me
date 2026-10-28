import { LibraryError } from "./errors";
import { noCache } from "../http";
export { noCache, readJson } from "../http";

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
