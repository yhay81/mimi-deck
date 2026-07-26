# Metrics

`npm run metrics`は匿名セッション単位で次を集計します。

| Stage    | D1 event   | Meaning                       |
| -------- | ---------- | ----------------------------- |
| users    | `visited`  | 画面を開いた                  |
| searched | `searched` | 自分でテーマ検索した          |
| saved    | `saved`    | 1件以上「今度聴く」へ追加した |
| opened   | `opened`   | Apple Podcastsへ移動した      |
| returned | `returned` | 別日に再訪した                |

自動表示する初期検索は`searched`に数えません。イベントは日単位で重複排除し、35日後に削除します。検索語、番組名、エピソード名、保存カード、IPアドレスは集計DBへ保存しません。

分母0の比率は0とし、ページ表示だけを中核job完了とは扱いません。
