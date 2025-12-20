import { z } from "zod";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { publicProcedure, router } from "../init";

/**
 * 現在のAIプロバイダーを取得
 */
function getProvider() {
  return process.env.AI_PROVIDER ?? "anthropic";
}

/**
 * 使用するAIモデルを選択
 * 環境変数 AI_PROVIDER で切り替え可能
 * - "anthropic" → Claude (デフォルト)
 * - "google" → Gemini
 * - "openai" → GPT-4o-mini
 */
function getModel() {
  const provider = getProvider();
  if (provider === "openai") {
    return openai("gpt-4o-mini");
  }
  if (provider === "google") {
    return google("gemini-2.0-flash");
  }
  return anthropic("claude-sonnet-4-20250514");
}

/**
 * Claude用のextended thinking設定を取得
 */
function getProviderOptions() {
  const provider = getProvider();
  if (provider === "anthropic") {
    return {
      anthropic: {
        thinking: {
          type: "enabled" as const,
          budgetTokens: 10000, // 思考に使うトークン数
        },
      },
    };
  }
  return undefined;
}

/**
 * ストローク解釈用のシステムプロンプト
 */
const STROKE_INTERPRETATION_PROMPT = `あなたは手書きストロークを解釈してMermaidダイアグラムを生成・編集するAIアシスタントです。

## あなたの役割
- **画像が提供された場合は、画像を優先的に分析する**（手書き文字の認識、図形の解釈）
- ユーザーの手書きストローク（座標データ）を分析する
- ストロークの形状や配置から、ユーザーの意図を推測する
- 現在のMermaidコードを考慮して、適切な修正を行う

## 重要：画像解析（マルチモーダル）
画像が提供された場合：
- **手書きの文字を読み取ってください**（ノードのラベルとして使用）
- 手書きの図形（四角、矢印、ひし形など）を認識してください
- 既存のダイアグラムと手書きの位置関係を分析してください
- 紫色の線が手書きストロークです

## ノード位置情報の活用
座標データも併せて提供されます：
- **ストロークの座標と既存ノードの位置を比較**して、どのノードに対する操作かを判断
- ストロークの始点・終点がどのノードに近いかで、接続関係を推測
- ストロークがノードを囲んでいる場合は、そのノードの修正や強調を意味する

## ストロークの解釈ルール
- 四角形に近い形 → ノード（処理ブロック）の追加
- ひし形に近い形 → 条件分岐（decision）の追加
- 円形に近い形 → 開始/終了ノードの追加
- 線や矢印（特に既存ノード間を結ぶもの） → ノード間の接続を追加
- **X印（バツ）がノード上に描かれた場合 → そのノードと関連する接続を削除**
- 囲み → グループ化やサブグラフ

## X印（バツ）による削除の重要ルール
ユーザーがノードの上に「X」の形（2本の斜め線が交差）を描いた場合：
1. そのノードをMermaidコードから削除する
2. そのノードへの/からの接続（矢印）も削除する
3. 削除により孤立するノードがあれば、適切に接続し直す
4. 削除後もダイアグラムが有効な構造を維持するようにする

## 座標データの解釈
- points配列は [x1, y1, x2, y2, ...] の形式
- ストロークの開始点と終了点の近さで閉じた図形かを判断
- **ストロークの座標と既存ノードの中心座標を比較して、接続先を特定**

## 出力形式
以下の形式で出力してください：

---MERMAID_START---
(修正後のMermaidコード)
---MERMAID_END---

---REASON_START---
(何を検出して、どのような修正を行ったかの説明。どのノードとストロークを関連付けたかも含める)
---REASON_END---

## 注意事項
- 必ず有効なMermaid構文を出力すること
- 既存のノードや接続を保持しつつ、新しい要素を追加すること
- 不明確な場合は、最も可能性の高い解釈を選ぶこと
- ノード位置情報を必ず参照して、ストロークとの関係を分析すること`;

/**
 * Mermaid操作用のシステムプロンプト
 */
const SYSTEM_PROMPT = `あなたはMermaidダイアグラムの編集を支援するAIアシスタントです。

ユーザーから図の修正依頼を受けると、Mermaidコードを修正して返します。

## あなたの役割
- ユーザーの自然言語による指示を理解する
- 現在のMermaidコードを分析する
- 適切な修正を行い、新しいMermaidコードを出力する

## Mermaid構文のルール
- flowchartの場合: \`flowchart TD\` または \`flowchart LR\` で始まる
- ノードの定義: \`A[テキスト]\`, \`B{条件}\`, \`C((円形))\`, \`D([楕円])\`
- 接続: \`A --> B\`, \`A -->|ラベル| B\`, \`A --- B\`
- スタイル: \`style A fill:#f9f,stroke:#333\`

## 出力形式
以下の形式で出力してください：

---MERMAID_START---
(修正後のMermaidコード)
---MERMAID_END---

---REASON_START---
(修正内容の説明)
---REASON_END---

## 注意事項
- 必ず有効なMermaid構文を出力すること
- 既存のノードや接続を保持しつつ、ユーザーの指示に従って修正すること
- 必ず上記の形式で出力すること`;

/**
 * AIの応答からMermaidコードと理由を抽出
 */
function parseAiResponse(text: string): { mermaidCode: string | null; reason: string | null } {
  const mermaidMatch = text.match(/---MERMAID_START---\s*([\s\S]*?)\s*---MERMAID_END---/);
  const reasonMatch = text.match(/---REASON_START---\s*([\s\S]*?)\s*---REASON_END---/);

  return {
    mermaidCode: mermaidMatch ? mermaidMatch[1].trim() : null,
    reason: reasonMatch ? reasonMatch[1].trim() : null,
  };
}

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
            })
          )
          .optional(),
      })
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
            })
          )
          .optional(),
      })
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
          })
        ),
        /** 現在のMermaidコード */
        currentMermaidCode: z.string(),
        /** 現在のMermaidノードの位置情報 */
        nodePositions: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            centerX: z.number(),
            centerY: z.number(),
          })
        ).optional(),
        /** キャンバス画像（Base64 PNG） */
        canvasImage: z.string().optional(),
        /** 補助的なテキスト指示（オプション） */
        hint: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { strokes, currentMermaidCode, nodePositions, canvasImage, hint } = input;

      if (strokes.length === 0) {
        return {
          response: "ストロークがありません。手書きで図形を描いてください。",
          updatedMermaidCode: null,
          reasoning: null,
          wasUpdated: false,
        };
      }

      // ストロークのバウンディングボックスを計算するヘルパー
      const getStrokeBounds = (points: number[]) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < points.length; i += 2) {
          minX = Math.min(minX, points[i]);
          maxX = Math.max(maxX, points[i]);
          minY = Math.min(minY, points[i + 1]);
          maxY = Math.max(maxY, points[i + 1]);
        }
        return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
      };

      // 2本のストロークがX印（バツ）を形成しているか判定
      const detectXMark = (): { isXMark: boolean; centerX: number; centerY: number; targetNodeId: string | null } | null => {
        if (strokes.length < 2) return null;

        // 最後の2本のストロークをチェック
        const stroke1 = strokes[strokes.length - 2];
        const stroke2 = strokes[strokes.length - 1];
        
        const p1 = stroke1.points;
        const p2 = stroke2.points;
        
        const bounds1 = getStrokeBounds(p1);
        const bounds2 = getStrokeBounds(p2);
        
        // 両ストロークが近い位置にあるか（中心が近い）
        const centerDist = Math.sqrt(
          (bounds1.centerX - bounds2.centerX) ** 2 + 
          (bounds1.centerY - bounds2.centerY) ** 2
        );
        
        // 両ストロークのサイズが似ているか
        const size1 = Math.max(bounds1.maxX - bounds1.minX, bounds1.maxY - bounds1.minY);
        const size2 = Math.max(bounds2.maxX - bounds2.minX, bounds2.maxY - bounds2.minY);
        const sizeDiff = Math.abs(size1 - size2) / Math.max(size1, size2);
        
        // X印の条件: 中心が近く（50px以内）、サイズが似ている（差が50%以内）
        if (centerDist < 80 && sizeDiff < 0.5) {
          // 線が交差する形状かチェック（対角線的な動き）
          const start1 = { x: p1[0], y: p1[1] };
          const end1 = { x: p1[p1.length - 2], y: p1[p1.length - 1] };
          const start2 = { x: p2[0], y: p2[1] };
          const end2 = { x: p2[p2.length - 2], y: p2[p2.length - 1] };
          
          // 両方のストロークが斜め線か（開始点と終了点のX,Yが両方変化）
          const isDiagonal1 = Math.abs(end1.x - start1.x) > 20 && Math.abs(end1.y - start1.y) > 20;
          const isDiagonal2 = Math.abs(end2.x - start2.x) > 20 && Math.abs(end2.y - start2.y) > 20;
          
          if (isDiagonal1 && isDiagonal2) {
            // X印の中心座標
            const xCenter = (bounds1.centerX + bounds2.centerX) / 2;
            const yCenter = (bounds1.centerY + bounds2.centerY) / 2;
            
            // どのノードの上にあるか判定
            let targetNodeId: string | null = null;
            if (nodePositions && nodePositions.length > 0) {
              for (const node of nodePositions) {
                // X印の中心がノードの範囲内にあるか
                if (
                  xCenter >= node.x - 20 && xCenter <= node.x + node.width + 20 &&
                  yCenter >= node.y - 20 && yCenter <= node.y + node.height + 20
                ) {
                  targetNodeId = node.id;
                  break;
                }
              }
            }
            
            return { isXMark: true, centerX: xCenter, centerY: yCenter, targetNodeId };
          }
        }
        
        return null;
      };

      // X印を検出
      const xMarkDetection = detectXMark();

      // ストロークデータを解析用のテキストに変換
      const strokeDescriptions = strokes.map((stroke, index) => {
        const points = stroke.points;
        const numPoints = points.length / 2;
        const startX = points[0];
        const startY = points[1];
        const endX = points[points.length - 2];
        const endY = points[points.length - 1];
        
        // バウンディングボックスを計算
        const { minX, maxX, minY, maxY, centerX, centerY } = getStrokeBounds(points);
        const width = maxX - minX;
        const height = maxY - minY;
        
        // 閉じた図形かどうか
        const isClosed = Math.sqrt((startX - endX) ** 2 + (startY - endY) ** 2) < 50;
        
        // アスペクト比
        const aspectRatio = width / (height || 1);
        
        return `ストローク${index + 1}: 
  - 点数: ${numPoints}
  - 範囲: (${Math.round(minX)}, ${Math.round(minY)}) ～ (${Math.round(maxX)}, ${Math.round(maxY)})
  - 中心: (${Math.round(centerX)}, ${Math.round(centerY)})
  - サイズ: ${Math.round(width)} x ${Math.round(height)}
  - 閉じた形状: ${isClosed ? "はい" : "いいえ"}
  - アスペクト比: ${aspectRatio.toFixed(2)}`;
      }).join("\n\n");

      // ノード位置情報をテキストに変換
      const nodePositionDescriptions = nodePositions && nodePositions.length > 0
        ? nodePositions.map((node) => 
            `- ノード「${node.label}」(ID: ${node.id}): 位置=(${node.x}, ${node.y}), サイズ=${node.width}x${node.height}, 中心=(${node.centerX}, ${node.centerY})`
          ).join("\n")
        : "（ノード位置情報なし）";

      const userMessage = `現在のMermaidコード:
\`\`\`mermaid
${currentMermaidCode}
\`\`\`

## 現在のダイアグラム上の各ノードの位置（ピクセル座標）:
${nodePositionDescriptions}

## 手書きストロークデータ（${strokes.length}個のストローク）:
${strokeDescriptions}

${xMarkDetection ? `## ⚠️ X印（バツ）を検出しました！
- X印の中心座標: (${Math.round(xMarkDetection.centerX)}, ${Math.round(xMarkDetection.centerY)})
- 対象ノード: ${xMarkDetection.targetNodeId ? `「${xMarkDetection.targetNodeId}」を削除してください` : "特定できませんでした（位置から判断してください）"}

**重要**: X印が描かれたノードとその接続を削除してください。
` : ""}
${hint ? `## ユーザーからの補足: ${hint}` : ""}

## 解釈のヒント
- ストロークの座標と既存ノードの位置を比較して、どのノードに対する操作かを判断してください
- ストロークがノードの近くにある場合、そのノードとの関連を考慮してください
- ノード間を結ぶような線は、接続（矢印）を意味する可能性が高いです
- **X印（バツ）がノード上に描かれた場合は、そのノードを削除してください**

これらのストロークを解釈して、Mermaidダイアグラムを更新してください。`;

      // マルチモーダルメッセージを構築
      type MessageContent = { type: "text"; text: string } | { type: "image"; image: string };
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
        system: STROKE_INTERPRETATION_PROMPT,
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
      })
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
        system: "あなたはMermaidコードのエラーを修正する専門家です。必ず有効なMermaid構文を出力してください。",
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
