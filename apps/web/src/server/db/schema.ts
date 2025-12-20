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
  // Fabric.js等のCanvasから出力される座標データのJSON
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

