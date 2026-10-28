import { HttpError, noCache } from "../http";
export { readJson, noCache } from "../http";
export function campApiError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: noCache },
    );
  console.error(
    "Camp database request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "The camp plan could not be saved or loaded. Check that the database is writable and try again.",
    },
    { status: 500, headers: noCache },
  );
}
