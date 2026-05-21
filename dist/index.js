// src/index.ts
var SEARCH_URL = "https://itunes.apple.com/search";
var LOOKUP_URL = "https://itunes.apple.com/lookup";
function hiResArtwork(url100) {
  if (!url100) return void 0;
  return url100.replace(/\/100x100bb\.(?:jpg|png)$/i, "/600x600bb.jpg");
}
function toTrack(r) {
  return {
    id: `itunes:${r.trackId}`,
    title: r.trackName || "Unknown",
    artist: r.artistName || "Unknown",
    album: r.collectionName,
    coverUrl: hiResArtwork(r.artworkUrl100),
    durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1e3) : 0,
    price: 0,
    currency: "USD",
    version: "1.0.0",
    createdAt: r.releaseDate || "",
    updatedAt: ""
  };
}
var ITunesConnector = class {
  constructor() {
    this.meta = {
      id: "itunes",
      name: "iTunes / Apple Music",
      description: "Apple iTunes Search \u2014 30-second previews of millions of songs",
      version: "0.4.0",
      capabilities: ["search", "stream", "lyrics", "playlist"]
    };
  }
  async init() {
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const pageSize = Math.min(query.pageSize ?? 30, 200);
    if (!keyword) return { tracks: [], total: 0, page: 1, pageSize };
    const params = new URLSearchParams({
      term: keyword,
      entity: "song",
      limit: String(pageSize),
      media: "music"
    });
    const url = `${SEARCH_URL}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
    const data = await res.json();
    return {
      tracks: data.results.map(toTrack),
      total: data.resultCount,
      page: query.page ?? 1,
      pageSize
    };
  }
  async getTrack(trackId) {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await fetch(`${LOOKUP_URL}?id=${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    return r ? toTrack(r) : null;
  }
  async getStreamUrl(trackId) {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await fetch(`${LOOKUP_URL}?id=${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const url = data.results?.[0]?.previewUrl;
    if (!url) return null;
    return { url, format: "m4a" };
  }
  /**
   * Lyrics via LRCLIB (https://lrclib.net). LRCLIB is a free, public, no-auth
   * crowd-sourced lyrics database with synced LRC for most popular songs.
   *
   * We look up the iTunes track first to recover its title/artist/duration,
   * then ask LRCLIB by title+artist (+ duration hint for disambiguation).
   * Returns the synced LRC as `text` when available; falls back to plain
   * lyrics; returns null when neither exists.
   */
  async getLyrics(trackId) {
    const track = await this.getTrack(trackId);
    if (!track?.title || !track.artist) return null;
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artist
    });
    if (track.album) params.set("album_name", track.album);
    if (track.durationSec) params.set("duration", String(track.durationSec));
    try {
      const res = await fetch(`https://lrclib.net/api/get?${params}`);
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (data.syncedLyrics) return { text: data.syncedLyrics };
      if (data.plainLyrics) return { text: data.plainLyrics };
      return null;
    } catch {
      return null;
    }
  }
  // ----- Playlists -----
  //
  // iTunes Search has no real "playlist" concept. We surface the Apple
  // Marketing Tools RSS charts (https://rss.applemarketingtools.com) as
  // virtual playlists — each chart is a list of recent hits. The default
  // catalog returns one playlist per popular feed; `category` can be one
  // of: most-played, new-releases, top-songs, top-albums.
  //
  // Playlist id format: `itunes-playlist:<country>/<feed>/<limit>`
  // e.g. `itunes-playlist:us/most-played/50`
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const country = "us";
    let feeds;
    if (query.category) feeds = [query.category];
    else if (query.sort === "new") feeds = ["new-releases-songs"];
    else if (query.sort === "hot" || query.sort === "trending") feeds = ["most-played"];
    else feeds = ["most-played", "new-releases-songs", "top-songs"];
    const playlists = feeds.map((feed) => ({
      id: `itunes-playlist:${country}/${feed}/50`,
      name: feedLabel(feed),
      description: `Apple Music ${country.toUpperCase()} \xB7 ${feed}`,
      trackCount: 50,
      curator: "Apple Marketing",
      externalUrl: `https://rss.applemarketingtools.com/api/v2/${country}/music/${feed}/50/songs.json`
    }));
    return { playlists, total: playlists.length, page, pageSize };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const raw = playlistId.startsWith("itunes-playlist:") ? playlistId.slice("itunes-playlist:".length) : playlistId;
    const [country = "us", feed = "most-played", limitStr = "50"] = raw.split("/");
    const limit = parseInt(limitStr, 10) || 50;
    const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/${feed}/${limit}/songs.json`;
    const res = await fetch(url);
    if (!res.ok) return { tracks: [], total: 0, page, pageSize };
    const data = await res.json();
    const items = data.feed?.results ?? [];
    const tracks = items.map((it) => ({
      id: `itunes:${it.id}`,
      title: it.name,
      artist: it.artistName,
      album: it.collectionName,
      coverUrl: it.artworkUrl100?.replace(/\/100x100bb\.(?:jpg|png)$/i, "/600x600bb.jpg"),
      durationSec: 0,
      price: 0,
      currency: "USD",
      version: "1.0.0",
      createdAt: it.releaseDate ?? "",
      updatedAt: ""
    }));
    return { tracks, total: tracks.length, page, pageSize };
  }
  parseId(trackId) {
    if (trackId.startsWith("itunes:")) return trackId.slice(7);
    if (/^\d+$/.test(trackId)) return trackId;
    return null;
  }
};
function feedLabel(feed) {
  const map = {
    "most-played": "Most Played",
    "top-songs": "Top Songs",
    "new-releases-songs": "New Releases",
    "top-albums": "Top Albums"
  };
  return map[feed] || feed;
}
var index_default = ITunesConnector;
export {
  ITunesConnector,
  index_default as default
};
