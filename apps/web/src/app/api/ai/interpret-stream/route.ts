import { flushLangfuse, getLangfuse } from "@/lib/langfuse/client";
import {
  isStrokeDataTooLarge,
  simplifyStrokes,
} from "@/lib/utils/strokeSimplification";
import { DIAGRAM_TYPES, type DiagramType } from "@/server/db/schema";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

/**
 * 現在のAIプロバイダーを取得
 */
function getProvider() {
  return process.env.AI_PROVIDER ?? "anthropic";
}

/**
 * 使用するAIモデル名を取得（ログ用）
 */
function getModelName(): string {
  const provider = getProvider();
  if (provider === "openai") {
    return "gpt-4o-mini";
  }
  if (provider === "google") {
    return "gemini-2.0-flash";
  }
  return "claude-sonnet-4-20250514";
}

/**
 * 使用するAIモデルを選択
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
          budgetTokens: 10000,
        },
      },
    };
  }
  return undefined;
}

/**
 * 図の種類ごとの構文ルール
 */
const DIAGRAM_SYNTAX_RULES: Record<DiagramType, string> = {
  flowchart: `## フローチャート (flowchart) の構文
- \`flowchart TD\` (上から下) または \`flowchart LR\` (左から右) で始まる
- ノードの定義: \`A[テキスト]\`, \`B{条件}\`, \`C((円形))\`, \`D([楕円])\`
- 接続: \`A --> B\`, \`A -->|ラベル| B\`, \`A --- B\`
- スタイル: \`style A fill:#f9f,stroke:#333\`
- サブグラフ: \`subgraph タイトル\` ... \`end\``,

  sequence: `## シーケンス図 (sequenceDiagram) の構文
- \`sequenceDiagram\` で始まる
- 参加者: \`participant A as エイリアス\`
- メッセージ: \`A->>B: メッセージ\` (同期), \`A-->>B: メッセージ\` (応答)
- アクティベーション: \`activate A\` ... \`deactivate A\`
- ノート: \`Note right of A: テキスト\`
- ループ: \`loop 条件\` ... \`end\``,

  classDiagram: `## クラス図 (classDiagram) の構文
- \`classDiagram\` で始まる
- クラス定義: \`class クラス名 { +メソッド() -プロパティ }\`
- 継承: \`親クラス <|-- 子クラス\`
- 実装: \`インターフェース <|.. 実装クラス\`
- 集約: \`A o-- B\`, 合成: \`A *-- B\`
- 関連: \`A --> B\` または \`A -- B\``,

  stateDiagram: `## 状態遷移図 (stateDiagram-v2) の構文
- \`stateDiagram-v2\` で始まる
- 開始: \`[*] --> 状態名\`
- 終了: \`状態名 --> [*]\`
- 遷移: \`状態A --> 状態B : イベント\`
- 複合状態: \`state 状態名 { ... }\`
- フォーク/ジョイン: \`state fork_state <<fork>>\``,

  erDiagram: `## ER図 (erDiagram) の構文
- \`erDiagram\` で始まる
- エンティティ: \`ENTITY_NAME { type attribute_name }\`
- 属性タイプ: \`string\`, \`int\`, \`text\`, \`date\` など
- キー: \`PK\` (主キー), \`FK\` (外部キー)
- リレーション: \`||--o{\` (1対多), \`||--||\` (1対1), \`}o--o{\` (多対多)`,
};

/**
 * 図の種類ごとのストローク解釈ルール
 */
const DIAGRAM_STROKE_RULES: Record<DiagramType, string> = {
  flowchart: `## ストロークの解釈ルール（フローチャート）
- 四角形に近い形 → ノード（処理ブロック）の追加
- ひし形に近い形 → 条件分岐（decision）の追加
- 円形に近い形 → 開始/終了ノードの追加
- 線や矢印（既存ノード間を結ぶもの） → ノード間の接続を追加
- **X印（バツ）がノード上に描かれた場合 → そのノードと関連する接続を削除**
- 囲み → サブグラフ`,

  sequence: `## ストロークの解釈ルール（シーケンス図）
- 縦の直線 → 新しい参加者（participant）の追加
- 横向きの矢印 → メッセージの追加
- 点線の矢印 → 応答メッセージ
- 四角の囲み → アクティベーション領域
- **X印（バツ）が参加者上に描かれた場合 → その参加者を削除**`,

  classDiagram: `## ストロークの解釈ルール（クラス図）
- 四角形 → 新しいクラスの追加
- 三角矢印 → 継承関係
- 通常の矢印 → 関連
- ひし形 → 集約/合成
- **X印（バツ）がクラス上に描かれた場合 → そのクラスを削除**`,

  stateDiagram: `## ストロークの解釈ルール（状態遷移図）
- 円形/楕円 → 状態の追加
- 塗りつぶした円 → 開始状態 [*]
- 二重円 → 終了状態
- 矢印 → 状態遷移
- **X印（バツ）が状態上に描かれた場合 → その状態を削除**`,

  erDiagram: `## ストロークの解釈ルール（ER図）
- 四角形 → エンティティの追加
- 線 → リレーションの追加
- 線の端の形状で多重度を判断（1、多など）
- **X印（バツ）がエンティティ上に描かれた場合 → そのエンティティを削除**`,
};

/**
 * 図の種類に応じたストローク解釈用プロンプトを生成
 */
function getStrokeInterpretationPrompt(diagramType: DiagramType): string {
  return `あなたは手書きストロークを解釈してMermaidダイアグラムを生成・編集するAIアシスタントです。

## 現在編集中の図の種類: ${diagramType}

## あなたの役割
- **画像が提供された場合は、画像を優先的に分析する**（手書き文字の認識、図形の解釈）
- ユーザーの手書きストローク（座標データ）を分析する
- ストロークの形状や配置から、ユーザーの意図を推測する
- 現在のMermaidコードを考慮して、適切な修正を行う

## 重要：画像解析（マルチモーダル）
画像が提供された場合：
- **手書きの文字を読み取ってください**（ノードのラベルとして使用）
- 手書きの図形を認識してください
- 既存のダイアグラムと手書きの位置関係を分析してください
- 紫色の線が手書きストロークです

${DIAGRAM_SYNTAX_RULES[diagramType]}

${DIAGRAM_STROKE_RULES[diagramType]}

## ノード位置情報の活用
座標データも併せて提供されます：
- **ストロークの座標と既存要素の位置を比較**して、どの要素に対する操作かを判断
- ストロークの始点・終点がどの要素に近いかで、関係を推測
- ストロークが要素を囲んでいる場合は、その要素の修正や強調を意味する

## X印（バツ）による削除の重要ルール
ユーザーが要素の上に「X」の形（2本の斜め線が交差）を描いた場合：
1. その要素をMermaidコードから削除する
2. その要素への/からの接続も削除する
3. 削除により孤立する要素があれば、適切に処理する
4. 削除後もダイアグラムが有効な構造を維持するようにする

## 座標データの解釈
- points配列は [x1, y1, x2, y2, ...] の形式
- ストロークの開始点と終了点の近さで閉じた図形かを判断
- **ストロークの座標と既存要素の座標を比較して、操作対象を特定**

## 出力形式
以下の形式で出力してください：

---MERMAID_START---
(修正後のMermaidコード)
---MERMAID_END---

---REASON_START---
(何を検出して、どのような修正を行ったかの説明)
---REASON_END---

## 注意事項
- 必ず有効なMermaid ${diagramType} 構文を出力すること
- 既存の要素を保持しつつ、新しい要素を追加すること
- 不明確な場合は、最も可能性の高い解釈を選ぶこと
- 図の種類に適した構文を使用すること`;
}

/**
 * リクエストボディの型定義
 */
interface InterpretStreamRequest {
  strokes: Array<{
    id: string;
    points: number[];
    color: string;
    strokeWidth: number;
  }>;
  currentMermaidCode: string;
  nodePositions?: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }>;
  canvasImage?: string;
  hint?: string;
  diagramType?: DiagramType;
}

/**
 * ストリーミング対応のストローク解釈エンドポイント
 * AIの思考過程をリアルタイムで返す（SSE形式）
 */
export async function POST(request: Request) {
  const body: InterpretStreamRequest = await request.json();
  const {
    strokes,
    currentMermaidCode,
    nodePositions,
    canvasImage,
    hint,
    diagramType = "flowchart",
  } = body;

  // ストロークがない場合は早期リターン
  if (strokes.length === 0) {
    return new Response(
      JSON.stringify({
        error: "ストロークがありません。手書きで図形を描いてください。",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ストロークデータが大きすぎる場合は簡略化
  let processedStrokes = strokes;
  if (isStrokeDataTooLarge(strokes)) {
    // 簡略化を実行（許容誤差2.0、最大500points/ストローク）
    processedStrokes = simplifyStrokes(strokes, 2.0, 500);

    // 簡略化後も大きい場合はエラーを返す
    if (isStrokeDataTooLarge(processedStrokes)) {
      return new Response(
        JSON.stringify({
          error:
            "ストロークデータが大きすぎます。ストローク数を減らすか、より簡潔に描いてください。",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Langfuseトレースを開始
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "interpret-stream",
    metadata: {
      diagramType,
      strokeCount: processedStrokes.length,
      originalStrokeCount: strokes.length,
      hasImage: !!canvasImage,
      hasHint: !!hint,
      provider: getProvider(),
    },
  });

  // ストロークのバウンディングボックスを計算
  const getStrokeBounds = (points: number[]) => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x !== undefined && y !== undefined) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  };

  // ストロークデータをテキストに変換
  const strokeDescriptions = processedStrokes
    .map((stroke, index) => {
      const points = stroke.points;
      const numPoints = points.length / 2;
      const startX = points[0];
      const startY = points[1];
      const endX = points[points.length - 2];
      const endY = points[points.length - 1];

      if (
        startX === undefined ||
        startY === undefined ||
        endX === undefined ||
        endY === undefined
      ) {
        return `ストローク${index + 1}: 無効なデータ`;
      }

      const { minX, maxX, minY, maxY, centerX, centerY } =
        getStrokeBounds(points);
      const width = maxX - minX;
      const height = maxY - minY;

      const isClosed =
        Math.sqrt((startX - endX) ** 2 + (startY - endY) ** 2) < 50;
      const aspectRatio = width / (height || 1);

      return `ストローク${index + 1}:
  - 点数: ${numPoints}
  - 範囲: (${Math.round(minX)}, ${Math.round(minY)}) ～ (${Math.round(maxX)}, ${Math.round(maxY)})
  - 中心: (${Math.round(centerX)}, ${Math.round(centerY)})
  - サイズ: ${Math.round(width)} x ${Math.round(height)}
  - 閉じた形状: ${isClosed ? "はい" : "いいえ"}
  - アスペクト比: ${aspectRatio.toFixed(2)}`;
    })
    .join("\n\n");

  // ノード位置情報をテキストに変換
  const nodePositionDescriptions =
    nodePositions && nodePositions.length > 0
      ? nodePositions
          .map(
            (node) =>
              `- ノード「${node.label}」(ID: ${node.id}): 位置=(${node.x}, ${node.y}), サイズ=${node.width}x${node.height}, 中心=(${node.centerX}, ${node.centerY})`,
          )
          .join("\n")
      : "（ノード位置情報なし）";

  const userMessage = `現在のMermaidコード:
\`\`\`mermaid
${currentMermaidCode}
\`\`\`

## 現在のダイアグラム上の各ノードの位置（ピクセル座標）:
${nodePositionDescriptions}

## 手書きストロークデータ（${processedStrokes.length}個のストローク${strokes.length !== processedStrokes.length ? `、簡略化済み（元: ${strokes.length}個）` : ""}）:
${strokeDescriptions}

${hint ? `## ユーザーからの補足: ${hint}` : ""}

## 解釈のヒント
- ストロークの座標と既存ノードの位置を比較して、どのノードに対する操作かを判断してください
- ストロークがノードの近くにある場合、そのノードとの関連を考慮してください
- ノード間を結ぶような線は、接続（矢印）を意味する可能性が高いです
- **X印（バツ）がノード上に描かれた場合は、そのノードを削除してください**

これらのストロークを解釈して、Mermaidダイアグラムを更新してください。`;

  // マルチモーダルメッセージを構築
  type MessageContent =
    | { type: "text"; text: string }
    | { type: "image"; image: string };
  const messageContent: MessageContent[] = [];

  // 画像がある場合は先に追加
  if (canvasImage) {
    messageContent.push({
      type: "image",
      image: canvasImage,
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

  // 図の種類がサポートされているか確認
  const validDiagramType = DIAGRAM_TYPES.includes(diagramType)
    ? diagramType
    : "flowchart";

  // APIキーの存在チェック
  const provider = getProvider();
  const apiKeyMissing =
    (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) ||
    (provider === "openai" && !process.env.OPENAI_API_KEY) ||
    (provider === "google" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  if (apiKeyMissing) {
    const envVarName =
      provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : provider === "openai"
          ? "OPENAI_API_KEY"
          : "GOOGLE_GENERATIVE_AI_API_KEY";
    return new Response(
      JSON.stringify({
        error: `${envVarName} が設定されていません。.env.local ファイルにAPIキーを設定してください。`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Langfuse Generationスパンを作成
  const systemPrompt = getStrokeInterpretationPrompt(validDiagramType);
  const generation = trace?.generation({
    name: "stroke-interpretation",
    model: getModelName(),
    input: {
      system: systemPrompt,
      messages: messageContent,
    },
    metadata: {
      diagramType: validDiagramType,
    },
  });

  // ストリーミングでAI応答を生成
  const result = streamText({
    model: getModel(),
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    providerOptions: getProviderOptions(),
  });

  // カスタムSSEストリームを作成（思考過程を含む）
  const encoder = new TextEncoder();
  let fullOutput = "";

  const customStream = new ReadableStream({
    async start(controller) {
      try {
        // fullStreamを使ってすべてのパートを取得
        for await (const part of result.fullStream) {
          // イベントタイプに応じてSSEを送信
          if (part.type === "reasoning-delta") {
            // 思考過程（Claude Extended Thinking）のデルタ
            const data = JSON.stringify({
              type: "reasoning",
              text: part.text,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } else if (part.type === "text-delta") {
            // テキスト出力のデルタ
            fullOutput += part.text;
            const data = JSON.stringify({
              type: "text-delta",
              text: part.text,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // Langfuse Generationを完了としてマーク
        generation?.end({
          output: fullOutput,
          level: "DEFAULT",
        });

        // Langfuseのイベントをフラッシュ
        await flushLangfuse();

        // 完了シグナル
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[interpret-stream] エラー:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Langfuse Generationをエラーとしてマーク
        generation?.end({
          output: errorMessage,
          level: "ERROR",
          statusMessage: errorMessage,
        });

        // Langfuseのイベントをフラッシュ
        await flushLangfuse();

        const data = JSON.stringify({ type: "error", error: errorMessage });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(customStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
