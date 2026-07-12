# MusicConnect-iTunes

Apple iTunes Search API 的 DancingMusic 匿名预览连接器。

- 实现 ID / 家族 ID：`itunes`
- 变体：`anonymous`
- 登录要求：`none`
- 能力：搜索、歌曲信息、官方预览片段、公开榜单
- 主机：Web、Desktop

它使用 Apple 公共 iTunes Search/Lookup API，不需要 API Key。播放内容是 Apple 提供的官方预览片段，通常约 30 秒，并不是 Apple Music 完整播放。

```json
{
  "storefront": "cn"
}
```

`storefront` 可选，默认 `us`。

公开榜单卡片会读取对应 Apple RSS 榜单第一首歌曲的真实封面；封面请求失败时榜单仍可正常打开。

## API

- `GET https://itunes.apple.com/search`
- `GET https://itunes.apple.com/lookup`

本仓库没有 MusicKit Token、Apple Music 用户登录或完整播放能力。如果以后接入 Apple Music 账号能力，应建立独立的 `apple-music-account` 仓库并遵循 Apple 的授权流程。

## 开发与发布

```bash
npm install
npm test
npm run build
```

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-iTunes@v0.5.2/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/)
