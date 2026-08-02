# Decisions

## 2026-07-26 — エピソード単位の探索に絞る

- 番組ディレクトリ全体を複製せず、テーマから具体的な1回を探すjobへ絞る
- Apple公式のiTunes Search APIから、日本ストア・日本語応答・explicit除外を指定した公開カタログを定期生成する
- 検索時は同梱カタログだけを照合し、Apple側の共有IP制限や利用者の検索語送信に依存しない
- 公開アートワークはApple Podcastsへの近接リンクと一緒に表示する
- 音声は再配信せず、Apple Podcastsへ移動して聴く
- 「今度聴く」はlocalStorageだけに最大20件保存する
- Better Authは所有者アカウントが不要なため採用しない
- 検索語とカード内容をD1へ保存しない

参考:

- https://performance-partners.apple.com/search-api
- https://podori.jp/
