# Inkmaid - Claude Code 開発ガイド

**手書きとAIで直感的に図解するフルスタックプラットフォーム**

このドキュメントは Claude Code を使用した開発のためのガイドラインです。

---

## プロジェクト概要

Inkmaidは、ブラウザ上での手書き入力とAIエージェントによる論理的な構造操作を融合し、Mermaid図（フローチャート、ER図、シーケンス図等）を作成・編集・管理できるプラットフォームです。

### コアバリュー

- 直感的な手書き入力による図形作成
- AIによる高精度な図形認識とMermaid変換
- バージョン管理による編集履歴の保持
- 複数のAIプロバイダー対応（OpenAI / Google / Anthropic）

---

## 技術スタック

| レイヤー | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| **Framework** | Next.js (App Router) | 15 | SSR/ISRと直感的なルーティング |
| **Language** | TypeScript | 5 | 型安全なコード記述 |
| **API** | tRPC | v11 | 完全型安全なクライアント/サーバー通信 |
| **Database** | PostgreSQL + Drizzle ORM | 16 | 高速なデータ操作 |
| **Styling** | Tailwind CSS | 4 | モダンなUI実装 |
| **AI** | Vercel AI SDK | latest | LLMストリーミングとTool Calling |
| **Canvas** | Konva.js | latest | 手書き入力レイヤー |
| **Diagram** | Mermaid.js | latest | 図の描画 |
| **Linter/Formatter** | Biome | latest | Rust製の高速コード品質管理 |
| **Testing** | Vitest | latest | ユニットテスト |
| **Package Manager** | pnpm | 9.15.1 | 効率的なパッケージ管理 |
| **Container** | Docker Compose | latest | 開発環境セットアップ |

---

## ディレクトリ構成

```
.
├── apps/
│   └── web/                    # Next.jsアプリケーション
│       ├── src/
│       │   ├── app/            # Next.js App Router ページ
│       │   ├── components/     # Reactコンポーネント
│       │   │   ├── canvas/     # Canvas関連 (Konva.js)
│       │   │   ├── chat/       # チャットUI
│       │   │   └── diagram/    # Mermaid表示
│       │   ├── lib/            # ユーティリティ、クライアント設定
│       │   │   ├── ai/         # AI SDK ロジック
│       │   │   ├── trpc/       # tRPCクライアント
│       │   │   └── utils/      # 汎用ユーティリティ
│       │   └── server/         # サーバーサイドロジック
│       │       ├── db/         # Drizzle スキーマ・クライアント
│       │       │   ├── schema.ts
│       │       │   └── index.ts
│       │       └── trpc/       # tRPC ルーター
│       │           ├── routers/
│       │           │   ├── diagram.ts
│       │           │   ├── ai.ts
│       │           │   └── index.ts
│       │           └── init.ts
│       └── public/             # 静的ファイル
├── doc/                        # ドキュメント
│   ├── develop.md              # 設計ドキュメント
│   ├── development-guide.md    # 開発ガイド
│   ├── api-reference.md        # APIリファレンス
│   ├── troubleshooting.md      # トラブルシューティング
│   └── logs/                   # 開発ログ
│       └── YYYY/MM/            # 年/月でまとめる
├── docker-compose.yml          # 開発環境用Docker設定
├── biome.json                  # Biome設定
└── .claude/                    # Claude Code設定（このディレクトリ）
    └── README.md               # このファイル
```

---

## コーディング規約

### 一般原則

1. **日本語でのコミュニケーション**
   - コメント、ドキュメント、エラーメッセージは日本語で記述
   - ユーザー向けメッセージは特に丁寧でわかりやすく

2. **型安全性の徹底**
   - TypeScriptの型を明示的に定義する
   - `any` は**使用禁止**（やむを得ない場合は `unknown` を検討）
   - 関数の引数と戻り値の型を必ず定義

3. **ドキュメント**
   - 公開関数・コンポーネントにはJSDocコメントを付ける
   - 複雑なロジックには実装の意図を説明するコメントを追加

4. **エラーハンドリング**
   - すべての非同期処理で適切なエラーハンドリングを実装
   - tRPCエラーは `TRPCError` を使用
   - ユーザー向けエラーメッセージは具体的な解決策を含める

### ファイル命名規則

| 種類 | 命名規則 | 例 |
|-----|---------|-----|
| **Reactコンポーネント** | PascalCase | `DiagramCanvas.tsx` |
| **ページコンポーネント** | kebab-case | `diagram-editor/page.tsx` |
| **フック** | camelCase + use prefix | `useDiagram.ts` |
| **ユーティリティ関数** | camelCase | `parseStroke.ts` |
| **型定義ファイル** | camelCase + .types | `diagram.types.ts` |
| **定数** | SCREAMING_SNAKE_CASE | `MAX_STROKE_COUNT` |
| **tRPCルーター** | camelCase | `diagramRouter.ts` |

### React/Next.js

1. **Server Components優先**
   - デフォルトはServer Components
   - Client Componentsは必要な場合のみ `"use client"` を明示

2. **コンポーネント定義**
   ```tsx
   // ✅ Good - 関数宣言
   export default function DiagramCanvas() {
     return <div>...</div>
   }

   // ❌ Avoid - アロー関数
   const DiagramCanvas = () => {
     return <div>...</div>
   }
   ```

3. **カスタムフック**
   - `use` プレフィックスで命名
   - ロジックの再利用性を考慮
   ```tsx
   function useDiagram(projectId: string) {
     const { data, isLoading } = trpc.diagram.get.useQuery({ projectId })
     return { diagram: data, isLoading }
   }
   ```

### tRPC

1. **ルーター構成**
   - 機能ごとにルーターを分割（`diagram.ts`, `ai.ts`）
   - `apps/web/src/server/trpc/routers/index.ts` で統合

2. **入力バリデーション**
   - Zodスキーマで厳密にバリデーション
   ```typescript
   import { z } from "zod"

   export const diagramRouter = router({
     create: publicProcedure
       .input(z.object({
         name: z.string().min(1).max(255),
         projectId: z.string().uuid(),
       }))
       .mutation(async ({ ctx, input }) => {
         // 実装
       }),
   })
   ```

3. **エラーハンドリング**
   ```typescript
   import { TRPCError } from "@trpc/server"

   throw new TRPCError({
     code: "NOT_FOUND",
     message: "指定されたプロジェクトが見つかりません",
   })
   ```

### Drizzle ORM

1. **スキーマ定義**
   ```typescript
   import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core"

   export const projects = pgTable("projects", {
     id: uuid("id").defaultRandom().primaryKey(),
     name: varchar("name", { length: 255 }).notNull(),
     createdAt: timestamp("created_at").defaultNow().notNull(),
     updatedAt: timestamp("updated_at").defaultNow().notNull(),
   })

   // 型エクスポート
   export type Project = typeof projects.$inferSelect
   export type NewProject = typeof projects.$inferInsert
   ```

2. **命名規則**
   - テーブル名: スネークケース（複数形）
   - カラム名: スネークケース
   - TypeScript型: PascalCase

### Tailwind CSS

1. **ユーティリティクラスの使用**
   - 基本的にユーティリティクラスを直接使用
   - 複雑な組み合わせは `cn()` ヘルパーで結合

2. **レスポンシブデザイン**
   - Mobile-firstアプローチ
   - Tailwindのブレークポイントを活用（`sm:`, `md:`, `lg:`）

3. **ダークモード対応**
   - 将来的な対応を考慮した実装（`dark:` プレフィックス）

### 状態管理

| 状態の種類 | 推奨アプローチ |
|-----------|--------------|
| **サーバー状態** | tRPC + TanStack Query |
| **ローカル状態** | `useState` / `useReducer` |
| **フォーム状態** | React Hook Form |
| **グローバル状態** | Zustand（必要な場合のみ） |

---

## 重要なコマンド

### 環境セットアップ（Git Worktree対応）

```bash
# worktree用の環境変数を自動設定（一意なポートを自動割り当て）
pnpm setup

# デフォルトポート（5432, 3000）で環境設定（メインリポジトリ向け）
pnpm setup:default

# 手動でポートを指定する場合
DB_PORT=5433 NEXT_PORT=3001 pnpm setup
```

### 開発環境

```bash
# すべて起動（DB + Next.js開発サーバー）
pnpm dev:all

# Next.jsのみ起動（DBが既に起動している場合）
pnpm dev

# プロダクションビルド
pnpm build

# プロダクション起動
pnpm start
```

### データベース

```bash
# DBコンテナ起動
pnpm db:up

# DBコンテナ停止
pnpm db:down

# Dockerコンテナの状態を確認
pnpm db:status

# スキーマをDBに反映（開発時）
pnpm db:push

# マイグレーションファイル生成
pnpm db:generate

# マイグレーション実行
pnpm db:migrate

# Drizzle Studio起動（DB GUI）
pnpm db:studio

# DBログ表示
pnpm db:logs

# DB再起動
pnpm db:restart

# DB完全リセット（データ削除）
pnpm db:reset
```

### コード品質

```bash
# Lintチェック
pnpm lint

# Lint自動修正
pnpm lint:fix

# コードフォーマット
pnpm format

# テスト実行
pnpm test

# テストのWatch mode
pnpm test -- --watch
```

### Git

```bash
# マージ済みブランチの削除
pnpm git:clean-branches
```

---

## Git Worktree での複数環境構築

Git worktreeを使用すると、同じリポジトリで複数のブランチを同時に作業できます。
各worktreeで独立したDocker環境（PostgreSQL）と開発サーバーが動作します。

### Worktree の作成と開発

```bash
# 1. worktreeを作成
git worktree add ../inkmaid-feature-auth feature/auth

# 2. worktreeに移動
cd ../inkmaid-feature-auth

# 3. 依存関係をインストール
pnpm install

# 4. 環境をセットアップ（一意なポートが自動割り当て）
pnpm setup

# 5. 開発開始
pnpm dev:all
```

### ポート割り当ての仕組み

- ディレクトリ名のハッシュ値から0-99のオフセットを自動計算
- PostgreSQL: `5432 + offset`
- Next.js: `3000 + offset`
- 同じディレクトリ名なら常に同じポートが割り当てられる

### Docker分離の仕組み

- `COMPOSE_PROJECT_NAME` でコンテナ名が分離
- ボリュームも自動的に分離
- 複数のworktreeが同時に独立したDBを持てる

### Worktree の削除

```bash
# worktreeを削除する前にDockerを停止
cd ../inkmaid-feature-auth
pnpm db:down

# worktreeを削除
cd ../inkmaid
git worktree remove ../inkmaid-feature-auth
```

詳細は `doc/development-guide.md` の「Git Worktree での複数環境構築」セクションを参照してください。

---

## 開発ワークフロー

### 1. 新機能の追加

```mermaid
graph LR
    A[設計確認] --> B[ブランチ作成]
    B --> C[実装]
    C --> D[CIチェック]
    D --> E[開発ログ更新]
    E --> F[コミット]
    F --> G[PR作成]
```

#### ステップ詳細

1. **設計確認**
   - `doc/develop.md` で設計思想を確認
   - 既存のパターンとの整合性をチェック

2. **ブランチ作成**
   ```bash
   git checkout -b feature/機能名
   # または
   git checkout -b fix/バグ名
   ```

3. **実装**
   - コーディング規約に従う
   - 型安全性を確保
   - 適切なエラーハンドリングを実装

4. **CIチェック（必須）**
   ```bash
   # Lint チェック
   pnpm lint
   
   # 型チェック
   pnpm --filter web exec tsc --noEmit
   
   # 自動修正が必要な場合
   pnpm lint:fix
   ```

5. **開発ログ更新**
   - `doc/logs/YYYY/MM/YYYYMMDD-N.md` を作成/更新
   - 実装内容、変更ファイル、次のステップを記録

6. **コミット**
   ```bash
   git add .
   git commit -m "機能: XXXを追加"
   ```

7. **PR作成**
   - 変更内容の概要を記述
   - レビュワーに文脈を提供

### 2. DBスキーマの変更

```bash
# 1. schema.ts を編集
# 2. スキーマをDBに反映
pnpm db:push

# 3. 型定義を再生成（必要に応じて）
# 4. アプリケーションコードを更新
```

### 3. tRPCルーターの追加

1. `apps/web/src/server/trpc/routers/` に新しいルーターファイルを作成
2. ルーターを `apps/web/src/server/trpc/routers/index.ts` に登録
3. クライアント側でtRPCフックを使用

```typescript
// サーバー側
export const newRouter = router({
  list: publicProcedure.query(async () => {
    // 実装
  }),
})

// routers/index.ts
import { newRouter } from "./new"

export const appRouter = router({
  // 既存のルーター...
  new: newRouter,
})

// クライアント側
const { data } = trpc.new.list.useQuery()
```

### 4. Server/Client Components の分離

```tsx
// ✅ Server Component（デフォルト）
// app/page.tsx
import { ClientComponent } from "@/components/ClientComponent"

export default async function Page() {
  const data = await fetchData() // サーバーサイドでデータ取得
  return <ClientComponent initialData={data} />
}

// ✅ Client Component
// components/ClientComponent.tsx
"use client"

import { useState } from "react"

export function ClientComponent({ initialData }) {
  const [state, setState] = useState(initialData)
  // インタラクティブな実装
  return <div>...</div>
}
```

---

## 重要なファイル

| ファイルパス | 説明 | いつ編集するか |
|------------|------|--------------|
| `apps/web/src/server/db/schema.ts` | DBスキーマ定義 | テーブル追加・変更時 |
| `apps/web/src/server/trpc/routers/index.ts` | tRPCルーター統合 | 新しいAPIルーター追加時 |
| `apps/web/src/lib/trpc/index.ts` | tRPCクライアント設定 | API設定変更時 |
| `biome.json` | Linter/Formatter設定 | コード規約変更時 |
| `docker-compose.yml` | Docker設定 | 開発環境変更時 |
| `doc/develop.md` | 設計ドキュメント | アーキテクチャ変更時 |
| `doc/logs/` | 開発ログ | 作業終了時 |

---

## AI開発時のガイドライン

### 作業前

1. **設計ドキュメントの確認**
   ```bash
   # 設計思想を理解
   cat doc/develop.md
   ```

2. **既存コードのパターン確認**
   - 同様の機能の実装を参照
   - コーディングスタイルを統一

3. **依存関係の確認**
   - 必要なライブラリが既にインストールされているか確認
   - 新規ライブラリは必要最小限に

### 実装中

1. **型安全性の確保**
   - 型エラーがないことを確認
   - `any` は使用しない

2. **段階的な実装**
   - 一度に多くの変更をしない
   - テスト可能な単位で実装

3. **エラーハンドリング**
   - 想定されるエラーケースを考慮
   - ユーザーフレンドリーなエラーメッセージ

### 作業後 ⚠️ **重要**

作業終了時には、以下のドキュメントを必ず更新してください：

#### 1. **開発ログの更新**

```bash
# ディレクトリ作成
mkdir -p doc/logs/2025/12

# ログファイル作成（例: 2025年12月22日、1回目）
# doc/logs/2025/12/20251222-1.md
```

**ログのテンプレート:**
```markdown
# YYYY/MM/DD - 作業ログ N

## 実装内容

- [機能/修正の説明]

## 追加・変更したファイル

- `path/to/file1.ts`: [変更内容]
- `path/to/file2.tsx`: [変更内容]

## 技術的な詳細

[実装の詳細、工夫した点、注意点など]

## 次のステップ

- [ ] TODO1
- [ ] TODO2

## 参考

- [関連するドキュメントやリンク]
```

#### 2. **APIリファレンスの更新**

以下の変更を行った場合は `doc/api-reference.md` を更新してください：

- tRPCルーターの新規追加・変更
- REST APIエンドポイントの追加
- 型定義の変更
- 使用例のコード追加

#### 3. **TODOリストの更新**

機能を完了したら `doc/TODO.md` を更新してください：

- 完了したタスクを「🟢 完了済み」セクションに移動
- 新しいタスクがあれば優先度に応じて追加
- 「最終更新」の日付を更新

#### 4. **CIチェック（必須）** ⚠️

**作業完了前に、CIと同じチェックを必ず実行すること：**

```bash
# 1. Lint チェック（Biome）- 必須
pnpm lint

# 2. 型チェック（TypeScript）- 必須
pnpm --filter web exec tsc --noEmit

# 3. ビルドチェック（大きな変更の場合に推奨）
DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy pnpm build
```

| チェック | コマンド | 必須 |
|---------|---------|------|
| Lint | `pnpm lint` | ✅ |
| Type Check | `pnpm --filter web exec tsc --noEmit` | ✅ |
| Build | `pnpm build` | 推奨 |

**自動修正が必要な場合:**

```bash
pnpm lint:fix
```

#### 5. **動作確認**

- ブラウザで実際に動作確認
- エッジケースのテスト

---

## トラブルシューティング

### よくある問題と解決策

#### 1. DB接続エラー

```bash
# 症状: DATABASE_URL connection error

# 解決策:
pnpm db:up          # DBコンテナを起動
pnpm db:logs        # ログを確認
pnpm db:restart     # 再起動してみる
```

#### 2. 型エラー（tRPCクライアント）

```bash
# 症状: tRPC型が正しく認識されない

# 解決策:
# 1. サーバーを再起動
# 2. TypeScriptサーバーを再起動（VSCode: Cmd+Shift+P → "Restart TS Server"）
# 3. node_modulesを再インストール
pnpm install
```

#### 3. Biome エラー

```bash
# 症状: Lint/Format エラー

# 解決策:
pnpm lint:fix       # 自動修正
pnpm format         # フォーマット実行
```

#### 4. マイグレーションエラー

```bash
# 症状: schema.ts変更後にエラー

# 解決策:
pnpm db:push        # 開発環境ではpushを使用
# または
pnpm db:reset       # DB完全リセット（データ削除注意）
```

詳細は `doc/troubleshooting.md` を参照してください。

---

## セキュリティガイドライン

### 環境変数の管理

1. **機密情報は.env.localに**
   - APIキー、DB接続情報は `.env.local` に保存
   - `.env.local` は `.gitignore` に含まれている
   - 本番環境では環境変数を適切に設定

2. **コミット前のチェック**
   - 機密情報がコードに含まれていないか確認
   - `.env.example` にはサンプル値のみ記載

### 入力バリデーション

1. **サーバーサイドで厳密にバリデーション**
   ```typescript
   .input(z.object({
     email: z.string().email(),
     age: z.number().min(0).max(150),
   }))
   ```

2. **XSS対策**
   - ユーザー入力を直接HTMLに埋め込まない
   - Reactの自動エスケープを信頼
   - `dangerouslySetInnerHTML` は避ける

3. **SQL Injection対策**
   - Drizzle ORMのパラメータ化クエリを使用
   - 生のSQLは避ける

---

## パフォーマンス最適化

### Next.js

1. **画像最適化**
   ```tsx
   import Image from "next/image"

   <Image
     src="/path/to/image.png"
     width={500}
     height={300}
     alt="説明"
   />
   ```

2. **動的インポート**
   ```tsx
   import dynamic from "next/dynamic"

   const HeavyComponent = dynamic(() => import("./HeavyComponent"), {
     ssr: false,
     loading: () => <p>読み込み中...</p>,
   })
   ```

### データベース

1. **インデックスの活用**
   - 頻繁に検索されるカラムにインデックスを追加
   ```typescript
   export const projects = pgTable("projects", {
     // ...
   }, (table) => ({
     nameIdx: index("name_idx").on(table.name),
   }))
   ```

2. **N+1問題の回避**
   - Drizzleの `with` を使用したリレーション取得
   ```typescript
   const result = await db.query.projects.findMany({
     with: {
       diagrams: true,
     },
   })
   ```

---

## テスト戦略

### ユニットテスト（Vitest）

```typescript
import { describe, it, expect } from "vitest"
import { parseStroke } from "./parseStroke"

describe("parseStroke", () => {
  it("直線を正しく認識する", () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(parseStroke(stroke)).toBe("line")
  })
})
```

### テスト実行

```bash
# すべてのテスト実行
pnpm test

# Watch mode
pnpm test -- --watch

# カバレッジ
pnpm test -- --coverage
```

---

## CI/CD

GitHub Actionsで以下のチェックが自動実行されます（PRおよびmainブランチへのpush時）:

### CIチェック項目

| ジョブ | コマンド | 説明 |
|-------|---------|------|
| **Lint** | `pnpm lint` | Biomeによるコードスタイル・構文チェック |
| **Type Check** | `pnpm --filter web exec tsc --noEmit` | TypeScriptの型エラーチェック |
| **Build** | `pnpm build` | Next.jsのビルドが成功するか確認 |

### ローカルでCIと同じチェックを実行

```bash
# Lint チェック
pnpm lint

# 型チェック
pnpm --filter web exec tsc --noEmit

# ビルドチェック（オプション）
DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy pnpm build
```

**注意**: PRを作成する前に、これらのチェックをローカルで通過させてください。

### 自動デプロイ（今後の予定）

- Vercel or AWS
- mainブランチへのマージで自動デプロイ

---

## 参考リンク

### 公式ドキュメント

- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Biome Documentation](https://biomejs.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### プロジェクトドキュメント

- [設計ドキュメント](../doc/develop.md)
- [開発ガイド](../doc/development-guide.md)
- [APIリファレンス](../doc/api-reference.md)
- [トラブルシューティング](../doc/troubleshooting.md)
- [ライブラリ更新戦略](../doc/library-update-strategy.md)

---

## まとめ

このガイドは Claude Code を使用した効率的な開発をサポートするために作成されました。

### 開発の基本フロー

1. 設計ドキュメントを確認
2. コーディング規約に従って実装
3. テストとLintチェック
4. 開発ログの更新
5. コミットとPR作成

### 困ったときは

1. `doc/troubleshooting.md` を確認
2. 既存のコードパターンを参照
3. 公式ドキュメントを参照
4. チームメンバーに相談

Happy Coding! 🚀
