import type { Metadata } from "next";
import BooksAppLoader from "@/features/books/BooksAppLoader";

export const metadata: Metadata = {
  title: "Shelf Notes",
  description:
    "A home for your finished books. Sync your reading log, import Goodreads CSVs, and organize your library.",
};

export default function BooksPage() {
  return <BooksAppLoader />;
}
