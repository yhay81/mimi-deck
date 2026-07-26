# Security Policy

## Reporting

脆弱性はGitHubのPrivate vulnerability reportingから非公開で報告してください。公開Issueへ秘密情報や攻撃手順を投稿しないでください。

## Controls

- CSPでスクリプト、接続先、画像元を限定
- 検索bodyを1KB、検索語を40文字、1接続元あたり毎分10回へ制限
- Apple応答を必要な公開項目だけへ正規化し、URLのschemeとhostを許可リスト検査
- 結果は`textContent`で描画し、外部HTMLを実行しない
- イベント名、UUID、Content-Type、body size、Fetch Metadataを検証
- 匿名イベントを35日で削除

音声のプロキシ、ユーザー投稿、認証、ファイルアップロード、決済はありません。
