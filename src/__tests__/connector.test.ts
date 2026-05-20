import { afterEach, describe, expect, it, vi } from "vitest";
import { ITunesConnector } from "../index";

function mockFetch(handler: (url: string) => unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(new Response(JSON.stringify(handler(url)), {
      status: 200, headers: { "content-type": "application/json" },
    }));
  });
}

describe("ITunesConnector (contract)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares meta", () => {
    const c = new ITunesConnector();
    expect(c.meta.id).toBe("itunes");
    expect(c.meta.capabilities).toEqual(expect.arrayContaining(["search", "stream"]));
  });

  it("search returns track-shaped results", async () => {
    mockFetch((url) => {
      expect(url).toContain("itunes.apple.com/search");
      expect(url).toContain("term=mozart");
      return {
        resultCount: 1,
        results: [{
          trackId: 391253062,
          artistName: "Ballet Dance Company",
          trackName: "Turkish March",
          collectionName: "Mozart Best",
          artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg",
          previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
          trackTimeMillis: 215000,
          releaseDate: "2009-01-01",
        }],
      };
    });
    const c = new ITunesConnector();
    await c.init();
    const r = await c.search({ keyword: "mozart", pageSize: 10 });
    expect(r.tracks).toHaveLength(1);
    const t = r.tracks[0];
    expect(t.id).toBe("itunes:391253062");
    expect(t.title).toBe("Turkish March");
    expect(t.artist).toBe("Ballet Dance Company");
    expect(t.album).toBe("Mozart Best");
    expect(t.coverUrl).toContain("600x600"); // upscaled from 100x100
    expect(t.durationSec).toBe(215);
  });

  it("listPlaylists returns Apple Marketing chart entries", async () => {
    const c = new ITunesConnector();
    await c.init();
    const r = await c.listPlaylists!();
    // Three default feeds, no fetch needed (static)
    expect(r.playlists.length).toBe(3);
    const ids = r.playlists.map(p => p.id);
    expect(ids[0]).toMatch(/^itunes-playlist:/);
    expect(r.playlists[0].curator).toBe("Apple Marketing");
  });

  it("getPlaylistTracks reads from Apple RSS chart", async () => {
    mockFetch((url) => {
      expect(url).toContain("rss.applemarketingtools.com");
      return {
        feed: {
          results: [
            { id: "111", name: "Hit", artistName: "X", collectionName: "Y", artworkUrl100: "https://x/100x100bb.jpg", releaseDate: "2025-01-01" },
            { id: "222", name: "Hit2", artistName: "Z" },
          ],
        },
      };
    });
    const c = new ITunesConnector();
    await c.init();
    const r = await c.getPlaylistTracks!("itunes-playlist:us/most-played/50");
    expect(r.tracks).toHaveLength(2);
    expect(r.tracks[0].id).toBe("itunes:111");
    expect(r.tracks[0].coverUrl).toContain("600x600");
  });

  it("getStreamUrl returns a 30s preview", async () => {
    mockFetch((url) => {
      expect(url).toContain("itunes.apple.com/lookup");
      return {
        resultCount: 1,
        results: [{
          trackId: 391253062,
          artistName: "X", trackName: "Y",
          previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
        }],
      };
    });
    const c = new ITunesConnector();
    await c.init();
    const info = await c.getStreamUrl("itunes:391253062");
    expect(info).not.toBeNull();
    expect(info!.url).toContain("audio-ssl.itunes.apple.com");
    expect(info!.format).toBe("m4a");
  });
});
