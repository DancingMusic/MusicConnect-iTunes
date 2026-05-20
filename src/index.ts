/**
 * iTunes Search music connector for DancingMusic.
 *
 * Uses Apple's public iTunes Search API — global music catalog, returns
 * 30-second previews for every song, no auth required, CORS-friendly.
 * https://performance-partners.apple.com/search-api
 *
 * Track ID format: `itunes:<trackId>`
 */
import type {
  MusicConnector,
  MusicConnectorMeta,
  MusicListQuery,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
} from "@dancingmusic/music-store";

interface ITunesResult {
  trackId: number;
  artistName: string;
  trackName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  primaryGenreName?: string;
}

interface ITunesResponse {
  resultCount: number;
  results: ITunesResult[];
}

const SEARCH_URL = "https://itunes.apple.com/search";
const LOOKUP_URL = "https://itunes.apple.com/lookup";

function hiResArtwork(url100: string | undefined): string | undefined {
  if (!url100) return undefined;
  // 100x100 → 600x600
  return url100.replace(/\/100x100bb\.(?:jpg|png)$/i, "/600x600bb.jpg");
}

function toTrack(r: ITunesResult): MusicTrack {
  return {
    id: `itunes:${r.trackId}`,
    title: r.trackName || "Unknown",
    artist: r.artistName || "Unknown",
    album: r.collectionName,
    coverUrl: hiResArtwork(r.artworkUrl100),
    durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
    price: 0,
    currency: "USD",
    version: "1.0.0",
    createdAt: r.releaseDate || "",
    updatedAt: "",
  };
}

export class ITunesConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "itunes",
    name: "iTunes / Apple Music",
    description: "Apple iTunes Search — 30-second previews of millions of songs",
    version: "0.1.0",
    capabilities: ["search", "stream"],
  };

  async init(): Promise<void> {
    /* no-op */
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
    const keyword = (query.keyword || "").trim();
    const pageSize = Math.min(query.pageSize ?? 30, 200);

    if (!keyword) return { tracks: [], total: 0, page: 1, pageSize };

    const params = new URLSearchParams({
      term: keyword,
      entity: "song",
      limit: String(pageSize),
      media: "music",
    });
    const url = `${SEARCH_URL}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
    const data = (await res.json()) as ITunesResponse;
    return {
      tracks: data.results.map(toTrack),
      total: data.resultCount,
      page: query.page ?? 1,
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await fetch(`${LOOKUP_URL}?id=${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as ITunesResponse;
    const r = data.results?.[0];
    return r ? toTrack(r) : null;
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
    const id = this.parseId(trackId);
    if (!id) return null;
    const res = await fetch(`${LOOKUP_URL}?id=${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as ITunesResponse;
    const url = data.results?.[0]?.previewUrl;
    if (!url) return null;
    return { url, format: "m4a" };
  }

  private parseId(trackId: string): string | null {
    if (trackId.startsWith("itunes:")) return trackId.slice(7);
    if (/^\d+$/.test(trackId)) return trackId;
    return null;
  }
}

export default ITunesConnector;
