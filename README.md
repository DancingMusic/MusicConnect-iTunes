# @dancingmusic/music-connect-itunes

iTunes/Apple Music preview connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

Uses Apple's public iTunes Search API — global music catalog (millions of songs), returns 30-second previews via the official `previewUrl` field. No API key, no auth, CORS-friendly.

## Use in DancingMusic

Open the music store → top-right connector switcher → **添加连接器** → **GitHub** tab → paste:

```
https://github.com/DancingMusic/MusicConnect-iTunes
```

## Track ID format

`itunes:<numeric-trackId>`

## API endpoints used

- `GET https://itunes.apple.com/search` — keyword search across the Apple music catalog
- `GET https://itunes.apple.com/lookup` — track metadata + preview URL

## Note on 30-second previews

Apple's preview clips are intentionally limited to 30 seconds — this is the format Apple provides for free third-party integrations. For full-length playback, users still need an Apple Music subscription.

## License

MIT
