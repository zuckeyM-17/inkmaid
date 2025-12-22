# 🔧 開発ガイド

このドキュメントでは、Inkmaidプロジェクトの開発ワークフローについて詳しく説明します。

---

## 📁 ディレクトリ構成

```
.
├── apps/
│   └── web/                      # Next.js アプリケーション
│       ├── src/
│       │   ├── app/              # App Router ページ
│       │   │   ├── api/trpc/     # tRPC APIエンドポイント
│       │   │   ├── layout.tsx    # ルートレイアウト
│       │   │   └── page.tsx      # メインページ（手書きCanvas + Mermaid）
│       │   ├── components/       # UIコンポーネント
│       │   │   ├── DiagramCanvas.tsx      # メインキャンバス（統合）
│       │   │   ├── HandwritingCanvas.tsx  # 手書き入力
│       │   │   └── MermaidPreview.tsx     # Mermaid描画
│       │   ├── lib/
│       │   │   └── trpc/         # tRPCクライアント設定
│       │   └── server/
│       │       ├── db/           # Drizzle スキーマ・クライアント
│       │       └── trpc/         # tRPC ルーター定義
│       │           └── routers/
│       │               ├── ai.ts       # AI処理（ストローク解釈）
│       │               └── diagram.ts  # ダイアグラムCRUD
│       ├── drizzle.config.ts     # Drizzle設定
│       ├── Dockerfile            # 本番用Dockerfile
│       └── package.json
├── doc/                          # プロジェクトドキュメント
│   ├── develop.md                # 設計ドキュメント
│   ├── development-guide.md      # 開発ガイド（本ドキュメント）
│   ├── api-reference.md          # APIリファレンス
│   ├── troubleshooting.md        # トラブルシューティング
│   └── logs/                     # 開発ログ（YYYYMMDD-N.md形式）
├── docker-compose.yml            # 開発用（PostgreSQLのみ）
├── docker-compose.prod.yml       # 本番用（PostgreSQL + Web）
├── biome.json                    # Biome設定
├── pnpm-workspace.yaml           # pnpmワークスペース設定
└── package.json                  # ルートパッケージ設定
```

---

## 🌳 Git Worktree での複数環境構築

Git worktree を使用すると、同じリポジトリで複数のブランチを同時に作業できます。
各 worktree で独立した Docker 環境（PostgreSQL）と開発サーバーが動作します。

### 1. Worktree の作成

```bash
# 新しいworktreeを作成（フィーチャーブランチの場合）
git worktree add ../inkmaid-feature-auth feature/auth

# 新しいブランチで作成
git worktree add -b feature/new-canvas ../inkmaid-new-canvas

# worktree一覧を確認
git worktree list
```

### 2. 環境のセットアップ

各 worktree で環境セットアップスクリプトを実行します。
ディレクトリ名から自動的に一意なポートが割り当てられます。

```bash
# worktreeディレクトリに移動
cd ../inkmaid-feature-auth

# 依存関係をインストール
pnpm install

# 環境変数を自動設定（.env と apps/web/.env.local を生成）
pnpm setup

# 出力例：
#   プロジェクト名: inkmaid-feature-auth
#   PostgreSQL: 5447
#   Next.js: 3015
```

### 3. 開発の開始

```bash
# 通常通り開発を開始
pnpm dev:all

# 別のターミナルで本体も開発可能
cd ../inkmaid
pnpm dev:all
```

### 4. ポートの指定方法

```bash
# デフォルトポート（5432, 3000）を使用（メインリポジトリ向け）
pnpm setup:default

# 環境変数でポートを上書き
DB_PORT=5433 NEXT_PORT=3001 pnpm setup
```

### 5. 環境の状態確認

```bash
# Dockerコンテナの状態を確認
pnpm db:status

# 全プロジェクトのDockerコンテナを確認
docker ps --filter "name=inkmaid"
```

### 6. Worktree の削除

```bash
# worktreeを削除する前にDockerを停止
cd ../inkmaid-feature-auth
pnpm db:down

# worktreeを削除
cd ../inkmaid
git worktree remove ../inkmaid-feature-auth
```

### ポート割り当ての仕組み

- ディレクトリ名のハッシュ値から自動的にポートオフセット（0-99）を計算
- 同じディレクトリ名なら常に同じポートが割り当てられる
- PostgreSQL: `5432 + offset`
- Next.js: `3000 + offset`

### 注意事項

- `.env` と `apps/web/.env.local` はgitignoreに含まれているため、worktreeごとに個別管理
- 同じポートを使用する worktree を同時に起動しないよう注意
- worktree 削除前に必ず `pnpm db:down` を実行

---

## 🔄 開発ワークフロー

### 1. 日常的な開発

```bash
# 開発環境を起動（DB + Next.js）
pnpm dev:all

# http://localhost:${NEXT_PORT:-3000} で開発
# ファイルを編集するとホットリロードされます
```

### 2. データベーススキーマの変更

```bash
# 1. apps/web/src/server/db/schema.ts を編集

# 2. スキーマをDBに反映
pnpm db:push

# または、マイグレーションファイルを生成して適用
pnpm db:generate
pnpm db:migrate
```

### 3. tRPCルーターの追加

新しいルーターを追加する場合：

```typescript
// 1. apps/web/src/server/trpc/routers/example.ts を作成
import { z } from "zod";
import { publicProcedure, router } from "../init";

export const exampleRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return `Hello, ${input.name}!`;
    }),
});
```

```typescript
// 2. apps/web/src/server/trpc/routers/index.ts に登録
import { exampleRouter } from "./example";

export const appRouter = router({
  // 既存のルーター
  diagram: diagramRouter,
  ai: aiRouter,
  // 新しいルーター
  example: exampleRouter,
});
```

### 4. コンポーネントの追加

```
apps/web/src/components/
├── DiagramCanvas.tsx      # Server/Client統合コンポーネント
├── DynamicXxx.tsx         # Dynamic importラッパー（SSR回避用）
└── XxxComponent.tsx       # 実際のコンポーネント
```

ブラウザAPIを使用するコンポーネントは Dynamic import を使用：

```tsx
// DynamicMyComponent.tsx
"use client";
import dynamic from "next/dynamic";

const MyComponent = dynamic(() => import("./MyComponent"), {
  ssr: false,
  loading: () => <div>Loading...</div>,
});

export default MyComponent;
```

### 5. コミット前のチェック

```bash
# Lintとフォーマット
pnpm lint:fix

# テスト実行
pnpm test

# ビルド確認（オプション）
pnpm build
```

---

## 📋 コマンド一覧

### セットアップ

| コマンド | 説明 |
|---------|------|
| `pnpm setup` | worktree用の環境変数を自動設定 |

### 開発

| コマンド | 説明 |
|---------|------|
| `pnpm dev` | Next.js開発サーバーを起動 |
| `pnpm dev:all` | DB起動 → Next.js起動（推奨） |
| `pnpm build` | プロダクションビルド |
| `pnpm start` | ビルド済みアプリを起動 |

### データベース

| コマンド | 説明 |
|---------|------|
| `pnpm db:up` | PostgreSQLコンテナを起動 |
| `pnpm db:down` | PostgreSQLコンテナを停止 |
| `pnpm db:logs` | PostgreSQLのログを表示 |
| `pnpm db:status` | Dockerコンテナの状態を確認 |
| `pnpm db:reset` | データを削除して再起動 |
| `pnpm db:push` | スキーマをDBに反映 |
| `pnpm db:generate` | マイグレーションファイル生成 |
| `pnpm db:migrate` | マイグレーション実行 |
| `pnpm db:studio` | Drizzle Studio（DB GUI）を起動 |

### コード品質

| コマンド | 説明 |
|---------|------|
| `pnpm lint` | Biomeでコードをチェック |
| `pnpm lint:fix` | 問題を自動修正 |
| `pnpm format` | コードをフォーマット |
| `pnpm test` | Vitestでテスト実行 |

### 本番環境

| コマンド | 説明 |
|---------|------|
| `pnpm prod:build` | 本番用Dockerイメージをビルド |
| `pnpm prod:up` | 本番環境を起動（DB + Web） |
| `pnpm prod:down` | 本番環境を停止 |
| `pnpm prod:logs` | 本番環境のログを表示 |

---

## 🗄️ データベース構成

### テーブル一覧

| テーブル | 説明 |
|---------|------|
| `projects` | プロジェクト（図）の基本情報・図の種類 |
| `diagram_versions` | Mermaidコードのバージョン履歴 |
| `chat_sessions` | AIとの対話セッション |
| `chat_messages` | チャットメッセージ履歴 |
| `handwriting_strokes` | 手書きストロークデータ |

### 接続情報（開発環境）

| 項目 | 値 |
|-----|-----|
| Host | localhost |
| Port | 5432 |
| User | inkmaid |
| Password | inkmaid_password |
| Database | inkmaid |

### Drizzle Studioの使用

```bash
# GUIでデータベースを確認・編集
pnpm db:studio

# ブラウザで https://local.drizzle.studio が開きます
```

---

## 🧪 テスト

### テストの実行

```bash
# 全テスト実行
pnpm test

# ウォッチモード
pnpm test:watch

# カバレッジ
pnpm test:coverage
```

### テストファイルの配置

```
apps/web/src/
├── __tests__/           # テストファイル
│   ├── components/      # コンポーネントテスト
│   └── utils/           # ユーティリティテスト
└── ...
```

---

## 📝 開発ログの記録

作業終了時に `doc/logs/` に開発ログを記録します。

### ディレクトリ構造

年月でまとめて整理します：

```
doc/logs/
└── YYYY/          # 年
    └── MM/        # 月
        └── YYYYMMDD.md
```

例: `doc/logs/2025/12/20251221-1.md`

### ファイル命名規則

- `YYYYMMDD.md` - 通常のログ
- `YYYYMMDD-N.md` - 同日複数回の場合（N=1,2,3...）

### ログの内容

```markdown
# 開発ログ: YYYY-MM-DD (N)

## 概要

何を実装したかの概要

---

## 1. 実装した機能

詳細な説明

---

## 変更したファイル

```
apps/web/src/
├── ...
```

---

## 次のステップ

- [ ] 次にやること
```

---

## 関連ドキュメント

- [設計ドキュメント](./develop.md) - アーキテクチャと設計思想
- [APIリファレンス](./api-reference.md) - tRPCエンドポイント詳細
- [トラブルシューティング](./troubleshooting.md) - よくある問題と解決方法

