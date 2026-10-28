import type { Book } from "./model";

export type ImportSource = "goodreads" | "sheets" | "backup" | "browser";
export type ImportSummary = {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  ambiguous: number;
};
export type ImportDecision = {
  row: number;
  action: "match" | "new" | "skip" | "review";
  entryId?: string;
};
export type ImportRow = {
  review?: {
    author: string;
    isbn: string;
    dateRead: string;
    suggestedEntryIds: string[];
    decision?: ImportDecision;
  };
  row: number;
  title: string;
  action: "added" | "updated" | "unchanged" | "skipped" | "ambiguous";
  detail: string;
};
export type ImportPreview = {
  version: number;
  id: string;
  filename: string;
  source: ImportSource;
  summary: ImportSummary;
  rows: ImportRow[];
};
export type ImportHistory = {
  id: string;
  filename: string;
  source: ImportSource;
  createdAt: string;
  summary: ImportSummary;
};
export type Library = {
  books: Book[];
  categories: string[];
  imports: ImportHistory[];
  revision: number;
};
export type ImportInput = {
  source: ImportSource;
  filename: string;
  csv?: string;
  backup?: unknown;
};
export type EntryChanges = {
  title?: string;
  author?: string;
  isbn?: string;
  year?: number | null;
  pages?: number | null;
  rating?: number;
  dateRead?: string;
  category?: string;
  tags?: string[];
  kind?: "Fiction" | "Nonfiction" | "Unclear";
  format?: "Audio" | "Physical" | "Kindle" | "Unclear";
};
