"use client";

import dynamic from "next/dynamic";

const BooksApp = dynamic(() => import("./BooksApp"), {
  ssr: false,
  loading: () => (
    <p role="status" style={{ padding: "48px 24px" }}>
      Loading Shelf Notes…
    </p>
  ),
});

export default function BooksAppLoader() {
  return <BooksApp />;
}
