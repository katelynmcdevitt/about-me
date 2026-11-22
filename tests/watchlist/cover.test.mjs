import test from "node:test";
import assert from "node:assert/strict";
import { loadFile } from "../helpers/load-module.mjs";
const { findCover } = await loadFile(
  new URL("../../src/server/watchlist/cover.ts", import.meta.url),
);

test("looks up exact TV show names and returns trusted artwork", async () => {
  const cover = await findCover("A Show!", "TV show", async (url, options) => {
    assert.equal(url.origin, "https://api.tvmaze.com");
    assert.equal(url.searchParams.get("q"), "A Show!");
    assert.ok(options.signal);
    return Response.json([
      {
        show: {
          name: "Another Show",
          image: { medium: "https://static.tvmaze.com/a.jpg" },
          url: "https://www.tvmaze.com/shows/1",
        },
      },
      {
        show: {
          name: "A Show",
          image: { medium: "https://static.tvmaze.com/b.jpg" },
          url: "https://www.tvmaze.com/shows/2",
        },
      },
    ]);
  });
  assert.deepEqual(cover, {
    url: "https://static.tvmaze.com/b.jpg",
    sourceUrl: "https://www.tvmaze.com/shows/2",
  });
});

test("looks up exact movie titles and rejects untrusted artwork", async () => {
  const cover = await findCover("A Movie", "Movie", async (url) => {
    assert.equal(url.searchParams.get("media"), "movie");
    return Response.json({
      results: [
        {
          trackName: "A Movie",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/100x100.jpg",
          trackViewUrl: "https://itunes.apple.com/movie/1",
        },
      ],
    });
  });
  assert.equal(cover.url, "https://is1-ssl.mzstatic.com/image/600x600.jpg");
  assert.equal(
    await findCover("A Movie", "Movie", async () =>
      Response.json({
        results: [
          {
            trackName: "A Movie",
            artworkUrl100: "https://example.com/a.jpg",
            trackViewUrl: "https://itunes.apple.com/movie/1",
          },
        ],
      }),
    ),
    null,
  );
});

test("unavailable services and nonmatching results leave cover unset", async () => {
  assert.equal(
    await findCover("A Show", "TV show", async () => {
      throw Error("offline");
    }),
    null,
  );
  assert.equal(
    await findCover("A Show", "TV show", async () =>
      Response.json([{ show: { name: "Other" } }]),
    ),
    null,
  );
  assert.equal(
    await findCover("", "Movie", () => {
      throw Error("should not search");
    }),
    null,
  );
});

test("does not select an arbitrary cover from ambiguous fallback matches", async () => {
  const shows = [
    {
      show: {
        name: "Same",
        image: { medium: "https://static.tvmaze.com/a.jpg" },
        url: "https://www.tvmaze.com/shows/1",
      },
    },
    {
      show: {
        name: "Same",
        image: { medium: "https://static.tvmaze.com/b.jpg" },
        url: "https://www.tvmaze.com/shows/2",
      },
    },
  ];
  assert.equal(
    await findCover("Same", "TV show", async () => Response.json(shows)),
    null,
  );
  const movies = [
    {
      trackName: "Same",
      artworkUrl100: "https://is1-ssl.mzstatic.com/a.jpg",
      trackViewUrl: "https://itunes.apple.com/movie/1",
    },
    {
      trackName: "Same",
      artworkUrl100: "https://is1-ssl.mzstatic.com/b.jpg",
      trackViewUrl: "https://itunes.apple.com/movie/2",
    },
  ];
  assert.equal(
    await findCover("Same", "Movie", async () =>
      Response.json({ results: movies }),
    ),
    null,
  );
});
