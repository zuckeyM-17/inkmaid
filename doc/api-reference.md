# 🔌 API リファレンス

Inkmaidは tRPC を使用した型安全なAPIと、ストリーミング用のREST APIを提供しています。

---

## 概要

| ルーター/エンドポイント | 説明 |
|---------|------|
| `diagram` (tRPC) | プロジェクト・ダイアグラムのCRUD操作 |
| `ai` (tRPC) | AI処理（ストローク解釈、エラー修正） |
| `/api/ai/interpret-stream` (REST) | ストリーミング対応のストローク解釈 |

---

## diagram ルーター

プロジェクトとダイアグラムバージョンの管理を行います。

### diagram.listProjects

プロジェクト一覧を取得します。

| 項目 | 値 |
|-----|-----|
| メソッド | Query |
| 入力 | なし |
| 出力 | `Project[]` |

```tsx
const { data: projects } = trpc.diagram.listProjects.useQuery();
```

---

### diagram.createProject

新規プロジェクトを作成します。

| 項目 | 値 |
|-----|-----|
| メソッド | Mutation |
| 入力 | `{ name: string, diagramType?: DiagramType }` |
| 出力 | `Project` |

```tsx
const createProject = trpc.diagram.createProject.useMutation();
createProject.mutate({ 
  name: "My Diagram",
  diagramType: "flowchart" // "flowchart" | "sequence" | "classDiagram" | "stateDiagram" | "erDiagram"
});
```

**DiagramType（図の種類）:**

| 値 | 説明 |
|---|------|
| `flowchart` | フローチャート（デフォルト） |
| `sequence` | シーケンス図 |
| `classDiagram` | クラス図 |
| `stateDiagram` | 状態遷移図 |
| `erDiagram` | ER図 |

---

### diagram.getProject

プロジェクト詳細を取得します。

| 項目 | 値 |
|-----|-----|
| メソッド | Query |
| 入力 | `{ id: string }` |
| 出力 | `Project & { latestVersion?: DiagramVersion }` |

```tsx
const { data: project } = trpc.diagram.getProject.useQuery({ id: "..." });
```

---

### diagram.getProjectWithStrokes

プロジェクトと最新のストロークデータを取得します。

| 項目 | 値 |
|-----|-----|
| メソッド | Query |
| 入力 | `{ id: string }` |
| 出力 | `{ project, mermaidCode, strokes }` |

```tsx
const { data } = trpc.diagram.getProjectWithStrokes.useQuery({ id: "..." });
// data.project - プロジェクト情報
// data.mermaidCode - 最新のMermaidコード
// data.strokes - 手書きストロークデータ
```

---

### diagram.getVersionHistory

バージョン履歴を取得します。

| 項目 | 値 |
|-----|-----|
| メソッド | Query |
| 入力 | `{ projectId: string }` |
| 出力 | `DiagramVersion[]` |

```tsx
const { data: versions } = trpc.diagram.getVersionHistory.useQuery({ 
  projectId: "..." 
});
```

---

### diagram.saveVersion

新しいバージョンを保存します。

| 項目 | 値 |
|-----|-----|
| メソッド | Mutation |
| 入力 | `{ projectId, mermaidCode, updateType, reason? }` |
| 出力 | `DiagramVersion` |

```tsx
const saveVersion = trpc.diagram.saveVersion.useMutation();
saveVersion.mutate({
  projectId: "...",
  mermaidCode: "flowchart TD\n  A --> B",
  updateType: "chat", // "initial" | "chat" | "handwriting"
  reason: "ノードBを追加",
});
```

---

### diagram.saveDiagramWithStrokes

Mermaidコードとストロークデータを一緒に保存します。

| 項目 | 値 |
|-----|-----|
| メソッド | Mutation |
| 入力 | `{ projectId, mermaidCode, strokes, updateType, reason? }` |
| 出力 | `DiagramVersion` |

```tsx
const saveDiagram = trpc.diagram.saveDiagramWithStrokes.useMutation();
saveDiagram.mutate({
  projectId: "...",
  mermaidCode: "flowchart TD\n  A --> B",
  strokes: [
    { 
      points: [100, 100, 150, 150, 200, 100], 
      color: "#7c3aed",
      width: 3 
    }
  ],
  updateType: "handwriting",
  reason: "手書きで図形を追加",
});
```

---

## ai ルーター

AI処理を行います。

### ai.interpretStrokes

手書きストロークを解釈してMermaidコードに変換します。

| 項目 | 値 |
|-----|-----|
| メソッド | Mutation |
| 入力 | `{ strokes, currentMermaidCode, diagramType, nodePositions?, canvasImage?, hint? }` |
| 出力 | `{ updatedMermaidCode, explanation, thinkingProcess? }` |

```tsx
const interpretStrokes = trpc.ai.interpretStrokes.useMutation();
const result = await interpretStrokes.mutateAsync({
  strokes: [...],
  currentMermaidCode: "flowchart TD\n  A[開始]",
  diagramType: "flowchart",
  nodePositions: [
    { id: "A", label: "開始", x: 100, y: 50, width: 80, height: 40, centerX: 140, centerY: 70 }
  ],
  canvasImage: "data:image/png;base64,...", // オプション：マルチモーダル認識用
  hint: "認証処理を追加して", // オプション：補足説明
});

// result.updatedMermaidCode - 更新されたMermaidコード
// result.explanation - AIの説明
// result.thinkingProcess - 推論過程（Anthropic使用時）
```

**ストロークの形状解釈ルール：**

| 形状 | 解釈 |
|------|------|
| 四角形 | ノード（処理ブロック） |
| ひし形 | 条件分岐 |
| 円形 | 開始/終了ノード |
| 線・矢印 | ノード間の接続 |
| X印 | 要素の削除 |

---

### ai.fixMermaidError

Mermaidコードの構文エラーを自動修正します。

| 項目 | 値 |
|-----|-----|
| メソッド | Mutation |
| 入力 | `{ brokenMermaidCode, errorMessage, retryCount }` |
| 出力 | `{ fixedMermaidCode, explanation }` |

```tsx
const fixError = trpc.ai.fixMermaidError.useMutation();
const result = await fixError.mutateAsync({
  brokenMermaidCode: "flowchart TD\n  A --> B[",  // 壊れたコード
  errorMessage: "Unexpected end of input",
  retryCount: 1, // 1〜3
});

// result.fixedMermaidCode - 修正されたコード
// result.explanation - 修正内容の説明
```

---

## ストリーミング API（REST）

tRPCではなくREST APIとして提供されるストリーミングエンドポイントです。

### POST /api/ai/interpret-stream

手書きストロークを解釈してMermaidコードに変換します。**SSE（Server-Sent Events）形式**でAIの思考過程をリアルタイムでストリーミング返却します。

| 項目 | 値 |
|-----|-----|
| メソッド | POST |
| Content-Type | application/json |
| レスポンス | text/event-stream (SSE) |

**リクエストボディ:**

```typescript
{
  strokes: Stroke[];           // 手書きストローク
  currentMermaidCode: string;  // 現在のMermaidコード
  diagramType?: DiagramType;   // 図の種類（デフォルト: "flowchart"）
  nodePositions?: NodePosition[]; // ノードの位置情報
  canvasImage?: string;        // Base64画像（マルチモーダル認識用）
  hint?: string;               // 補足説明
}
```

**SSEイベント形式:**

```
data: {"type":"reasoning","text":"思考過程のテキスト..."}\n\n
data: {"type":"text-delta","text":"出力テキストの断片..."}\n\n
data: [DONE]\n\n
```

| イベントタイプ | 説明 |
|--------------|------|
| `reasoning` | Claude Extended Thinkingの思考過程 |
| `text-delta` | 最終出力テキストの断片 |
| `error` | エラー情報 |
| `[DONE]` | ストリーム完了シグナル |

**クライアント側の使用例（カスタムフック）:**

```tsx
import { useAIStream } from "@/lib/hooks/useAIStream";

function MyComponent() {
  const { 
    isProcessing,   // 処理中かどうか
    thinkingText,   // 思考過程（リアルタイム更新）
    outputText,     // 出力テキスト（リアルタイム更新）
    errorMessage,   // エラーメッセージ
    interpretStrokes,  // ストローク解釈を実行
    cancel,         // 処理をキャンセル
    reset,          // 状態をリセット
  } = useAIStream();

  const handleConvert = async () => {
    await interpretStrokes(
      {
        strokes: [...],
        currentMermaidCode: "flowchart TD\n  A[開始]",
        diagramType: "flowchart",
        nodePositions: [...],
      },
      (result) => {
        // 完了時のコールバック
        console.log(result.mermaidCode);  // 更新されたMermaidコード
        console.log(result.reason);       // AIの説明
        console.log(result.thinking);     // 全思考過程
      }
    );
  };
}
```

**直接fetchする場合:**

```typescript
const response = await fetch("/api/ai/interpret-stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    strokes: [...],
    currentMermaidCode: "flowchart TD\n  A[開始]",
    diagramType: "flowchart",
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  // SSEイベントをパース
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") continue;
    
    const event = JSON.parse(data);
    if (event.type === "reasoning") {
      console.log("思考:", event.text);
    } else if (event.type === "text-delta") {
      console.log("出力:", event.text);
    }
  }
}
```

---

## 型定義

### Project

```typescript
type Project = {
  id: string;           // UUID
  name: string;         // プロジェクト名
  diagramType: string;  // 図の種類
  createdAt: Date;
  updatedAt: Date;
};
```

### DiagramVersion

```typescript
type DiagramVersion = {
  id: number;
  projectId: string;
  versionNumber: number;
  mermaidCode: string;
  parsedStructure?: object;  // JSON構造（オプション）
  updateType: "initial" | "chat" | "handwriting";
  reason?: string;
  createdAt: Date;
};
```

### Stroke

```typescript
type Stroke = {
  points: number[];  // [x1, y1, x2, y2, ...] 座標の配列
  color: string;     // 色（例: "#7c3aed"）
  width: number;     // 線の太さ
};
```

### NodePosition

```typescript
type NodePosition = {
  id: string;       // ノードID（Mermaidコード内の識別子）
  label: string;    // ラベルテキスト
  x: number;        // 左上X座標
  y: number;        // 左上Y座標
  width: number;    // 幅
  height: number;   // 高さ
  centerX: number;  // 中心X座標
  centerY: number;  // 中心Y座標
};
```

---

## クライアント設定

### tRPCクライアントのセットアップ

```tsx
// apps/web/src/lib/trpc/client.ts
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/trpc/routers";

export const trpc = createTRPCReact<AppRouter>();
```

### プロバイダーの設定

```tsx
// apps/web/src/lib/trpc/provider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./client";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

## 関連ドキュメント

- [設計ドキュメント](./develop.md) - アーキテクチャ詳細
- [開発ガイド](./development-guide.md) - 開発ワークフロー

