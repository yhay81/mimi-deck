# Mimi Deck

気になるテーマから日本語ポッドキャストのエピソードを探し、「今度聴く」を端末へ残せるWebツールです。

<https://mimi-deck.yhay81.com>

## Main flow

- テーマや例のチップからエピソードを検索
- 関連順、新着順、短い順でカードを比較
- 最大20件をブラウザの「今度聴く」へ保存
- Apple Podcastsの番組ページで聴く

AppleのiTunes Search APIから定期生成した公開カタログを検索元として使います。利用者の検索語をAppleへ直接送信せず、検索語、番組名、保存カードはD1へ記録しません。Better Auth、外部解析SDK、音声プロキシ、決済はありません。

## Development

```powershell
vp env off
npm ci
npx wrangler d1 migrations apply mimi-deck --local
npm run dev
```

## Quality and release

```powershell
npm run release:check
npm run catalog:update
npm run check
npm test
npm run build
npm run deploy
npm run indexnow
npm run metrics
```

公開前後に、実検索、カード保存・削除、並び替え、Appleへの移動、モバイル幅、キーボード、CSP、期限削除を確認します。
