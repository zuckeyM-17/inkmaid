# 📝 プロジェクト名: Inkmaid

**〜手書きとAIで直感的に図解するフルスタックプラットフォーム〜**

## 1. プロジェクトビジョン

ブラウザ上での「手書き」という直感的な入力と、AIエージェントによる「論理的な構造操作」を融合させ、専門知識がなくても高度なMermaid図（フローチャート、ER図、シーケンス図等）を即座に作成・編集・管理できる環境を提供します。

---

## 2. 技術スタック (Modern & Type-Safe)

| レイヤー | 選定技術 | 備考 |
| --- | --- | --- |
| **Framework** | **Next.js (App Router)** | 高速なSSR/ISRと直感的なルーティング |
| **Communication** | **tRPC** | クライアント/サーバー間の完全型安全性の担保 |
| **AI Engine** | **Vercel AI SDK** | LLM のストリーミングとTool Calling |
| **Database/ORM** | **PostgreSQL + Drizzle ORM** | 軽量・高速かつTypeScriptフレンドリーなデータ操作 |
| **Styling** | **Tailwind CSS** | モダンでレスポンシブなUI実装 |
| **Linter/Formatter** | **Biome** | 高速なコード品質管理 (Rust製) |
| **Testing** | **Vitest** | ユニットテストおよびロジックの検証 |
| **Infra/DevOps** | **Docker + pnpm** | 安定した開発環境と効率的なパッケージ管理 |
| **Docker** | **Docker Compose** | 開発環境のセットアップ |
| **pnpm** | **pnpm** | パッケージ管理 |
| **Biome** | **Biome** | コード品質管理 |
| **Vitest** | **Vitest** | ユニットテストおよびロジックの検証 |

### ディレクトリ構成

```
.
├── apps/web
│   ├── src/
│   │   ├── components/       # Canvas, ChatUI, MermaidViewer
│   │   ├── server/           # tRPC router, Drizzle schema
│   │   │   ├── routers/      # diagramRouter, aiRouter
│   │   │   └── db/           # schema.ts, client.ts
│   │   └── lib/              # mermaid-parser, ai-sdk-logic
├── docker-compose.yml        # PostgreSQL (for Drizzle)
├── biome.json                # Linter/Formatter config
└── vitest.config.ts          # Test runner
```

---

## 3. 主要機能の設計

### 3.1 手書き入力と図形生成

* **ハイブリッドレイヤー構造:** * **下層 (Base):** Mermaid.jsが描画するSVG。
* **上層 (Overlay):** 透明なCanvas。ユーザーのペン入力を受け付ける。

* **解析プロセス:** 1.  手書きストローク（座標データ）をバックエンドへ送信。
2.  AIエージェントがストローク形状と現在の図の構造を照らし合わせ、意図（ノード追加、削除、接続）を解釈。
3.  Mermaidコードを更新。

### 3.2 AIエージェント

AI SDKの**Tool Calling（関数呼び出し）**機能を利用し、自然言語による修正を実現します。

* **定義するツールの例:**
* `add_node(label, shape)`: ノードの追加
* `connect_nodes(from, to, style)`: 線や矢印の作成・スタイル変更
* `delete_element(id)`: 指定した要素の削除


* **メリット:** LLMが直接コードを書き換えるのではなく、定義された関数（ツール）を介することで、構文エラーを防ぎ、論理的に正しい修正が可能になります。

### 3.3 バージョン管理システム

図の修正履歴をすべて保存し、いつでも過去の状態に戻れるようにします。

| バージョン | 更新者 | 更新内容（Reason） | コード内容 |
| --- | --- | --- | --- |
| v1 | User | 手書きによる初回作成 | `flowchart TD...` |
| v2 | Agent | チャット「色を青にして」 | `style A fill:#00f...` |
| v3 | User | 手書きによるノード削除 | `...` |

---

## 4. システムアーキテクチャ

### 4.1 ハイブリッド・キャンバス構造

ブラウザ上で「手書き」と「図」を共存させるため、2層のレイヤー構造を採用します。

1. **SVG Layer (Mermaid.js):** AIが生成したMermaidコードをレンダリング。
2. **Handwriting Layer (Fabric.js):** ユーザーの手書きストロークを受け付ける透明なCanvas。

### 4.2 AIエージェントとパーサー戦略

厳密すぎるライブラリに依存せず、LLMの推論能力を最大限に活かす「ハイブリッド・パーシング」を採用します。

* **操作ロジック:** LLMに「Mermaidの構造（JSON）」と「指示」を渡し、ツール（Tool Calling）経由でDrizzleのDBを更新。
* **バリデーション:** `mermaid-isomorphic` を使用してサーバーサイドで構文チェック

今回のプロジェクトでは、「ライブラリとしてのパーサー」に頼りすぎない構成とします。

* バリデーション: LLM が生成したコードが壊れていないか確認するために、mermaid-isomorphic を使用
* 構造操作: LLM 自体に 「Mermaid の AST（構造）を理解して、特定のノードを操作した後の Mermaid テキストを出力する」 という役割をプロンプトで徹底させる
* DB保存: diagram_versions テーブルには mermaid_code（テキスト）を主として保存し、検索用に LLM に抽出させた簡易的な jsonb（ノード一覧など）を添える

---

## 5. データベース設計 (PostgreSQL)

技術スタック（Next.js, Drizzle, PostgreSQL）に最適化した、バージョン管理とAIエージェントの対話履歴を保持するためのデータベース設計を提案します。

この設計では、**「図の構造的な進化」**と**「AIとの対話の文脈」**を紐付けて管理することに重点を置いています。

---

### 5.1 🏛️ エンティティ関係図 (ERD)

主なテーブルは以下の5つです。

1. **`projects`**: 図（ダイアグラム）の管理単位。
2. **`diagram_versions`**: Mermaidコードの履歴。
3. **`chat_sessions`**: AIエージェントとの対話セッション。
4. **`chat_messages`**: セッション内の個々の発言。
5. **`handwriting_strokes`**: 手書きデータのRAWデータ（再解析やAI学習用）。

---

### 5.2 📝 Drizzle ORM によるテーブル定義 (TypeScript)

Drizzleの構文を用いて、PostgreSQL向けのスキーマを定義します。

```typescript
import {
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";

// 1. プロジェクト（図）の基本情報
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. ダイアグラムのバージョン管理（Mermaidコードの履歴）
export const diagramVersions = pgTable("diagram_versions", {
  id: serial("id").primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  versionNumber: integer("version_number").notNull(),
  mermaidCode: text("mermaid_code").notNull(),
  // 構造化データ（AST）をJSONとして保存しておくと検索や比較に便利
  parsedStructure: jsonb("parsed_structure"), 
  updateType: varchar("update_type", { length: 50 }).notNull(), // 'initial', 'chat', 'handwriting'
  reason: text("reason"), // AIが生成した変更理由のサマリー
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 3. AIエージェントとの対話セッション
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 4. チャットメッセージ履歴
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: uuid("session_id")
    .references(() => chatSessions.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(),
  // このメッセージの結果として生成された図のバージョンID
  resultingVersionId: integer("resulting_version_id").references(() => diagramVersions.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 5. 手書きデータの保存（解析後の修正指示の根拠として保持）
export const handwritingStrokes = pgTable("handwriting_strokes", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id")
    .references(() => diagramVersions.id, { onDelete: "cascade" })
    .notNull(),
  // Fabric.js等のCanvasから出力される座標データのJSON
  strokeData: jsonb("stroke_data").notNull(), 
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

```

---

### 5.3 💡 この設計のポイント

#### 1. `parsed_structure` (jsonb) の活用

Mermaidパーサーで解析した結果（ノードのリストや接続関係）を `jsonb` 形式で保存します。これにより、PostgreSQL側で「特定のノードが含まれる図を検索する」といった操作が可能になり、AIが過去の文脈を理解する際の補助データとして高速に読み出せます。

#### 2. `resulting_version_id` による紐付け

チャットのどの発言によって図がどう変化したかを明示的に紐付けます。これにより、ユーザーがチャットUI上で「この時の状態に戻して」といった操作（タイムトラベル機能）を直感的に行えるようになります。

#### 3. 手書きデータの独立保存

手書きのストロークを `handwriting_strokes` に保存しておくことで、将来的にAIモデル（マルチモーダルモデル）を微調整（Fine-tuning）して、ユーザー固有の書き癖に合わせた認識精度向上を図るための学習データとして活用できます。

---

## 6. 主要なワークフロー

1. **図の生成:** ユーザーが手書きでラフを描く → tRPC経由でストロークを送信 → AI SDKが図形を認識しMermaid化 → DB保存。
2. **AI修正:** チャットで「このノードを赤くして」と指示 → AIが `update_style` ツールを実行 → パーサーがコードを書き換え → 即時プレビュー。
3. **バージョン管理:** 修正のたびに `diagram_versions` に新規レコードを作成。ユーザーはいつでも過去のバージョンへロールバック可能。

---

## 7. 開発ロードマップ

### Phase 1: 基盤構築 (Current)

* Docker環境のセットアップ (Next.js, PostgreSQL)。
* Drizzleによるスキーママイグレーション。
* pnpm + Biome による開発規約の自動化。

### Phase 2: コア機能の実装

* 手書きCanvas (Fabric.js) と Mermaid 描画の統合。
* tRPC + Vercel AI SDK による基本的な AI チャットボットの実装。

### Phase 3: 高度な編集と最適化

* 手書きジェスチャー（バツ印で削除など）の解析ロジック。
* バージョン履歴のタイムトラベルUIの実装。
* Vitestによるパーサーロジックのテスト。

---

## 8. 今後の検討課題

* **リアルタイム・マルチモーダル解析:** 手書きストロークを画像としてLLMに直接読み取らせるか、座標データとして解析させるかの精度比較。
