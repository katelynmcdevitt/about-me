import { useEffect, useRef, useState } from "react";
import type {
  EntryChanges,
  ImportDecision,
  ImportInput,
  ImportPreview,
  Library,
} from "./contracts";

const emptyLibrary: Library = {
  books: [],
  categories: [],
  imports: [],
  revision: 0,
};
async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The library request failed.");
  return data as T;
}
export function useLibrary() {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const lock = useRef(false);
  const libraryRef = useRef(library);
  libraryRef.current = library;

  useEffect(() => {
    let active = true;
    fetch("/api/books/library", { cache: "no-store" })
      .then(responseData<Library>)
      .then((data) => {
        if (active) {
          setLibrary(data);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your library.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function perform<T>(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<T | null> {
    if (lock.current || !loaded) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        const message = await response.json();
        // Refresh authoritative data, then let the user explicitly retry their edit/import.
        const fresh = await responseData<Library>(
          await fetch("/api/books/library", { cache: "no-store" }),
        );
        setLibrary(fresh);
        setPreview(null);
        throw new Error(message.error || "The library changed. Try again.");
      }
      return await responseData<T>(response);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the change.",
      );
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function saveEntry(
    id: string,
    changes: EntryChanges,
    revision = libraryRef.current.revision,
  ) {
    const result = await perform<Library>(
      "/api/books/library",
      {
        action: "updateEntry",
        id,
        changes,
        revision,
      },
      "PATCH",
    );
    if (result) setLibrary(result);
    return !!result;
  }
  async function addReading(
    id: string,
    changes: EntryChanges,
    revision: number,
  ) {
    const result = await perform<Library>(
      "/api/books/library",
      { action: "addReading", id, changes, revision },
      "PATCH",
    );
    if (result) setLibrary(result);
    return !!result;
  }
  async function addCategory(name: string) {
    const result = await perform<Library>(
      "/api/books/library",
      { action: "addCategory", name, revision: libraryRef.current.revision },
      "PATCH",
    );
    if (result) setLibrary(result);
    return !!result;
  }
  async function previewInput(input: ImportInput) {
    const result = await perform<ImportPreview>("/api/books/imports", input);
    if (result) setPreview(result);
  }
  async function resolveImport(decision: ImportDecision) {
    if (!preview) return;
    const result = await perform<ImportPreview>(
      `/api/books/imports/${preview.id}`,
      { decision, version: preview.version },
      "PATCH",
    );
    if (result) setPreview(result);
  }
  async function confirmImport() {
    if (!preview) return false;
    const result = await perform<Library>(
      `/api/books/imports/${preview.id}/confirm`,
      { version: preview.version },
    );
    if (result) {
      setLibrary(result);
      setPreview(null);
    }
    return !!result;
  }
  return {
    library,
    loaded,
    busy,
    error,
    setError,
    preview,
    setPreview,
    saveEntry,
    addReading,
    addCategory,
    previewInput,
    confirmImport,
    resolveImport,
  };
}
