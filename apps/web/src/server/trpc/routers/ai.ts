import { generateText } from "ai";
import { z } from "zod";
import { getModel, getProviderOptions } from "../../ai/config";
import {
  type NodePosition,
  type Stroke,
  detectEnclosure,
  detectXMark,
} from "../../ai/detection";
import { parseAiResponse } from "../../ai/parsing";
import { SYSTEM_PROMPT, getStrokeInterpretationPrompt } from "../../ai/prompts";
import {
  formatNodePositions,
  formatStrokeDescriptions,
} from "../../ai/strokeUtils";
import { DIAGRAM_TYPES, type DiagramType } from "../../db/schema";
import { publicProcedure, router } from "../init";

/**
 * AIチャット用のルーター
 */
export const aiRouter = router({
  /**
   * Mermaidコードを修正するためのチャットエンドポイント
   */
  editDiagram: publicProcedure
    .input(
      z.object({
        /** ユーザーの指示 */
        message: z.string().min(1),
        /** 現在のMermaidコード */
        currentMermaidCode: z.string(),
        /** 過去の会話履歴（オプション） */
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { message, currentMermaidCode, conversationHistory = [] } = input;

      // 会話履歴を構築
      const messages: { role: "user" | "assistant"; content: string }[] = [
        ...conversationHistory,
        {
          role: "user" as const,
          content: `現在のMermaidコード:
\`\`\`mermaid
${currentMermaidCode}
\`\`\`

ユーザーの指示: ${message}`,
        },
      ];

      // AI SDKでテキスト生成
      const result = await generateText({
        model: getModel(),
        system: SYSTEM_PROMPT,
        messages,
        providerOptions: getProviderOptions(),
      });

      // 応答からMermaidコードと理由を抽出
      const { mermaidCode, reason } = parseAiResponse(result.text);

      // 思考過程を抽出（Claudeのextended thinking）
      const thinkingProcess = result.reasoning
        ? result.reasoning.map((r) => ("text" in r ? r.text : "")).join("\n")
        : null;

      // レスポンスを構築
      return {
        /** AIからのテキスト応答 */
        response: reason || "コードを更新しました。",
        /** 更新されたMermaidコード */
        updatedMermaidCode: mermaidCode,
        /** 修正理由 */
        reasoning: reason,
        /** 思考過程（Claudeのみ） */
        thinking: thinkingProcess,
        /** コードが更新されたかどうか */
        wasUpdated: mermaidCode !== null,
      };
    }),

  /**
   * シンプルなチャットエンドポイント（Mermaid修正なし）
   */
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().min(1),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { message, conversationHistory = [] } = input;

      const result = await generateText({
        model: getModel(),
        system:
          "あなたはMermaidダイアグラムの作成を支援するフレンドリーなAIアシスタントです。日本語で回答してください。",
        messages: [
          ...conversationHistory,
          { role: "user" as const, content: message },
        ],
      });

      return {
        response: result.text,
      };
    }),

  /**
   * 手書きストロークを解釈してMermaidコードを更新
   */
  interpretStrokes: publicProcedure
    .input(
      z.object({
        /** 手書きストロークデータ */
        strokes: z.array(
          z.object({
            id: z.string(),
            points: z.array(z.number()),
            color: z.string(),
            strokeWidth: z.number(),
          }),
        ),
        /** 現在のMermaidコード */
        currentMermaidCode: z.string(),
        /** 現在のMermaidノードの位置情報 */
        nodePositions: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              x: z.number(),
              y: z.number(),
              width: z.number(),
              height: z.number(),
              centerX: z.number(),
              centerY: z.number(),
            }),
          )
          .optional(),
        /** キャンバス画像（Base64 PNG） */
        canvasImage: z.string().optional(),
        /** 補助的なテキスト指示（オプション） */
        hint: z.string().optional(),
        /** 図の種類 */
        diagramType: z.enum(DIAGRAM_TYPES).optional().default("flowchart"),
      }),
    )
    .mutation(async ({ input }) => {
      const {
        strokes,
        currentMermaidCode,
        nodePositions,
        canvasImage,
        hint,
        diagramType,
      } = input;

      if (strokes.length === 0) {
        return {
          response: "ストロークがありません。手書きで図形を描いてください。",
          updatedMermaidCode: null,
          reasoning: null,
          wasUpdated: false,
        };
      }

      // ストロークを型安全に変換
      const typedStrokes: Stroke[] = strokes.map((s) => ({
        id: s.id,
        points: s.points,
        color: s.color,
        strokeWidth: s.strokeWidth,
      }));

      // ノード位置情報を型安全に変換
      const typedNodePositions: NodePosition[] | undefined = nodePositions?.map(
        (n) => ({
          id: n.id,
          label: n.label,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          centerX: n.centerX,
          centerY: n.centerY,
        }),
      );

      // X印を検出
      const xMarkDetection = detectXMark(typedStrokes, typedNodePositions);

      // 囲み線を検出
      const enclosureDetection = detectEnclosure(
        typedStrokes,
        typedNodePositions,
      );

      // ストロークデータを解析用のテキストに変換
      const strokeDescriptions = formatStrokeDescriptions(typedStrokes);

      // ノード位置情報をテキストに変換
      const nodePositionDescriptions = formatNodePositions(typedNodePositions);

      const userMessage = `現在のMermaidコード:
\`\`\`mermaid
${currentMermaidCode}
\`\`\`

## 現在のダイアグラム上の各ノードの位置（ピクセル座標）:
${nodePositionDescriptions}

## 手書きストロークデータ（${strokes.length}個のストローク）:
${strokeDescriptions}

${
  xMarkDetection
    ? `## ⚠️ X印（バツ）を検出しました！
- X印の中心座標: (${Math.round(xMarkDetection.centerX)}, ${Math.round(xMarkDetection.centerY)})
- 対象ノード: ${xMarkDetection.targetNodeId ? `「${xMarkDetection.targetNodeId}」を削除してください` : "特定できませんでした（位置から判断してください）"}

**重要**: X印が描かれたノードとその接続を削除してください。
`
    : ""
}
${
  enclosureDetection
    ? `## 🔲 囲み線（サブグラフ）を検出しました！
- 囲み線の範囲: (${Math.round(enclosureDetection.bounds.minX)}, ${Math.round(enclosureDetection.bounds.minY)}) ～ (${Math.round(enclosureDetection.bounds.maxX)}, ${Math.round(enclosureDetection.bounds.maxY)})
- 囲み線の中心: (${Math.round(enclosureDetection.bounds.centerX)}, ${Math.round(enclosureDetection.bounds.centerY)})
- 囲み線内に含まれるノード: ${enclosureDetection.enclosedNodeIds.length > 0 ? enclosureDetection.enclosedNodeIds.map((id) => `「${id}」`).join(", ") : "なし"}

**重要**: 囲み線内に含まれるノードをsubgraphとしてグループ化してください。
- subgraph構文: \`subgraph タイトル\` ... \`end\`
- 囲み線内のノードをsubgraphブロック内に移動してください
- 囲み線のタイトルは、囲み線内のノードの内容から推測するか、空白にしてください
- 既存の接続は維持してください（subgraph内のノードと外部ノードの接続も保持）
`
    : ""
}
${hint ? `## ユーザーからの補足: ${hint}` : ""}

## 解釈のヒント
- ストロークの座標と既存ノードの位置を比較して、どのノードに対する操作かを判断してください
- ストロークがノードの近くにある場合、そのノードとの関連を考慮してください
- ノード間を結ぶような線は、接続（矢印）を意味する可能性が高いです
- **X印（バツ）がノード上に描かれた場合は、そのノードを削除してください**
- **閉じた図形（囲み線）がノードを囲んでいる場合は、そのノードをsubgraphとしてグループ化してください**

これらのストロークを解釈して、Mermaidダイアグラムを更新してください。`;

      // マルチモーダルメッセージを構築
      type MessageContent =
        | { type: "text"; text: string }
        | { type: "image"; image: string };
      const messageContent: MessageContent[] = [];

      // 画像がある場合は先に追加（視覚情報を優先）
      if (canvasImage) {
        messageContent.push({
          type: "image",
          image: canvasImage, // Base64 data URL
        });
      }

      // テキストメッセージを追加
      messageContent.push({
        type: "text",
        text: canvasImage
          ? `上の画像は現在のダイアグラム（Mermaid図）に手書きストローク（紫色の線）を重ねたものです。

手書きの内容を解釈して、ダイアグラムを更新してください。
- 手書きで書かれた文字があれば読み取ってください
- 図形（四角、矢印など）があれば、その意図を解釈してください
- X印（バツ）がノード上にあれば、そのノードを削除してください

${userMessage}`
          : userMessage,
      });

      const result = await generateText({
        model: getModel(),
        system: getStrokeInterpretationPrompt(diagramType as DiagramType),
        messages: [{ role: "user" as const, content: messageContent }],
        providerOptions: getProviderOptions(),
      });

      const { mermaidCode, reason } = parseAiResponse(result.text);

      // 思考過程を抽出（Claudeのextended thinking）
      console.log("AI Result reasoning:", result.reasoning);
      const thinkingProcess = result.reasoning
        ? result.reasoning.map((r) => ("text" in r ? r.text : "")).join("\n")
        : null;
      console.log("Extracted thinking:", thinkingProcess);

      return {
        response: reason || "ストロークを解釈しました。",
        updatedMermaidCode: mermaidCode,
        reasoning: reason,
        thinking: thinkingProcess,
        wasUpdated: mermaidCode !== null,
      };
    }),

  /**
   * Mermaidパースエラーを修正
   */
  fixMermaidError: publicProcedure
    .input(
      z.object({
        /** エラーが発生したMermaidコード */
        brokenCode: z.string(),
        /** パースエラーメッセージ */
        errorMessage: z.string(),
        /** リトライ回数 */
        retryCount: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { brokenCode, errorMessage, retryCount = 0 } = input;

      const fixPrompt = `以下のMermaidコードにパースエラーが発生しました。エラーを修正してください。

## エラーメッセージ
${errorMessage}

## エラーが発生したコード
\`\`\`mermaid
${brokenCode}
\`\`\`

## 修正のポイント
- Mermaid構文のルールに従う
- ノードIDに日本語や特殊文字を使わない（英数字のみ）
- ラベルは [ ] 内に記述
- 矢印は --> や --- を使用
- flowchartの場合は必ず flowchart TD または flowchart LR で始める

## 出力形式
---MERMAID_START---
(修正後の正しいMermaidコード)
---MERMAID_END---

---REASON_START---
(何を修正したかの説明)
---REASON_END---`;

      const result = await generateText({
        model: getModel(),
        system:
          "あなたはMermaidコードのエラーを修正する専門家です。必ず有効なMermaid構文を出力してください。",
        messages: [{ role: "user" as const, content: fixPrompt }],
        providerOptions: getProviderOptions(),
      });

      const { mermaidCode, reason } = parseAiResponse(result.text);

      // 思考過程を抽出
      const thinkingProcess = result.reasoning
        ? result.reasoning.map((r) => ("text" in r ? r.text : "")).join("\n")
        : null;

      return {
        response: reason || "コードを修正しました。",
        updatedMermaidCode: mermaidCode,
        reasoning: reason,
        thinking: thinkingProcess,
        wasFixed: mermaidCode !== null,
        retryCount: retryCount + 1,
      };
    }),
});
