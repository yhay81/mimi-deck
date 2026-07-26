# Decisions

## 2026-07-26 — エピソード単位の探索に絞る

- 番組ディレクトリ全体を複製せず、テーマから具体的な1回を探すjobへ絞る
- Apple公式のiTunes Search APIを使い、日本ストア・日本語応答・explicit除外を指定する
- 公開アートワークはApple Podcastsへの近接リンクと一緒に表示する
- 音声は再配信せず、Apple Podcastsへ移動して聴く
- 「今度聴く」はlocalStorageだけに最大20件保存する
- Better Authは所有者アカウントが不要なため採用しない
- 検索語とカード内容をD1へ保存しない

参考:

- https://performance-partners.apple.com/search-api
- https://podori.jp/
