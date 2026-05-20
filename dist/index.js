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
      version: "0.1.0",
      capabilities: ["search", "stream"]
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
  parseId(trackId) {
    if (trackId.startsWith("itunes:")) return trackId.slice(7);
    if (/^\d+$/.test(trackId)) return trackId;
    return null;
  }
};
var index_default = ITunesConnector;
export {
  ITunesConnector,
  index_default as default
};
