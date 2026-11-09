// Open Library supplies work covers independently of a particular reading format.
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export async function findBookCover(
  title: unknown,
  author: unknown,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (
    typeof title !== "string" ||
    typeof author !== "string" ||
    !title.trim() ||
    !author.trim() ||
    title.length > 2000 ||
    author.length > 1000
  )
    return null;
  const url = new URL("https://openlibrary.org/search.json");
  url.search = new URLSearchParams({
    title: title.trim(),
    author: author.trim(),
    fields: "title,author_name,cover_i",
    limit: "5",
  }).toString();
  try {
    const response = await fetcher(url.toString(), {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "ShelfNotes/1.0 (local reading library)",
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data?.docs)) return null;
    const match = data.docs.find(
      (doc: { title?: unknown; author_name?: unknown; cover_i?: unknown }) =>
        typeof doc?.title === "string" &&
        normalized(doc.title) === normalized(title) &&
        Array.isArray(doc.author_name) &&
        doc.author_name.some(
          (name) =>
            typeof name === "string" && normalized(name) === normalized(author),
        ) &&
        typeof doc.cover_i === "number" &&
        Number.isSafeInteger(doc.cover_i) &&
        doc.cover_i > 0,
    );
    return match?.cover_i ?? null;
  } catch {
    return null;
  }
}
