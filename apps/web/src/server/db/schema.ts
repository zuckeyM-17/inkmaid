import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * サポートする図の種類
 */
export const DIAGRAM_TYPES = [
  "flowchart",
  "sequence",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
] as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];

/**
 * 図の種類ごとの情報
 */
export const DIAGRAM_TYPE_INFO: Record<
  DiagramType,
  { label: string; icon: string; description: string }
> = {
  flowchart: {
    label: "フローチャート",
    icon: "🔀",
    description: "処理の流れを表現",
  },
  sequence: {
    label: "シーケンス図",
    icon: "↔️",
    description: "オブジェクト間のやり取り",
  },
  classDiagram: {
    label: "クラス図",
    icon: "📦",
    description: "クラスの構造と関係",
  },
  stateDiagram: {
    label: "状態遷移図",
    icon: "🔄",
    description: "状態の変化を表現",
  },
  erDiagram: {
    label: "ER図",
    icon: "🗄️",
    description: "データベース設計",
  },
};

/**
 * 図の種類ごとの初期Mermaidコード
 */
export const DIAGRAM_TEMPLATES: Record<DiagramType, string> = {
  flowchart: `flowchart TD
    A[開始] --> B{条件}
    B -->|Yes| C[処理1]
    B -->|No| D[処理2]
    C --> E[終了]
    D --> E`,
  sequence: `sequenceDiagram
    participant User as ユーザー
    participant System as システム
    participant DB as データベース
    
    User->>System: リクエスト
    System->>DB: データ取得
    DB-->>System: データ返却
    System-->>User: レスポンス`,
  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,
  stateDiagram: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : start
    Processing --> Success : complete
    Processing --> Error : fail
    Success --> [*]
    Error --> Idle : retry`,
  erDiagram: `erDiagram
    USERS {
        int id PK
        string name
        string email
    }
    POSTS {
        int id PK
        string title
        text content
        int user_id FK
    }
    USERS ||--o{ POSTS : writes`,
};

// 1. プロジェクト（図）の基本情報
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** 図の種類（flowchart, sequence, erDiagram など） */
  diagramType: varchar("diagram_type", { length: 50 })
    .notNull()
    .default("flowchart"),
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
  resultingVersionId: integer("resulting_version_id").references(
    () => diagramVersions.id
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 5. 手書きデータの保存（解析後の修正指示の根拠として保持）
export const handwritingStrokes = pgTable("handwriting_strokes", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id")
    .references(() => diagramVersions.id, { onDelete: "cascade" })
    .notNull(),
  // Konva.js等のCanvasから出力される座標データのJSON
  strokeData: jsonb("stroke_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 型のエクスポート
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type DiagramVersion = typeof diagramVersions.$inferSelect;
export type NewDiagramVersion = typeof diagramVersions.$inferInsert;

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type HandwritingStroke = typeof handwritingStrokes.$inferSelect;
export type NewHandwritingStroke = typeof handwritingStrokes.$inferInsert;

