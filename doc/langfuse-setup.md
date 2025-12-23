# Langfuse セットアップガイド

## 概要

Langfuseは、LLMアプリケーションのオブザーバビリティと分析を提供するオープンソースツールです。
InkmaidではAI呼び出しのトレーシング、コスト分析、プロンプト改善に使用します。

## Git Worktreeでの運用について

**重要**: Langfuseは全worktreeで**共有**するサービスです。

- **アプリケーションDB（PostgreSQL）**: worktreeごとに個別
- **Langfuse一式**: 全worktreeで1つを共有

これにより、複数のworktreeでもリソース消費を抑え、トレースデータを一元管理できます。

## ローカル開発環境でのセットアップ

### 1. 環境変数を設定

Langfuseには暗号化キーが必要です。`.env` ファイルに設定してください：

```bash
# 暗号化キーを生成
openssl rand -hex 32

# .env に追加
LANGFUSE_ENCRYPTION_KEY=生成したキー
```

### 2. Langfuseサービスを起動

```bash
# プロジェクトルートで実行
pnpm langfuse:up

# または直接
docker compose --profile langfuse up -d
```

**注意**: 通常の `pnpm db:up` ではLangfuseは起動しません。明示的に `pnpm langfuse:up` を実行してください。

これにより以下のサービスが起動します：
- **langfuse**: Langfuse Web UI（http://localhost:3001）
- **langfuse-worker**: バックグラウンド処理ワーカー
- **langfuse-postgres**: Langfuse用PostgreSQL（ポート5433）
- **langfuse-clickhouse**: トレースデータ用ClickHouse
- **langfuse-redis**: キャッシュ用Redis
- **langfuse-minio**: S3互換オブジェクトストレージ（ポート9090）

### 2. Langfuseで初期設定

1. ブラウザで http://localhost:3001 にアクセス
2. 「Sign Up」からアカウントを作成
3. プロジェクトを作成（例: "Inkmaid Local"）
4. Settings → API Keys から API キーを作成
   - Public Key と Secret Key をコピー

### 3. 環境変数を設定

`apps/web/.env.local` に以下を追加：

```bash
# Langfuse設定
LANGFUSE_HOST=http://localhost:3001
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx  # UIで作成したキー
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx  # UIで作成したキー
```

### 4. 開発サーバーを再起動

```bash
cd apps/web
pnpm dev
```

## 本番環境（SaaS版）への移行

Langfuse Cloud（SaaS）を使用する場合は、環境変数を以下のように変更するだけです：

```bash
# Langfuse Cloud設定
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx  # Langfuse Cloudで作成したキー
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx  # Langfuse Cloudで作成したキー
```

## トレースの確認

1. アプリケーションでAI機能を使用（手書きストロークの解釈など）
2. Langfuse UI（http://localhost:3001）で「Traces」を開く
3. 各トレースで以下の情報を確認可能：
   - 入力（システムプロンプト、ユーザーメッセージ）
   - 出力（AIの応答）
   - レイテンシー
   - トークン使用量（対応プロバイダーの場合）
   - メタデータ（図の種類、ストローク数など）

## ポート設定

デフォルトのポート設定：

| サービス | ポート |
|---------|--------|
| Langfuse Web UI | 3001 |
| Langfuse PostgreSQL | 5433 |
| Inkmaid Web | 3000 |
| Inkmaid PostgreSQL | 5432 |

ポートを変更する場合は、`.env` ファイルで設定：

```bash
LANGFUSE_PORT=3002
LANGFUSE_DB_PORT=5434
```

## コマンドリファレンス

| コマンド | 説明 |
|---------|------|
| `pnpm langfuse:up` | Langfuseを起動 |
| `pnpm langfuse:down` | Langfuseを停止 |
| `pnpm langfuse:logs` | Langfuseのログを確認 |
| `pnpm langfuse:reset` | Langfuseのデータを削除して再起動 |

## トラブルシューティング

### Langfuseが起動しない

```bash
# コンテナのログを確認
pnpm langfuse:logs

# すべてのコンテナの状態を確認
docker compose --profile langfuse ps
```

### コンテナ名の競合エラー

```
Error: container name "inkmaid-langfuse-db" is already in use
```

古いコンテナが残っている場合は削除してください：

```bash
docker rm -f inkmaid-langfuse-db inkmaid-langfuse-clickhouse inkmaid-langfuse-redis inkmaid-langfuse-minio inkmaid-langfuse-worker inkmaid-langfuse
pnpm langfuse:up
```

### トレースが表示されない

1. 環境変数が正しく設定されているか確認
2. `LANGFUSE_PUBLIC_KEY` と `LANGFUSE_SECRET_KEY` がLangfuse UIで作成したものと一致しているか確認
3. 開発サーバーを再起動

### ClickHouseのヘルスチェックが失敗する

ClickHouseの起動には時間がかかることがあります。1〜2分待ってから再度確認してください。

```bash
docker compose restart langfuse
```

