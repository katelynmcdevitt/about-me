import type { Book } from "./model";

export type ImportSource = "goodreads" | "sheets" | "backup" | "browser";
export type ImportSummary = {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  ambiguous: number;
};
export type ImportRow = {
  row: number;
  title: string;
  action: "added" | "updated" | "unchanged" | "skipped" | "ambiguous";
  detail: string;
};
export type ImportPreview = {
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
  category?: string;
  tags?: string[];
  kind?: "Fiction" | "Nonfiction" | "Unclear";
  format?: "Audio" | "Physical" | "Kindle" | "Unclear";
};
