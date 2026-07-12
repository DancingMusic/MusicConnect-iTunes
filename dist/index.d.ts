import { MusicConnector, MusicConnectorMeta, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicLyrics, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

/**
 * iTunes Search music connector for DancingMusic.
 *
 * Uses Apple's public iTunes Search API — global music catalog, returns
 * 30-second previews for every song, CORS-friendly.
 * https://performance-partners.apple.com/search-api
 *
 * Track ID format: `itunes:<trackId>`
 */

interface ITunesConnectorConfig {
    storefront?: string;
}
declare class ITunesConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private storefront;
    init(config?: Record<string, unknown>): Promise<void>;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    /**
     * Lyrics via LRCLIB (https://lrclib.net). LRCLIB is a free, public, no-auth
     * crowd-sourced lyrics database with synced LRC for most popular songs.
     *
     * We look up the iTunes track first to recover its title/artist/duration,
     * then ask LRCLIB by title+artist (+ duration hint for disambiguation).
     * Returns the synced LRC as `text` when available; falls back to plain
     * lyrics; returns null when neither exists.
     */
    getLyrics(trackId: string): Promise<MusicLyrics | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    private parseId;
}

export { ITunesConnector, type ITunesConnectorConfig, ITunesConnector as default };
