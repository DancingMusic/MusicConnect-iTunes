# @dancingmusic/music-connect-itunes

iTunes/Apple Music preview connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

🔗 **Live demo:** [https://dancingmusic.github.io/MusicConnect-iTunes/](https://dancingmusic.github.io/MusicConnect-iTunes/) — search + play table built from this connector's own `dist/index.js`.

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

## Versioned releases

This repo uses an auto-release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that creates a `v<package.json version>` tag + GitHub Release on every push to `main` whose version field has changed. Each release attaches the freshly-built `dist/index.js`.

**Pin to a specific version** (recommended for production):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-iTunes@v0.1.0/dist/index.js
```

**Always-latest** (handy for dev, but jsdelivr caches `@main` for up to a week):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-iTunes@main/dist/index.js
```

### Releasing a new version

1. Edit code under `src/`
2. `npm version patch` (or `minor` / `major`) — bumps `package.json`
3. `npm run build` — refreshes `dist/index.js`
4. Commit (including `dist/`) + push to `main`
5. The workflow detects the new version, creates the tag, and publishes the GitHub Release automatically
