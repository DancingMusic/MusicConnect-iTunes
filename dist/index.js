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
      description: "Apple iTunes Search previews with optional MusicKit account tokens",
      version: "0.5.0",
      capabilities: ["search", "stream", "lyrics", "playlist", "login"],
      configSchema: [
        {
          key: "storefront",
          label: "Apple Music Storefront",
          type: "text",
          required: false,
          default: "us",
          placeholder: "us",
          help: "Apple Music storefront/country code, e.g. us, cn, jp."
        },
        {
          key: "appleDeveloperToken",
          label: "MusicKit Developer Token",
          type: "password",
          required: false,
          placeholder: "eyJhbGciOi...",
          help: "Apple Developer \u540E\u53F0\u7B7E\u53D1\u7684 MusicKit developer token\u3002"
        },
        {
          key: "appleMusicUserToken",
          label: "Apple Music User Token",
          type: "password",
          required: false,
          placeholder: "user-token",
          help: "\u901A\u8FC7 MusicKit JS \u5728\u6388\u6743\u57DF\u540D\u4E0B\u83B7\u5F97\u7684\u7528\u6237 token\u3002"
        }
      ]
    };
    this.appleDeveloperToken = "";
    this.appleMusicUserToken = "";
    this.storefront = "us";
  }
  async init(config) {
    const typed = config;
    this.appleDeveloperToken = typeof typed?.appleDeveloperToken === "string" ? typed.appleDeveloperToken : "";
    this.appleMusicUserToken = typeof typed?.appleMusicUserToken === "string" ? typed.appleMusicUserToken : "";
    this.storefront = typeof typed?.storefront === "string" && typed.storefront.trim() ? typed.storefront.trim().toLowerCase() : "us";
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      if (this.appleDeveloperToken && this.appleMusicUserToken) {
        return { status: "authenticated", user: { name: "Apple Music" }, message: "MusicKit tokens \u5DF2\u914D\u7F6E" };
      }
      return { status: "anonymous", message: "Apple Music \u9700\u8981\u914D\u7F6E MusicKit developer token \u548C user token" };
    }
    if (intent === "logout") {
      this.appleMusicUserToken = "";
      return {
        status: "anonymous",
        message: "\u5DF2\u6E05\u9664 Apple Music user token",
        configPatch: { appleMusicUserToken: "" }
      };
    }
    if (intent === "cancel") {
      return { status: "anonymous", message: "\u5DF2\u53D6\u6D88 Apple Music \u767B\u5F55" };
    }
    return {
      status: "anonymous",
      flow: "manual-token",
      actions: [{
        type: "open-url",
        label: "\u6253\u5F00 MusicKit \u6587\u6863",
        url: "https://developer.apple.com/documentation/musickitjs",
        message: "\u5728 Apple \u6388\u6743\u57DF\u540D\u4E0B\u901A\u8FC7 MusicKit JS \u83B7\u53D6 user token \u540E\u586B\u5165\u914D\u7F6E"
      }],
      message: "\u5728 Apple \u6388\u6743\u57DF\u540D\u4E0B\u901A\u8FC7 MusicKit JS \u83B7\u53D6 user token \u540E\u586B\u5165\u914D\u7F6E"
    };
  }
  async search(query) {
    const keyword = (query.keyword || "").trim();
    const pageSize = Math.min(query.pageSize ?? 30, 200);
    if (!keyword) return { tracks: [], total: 0, page: 1, pageSize };
    const params = new URLSearchParams({
      term: keyword,
      entity: "song",
      limit: String(pageSize),
      media: "music",
      country: this.storefront
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
    const country = this.storefront;
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
