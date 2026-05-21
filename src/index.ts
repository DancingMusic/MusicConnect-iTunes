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
  MusicLyrics,
  MusicSearchResult,
  MusicStreamInfo,
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
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
    version: "0.4.0",
    capabilities: ["search", "stream", "lyrics", "playlist"],
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

  /**
   * Lyrics via LRCLIB (https://lrclib.net). LRCLIB is a free, public, no-auth
   * crowd-sourced lyrics database with synced LRC for most popular songs.
   *
   * We look up the iTunes track first to recover its title/artist/duration,
   * then ask LRCLIB by title+artist (+ duration hint for disambiguation).
   * Returns the synced LRC as `text` when available; falls back to plain
   * lyrics; returns null when neither exists.
   */
  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
    const track = await this.getTrack(trackId);
    if (!track?.title || !track.artist) return null;
    const params = new URLSearchParams({
      track_name: track.title,
      artist_name: track.artist,
    });
    if (track.album) params.set("album_name", track.album);
    if (track.durationSec) params.set("duration", String(track.durationSec));
    try {
      const res = await fetch(`https://lrclib.net/api/get?${params}`);
      if (!res.ok) {
        // 404 means LRCLIB has nothing for this song — that's fine, just null.
        return null;
      }
      const data = (await res.json()) as {
        syncedLyrics?: string | null;
        plainLyrics?: string | null;
      };
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

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const country = "us";
    // For iTunes, sort/category overlap conceptually — each RSS feed IS a
    // sort. We default to a 3-feed sampler; `sort: 'new'` picks the
    // new-releases feed only, `sort: 'hot' | 'trending'` picks most-played.
    let feeds: string[];
    if (query.category) feeds = [query.category];
    else if (query.sort === "new") feeds = ["new-releases-songs"];
    else if (query.sort === "hot" || query.sort === "trending") feeds = ["most-played"];
    else feeds = ["most-played", "new-releases-songs", "top-songs"];
    const playlists: MusicPlaylist[] = feeds.map(feed => ({
      id: `itunes-playlist:${country}/${feed}/50`,
      name: feedLabel(feed),
      description: `Apple Music ${country.toUpperCase()} · ${feed}`,
      trackCount: 50,
      curator: "Apple Marketing",
      externalUrl: `https://rss.applemarketingtools.com/api/v2/${country}/music/${feed}/50/songs.json`,
    }));
    // No pagination on a 3-entry list — return them all
    return { playlists, total: playlists.length, page, pageSize };
  }

  async getPlaylistTracks(
    playlistId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MusicSearchResult> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    const raw = playlistId.startsWith("itunes-playlist:")
      ? playlistId.slice("itunes-playlist:".length)
      : playlistId;
    const [country = "us", feed = "most-played", limitStr = "50"] = raw.split("/");
    const limit = parseInt(limitStr, 10) || 50;
    const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/${feed}/${limit}/songs.json`;
    const res = await fetch(url);
    if (!res.ok) return { tracks: [], total: 0, page, pageSize };
    const data = (await res.json()) as RssChart;
    const items = data.feed?.results ?? [];
    // Map RSS items → MusicTrack (no preview URL in RSS; trackId looked up via Search if needed)
    const tracks: MusicTrack[] = items.map(it => ({
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
      updatedAt: "",
    }));
    return { tracks, total: tracks.length, page, pageSize };
  }

  private parseId(trackId: string): string | null {
    if (trackId.startsWith("itunes:")) return trackId.slice(7);
    if (/^\d+$/.test(trackId)) return trackId;
    return null;
  }
}

interface RssChart {
  feed?: {
    results?: Array<{
      id: string;
      name: string;
      artistName: string;
      collectionName?: string;
      artworkUrl100?: string;
      releaseDate?: string;
    }>;
  };
}

function feedLabel(feed: string): string {
  const map: Record<string, string> = {
    "most-played": "Most Played",
    "top-songs": "Top Songs",
    "new-releases-songs": "New Releases",
    "top-albums": "Top Albums",
  };
  return map[feed] || feed;
}

export default ITunesConnector;
