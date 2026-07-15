# talkWithMe

招待リンクを知る2人だけが使えるプライベートチャットアプリ。Vercel Serverless Functions + PostgreSQL で動作する。

## 技術スタック

Vercel Serverless Functions（Node.js） / PostgreSQL（`pg`） / バニラJavaScript・HTML・CSS（ビルド不要のフロントエンド） / Vercel CLI

## 特徴

- **招待制**: ルーム作成者が発行した招待リンクを受け取った1人だけが参加可能（最大2人）
- **上下分割レイアウト**: 上に相手のメッセージ、下に自分のメッセージと入力欄
- **文字数制限**: 1メッセージ最大 10,000文字 かつ 20,000バイト（UTF-8）。クライアント・サーバー両方で検証
- **画像送信**: PNG / JPEG / GIF / WebP、最大4MB（Vercelのリクエストボディ上限4.5MBに収めるため）
- **全データDB保存**: テキストも画像（BYTEA）もPostgreSQLに永続化
- **リアルタイム更新**: 2秒間隔のポーリングで新着メッセージ・相手のオンライン状態を反映
  （Vercelのサーバーレス関数はWebSocketの常時接続を維持できないためポーリング方式）

## 構成

| パス | 内容 |
|---|---|
| `api/rooms/index.js` | `POST /api/rooms` ルーム作成 |
| `api/rooms/[token]/join.js` | `POST /api/rooms/:token/join` 参加（最大2人） |
| `api/rooms/[token]/messages.js` | `GET` 新着ポーリング / `POST` テキスト送信 |
| `api/rooms/[token]/images.js` | `POST /api/rooms/:token/images` 画像送信 |
| `api/images/[id].js` | `GET /api/images/:id` 画像取得（本人確認あり） |
| `lib/db.js` | PostgreSQL接続・スキーマ定義（初回アクセス時に自動作成） |
| `lib/helpers.js` | 認証・バリデーション等の共通処理 |
| `public/` | フロントエンド（バニラJS、ビルド不要） |
| `vercel.json` | `/room/:token` を `room.html` にリライト |

## DBスキーマ

- `rooms` — ルームと招待トークン
- `participants` — 参加者（host / guest、ユーザートークンで認証、`last_seen` でオンライン判定）
- `messages` — メッセージ（text / image、画像はBYTEA + MIME）

## ローカル開発

1. PostgreSQL（[Neon](https://neon.tech) や [Vercel Postgres](https://vercel.com/storage/postgres) の無料枠でOK）を用意し、接続文字列を取得
2. `.env.example` を `.env` にコピーして `DATABASE_URL` を設定
3. 依存関係をインストールして `vercel dev` で起動（Vercel CLIのログインが必要）

```bash
npm install
npx vercel login   # 初回のみ、ブラウザでログイン
npx vercel dev
```

表示されたURL（例: http://localhost:3000）を開き「新しいチャットルームを作成」→ 招待リンクを相手に送る。

## Vercelへのデプロイ手順

1. **GitHubリポジトリを作成してpush**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   gh repo create talkWithMe --private --source=. --push
   # ghコマンドが無い場合はGitHub上で手動作成し、git remote add origin <URL> && git push -u origin main
   ```
2. **PostgreSQLを用意**: [Neon](https://neon.tech) または Vercelダッシュボードの Storage → Postgres で作成し、接続文字列（`DATABASE_URL`）を控える
3. **Vercelにインポート**: [vercel.com/new](https://vercel.com/new) からGitHubリポジトリを選択してインポート
4. **環境変数を設定**: プロジェクトの Settings → Environment Variables に `DATABASE_URL` を追加（Production / Preview 両方）
5. **Deploy** をクリック。以降は `git push` するたびに自動デプロイされる

初回アクセス時に `lib/db.js` がテーブルを自動作成するため、事前のマイグレーション作業は不要。

## 注意点

- Vercelのサーバーレス関数はリクエストボディが最大4.5MBのため、画像は4MBまでに制限
- 同一関数インスタンスが使い回されない限りDB接続はリクエストごとに新規作成される（`pg.Pool` の `max: 1` で対応）
