# AI SDK 使用状況まとめ

このドキュメントでは、InkmaidプロジェクトにおけるVercel AI SDKの使用状況を整理します。

---

## 概要

**Vercel AI SDK**は、Inkmaidプロジェクトのコア機能である「手書きストロークの解釈」と「Mermaidダイアグラムの生成・編集」を実現するために使用されています。

### 主な用途

1. **手書きストロークの解釈** - ユーザーが描いた手書き図形をMermaidコードに変換
2. **Mermaidコードの編集** - 自然言語による指示でダイアグラムを修正
3. **エラー修正** - Mermaid構文エラーの自動修正
4. **ストリーミング応答** - AIの思考過程をリアルタイムで表示

---

## インストールされているパッケージ

| パッケージ | バージョン | 用途 |
|-----------|----------|------|
| `ai` | ^5.0.116 | AI SDKコアライブラリ |
| `@ai-sdk/anthropic` | ^2.0.56 | Claude（Anthropic）プロバイダー |
| `@ai-sdk/google` | ^2.0.51 | Gemini（Google）プロバイダー |
| `@ai-sdk/openai` | ^2.0.88 | GPT（OpenAI）プロバイダー |

**インストール場所**: `apps/web/package.json`

---

## 使用箇所

### 1. ストリーミングAPI（RESTエンドポイント）

**ファイル**: `apps/web/src/app/api/ai/interpret-stream/route.ts`

**機能**: 手書きストロークを解釈してMermaidコードに変換。**SSE（Server-Sent Events）形式**でAIの思考過程をリアルタイムでストリーミング返却します。

**使用しているAI SDK機能**:
- `streamText()` - ストリーミングテキスト生成
- `fullStream` - ストリーミングの全パート（思考過程 + 出力）を取得
- マルチモーダル入力（テキスト + 画像）

**特徴**:
- Claude Extended Thinking対応（思考過程をリアルタイム表示）
- マルチプロバイダー対応（環境変数`AI_PROVIDER`で切り替え可能）
- Langfuse連携（トレース・ログ記録）

**コード例**:

```423:428:apps/web/src/app/api/ai/interpret-stream/route.ts
  // ストリーミングでAI応答を生成
  const result = streamText({
    model: getModel(),
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    providerOptions: getProviderOptions(),
  });
```

**ストリーミング処理**:

```438:456:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

---

### 2. tRPCルーター（非ストリーミング）

**ファイル**: `apps/web/src/server/trpc/routers/ai.ts`

**機能**: tRPC経由でAI処理を実行。ストリーミングではなく、一度に結果を返します。

**使用しているAI SDK機能**:
- `generateText()` - 通常のテキスト生成（非ストリーミング）

**提供しているエンドポイント**:

#### 2.1 `ai.editDiagram`
Mermaidコードを自然言語で修正します。

```293:298:apps/web/src/server/trpc/routers/ai.ts
      // AI SDKでテキスト生成
      const result = await generateText({
        model: getModel(),
        system: SYSTEM_PROMPT,
        messages,
        providerOptions: getProviderOptions(),
      });
```

#### 2.2 `ai.chat`
シンプルなチャットエンドポイント（Mermaid修正なし）。

```343:351:apps/web/src/server/trpc/routers/ai.ts
      const result = await generateText({
        model: getModel(),
        system:
          "あなたはMermaidダイアグラムの作成を支援するフレンドリーなAIアシスタントです。日本語で回答してください。",
        messages: [
          ...conversationHistory,
          { role: "user" as const, content: message },
        ],
      });
```

#### 2.3 `ai.interpretStrokes`
手書きストロークを解釈してMermaidコードに変換（非ストリーミング版）。

```632:637:apps/web/src/server/trpc/routers/ai.ts
      const result = await generateText({
        model: getModel(),
        system: getStrokeInterpretationPrompt(diagramType as DiagramType),
        messages: [{ role: "user" as const, content: messageContent }],
        providerOptions: getProviderOptions(),
      });
```

#### 2.4 `ai.fixMermaidError`
Mermaidコードの構文エラーを自動修正。

```700:706:apps/web/src/server/trpc/routers/ai.ts
      const result = await generateText({
        model: getModel(),
        system:
          "あなたはMermaidコードのエラーを修正する専門家です。必ず有効なMermaid構文を出力してください。",
        messages: [{ role: "user" as const, content: fixPrompt }],
        providerOptions: getProviderOptions(),
      });
```

---

### 3. クライアント側フック

**ファイル**: `apps/web/src/lib/hooks/useAIStream.ts`

**機能**: ストリーミングAPIを呼び出し、SSEイベントを処理してReact状態を管理します。

**特徴**:
- SSEストリームの読み取り
- 思考過程と出力テキストの分離
- キャンセル機能（AbortController）
- エラーハンドリング

**使用例**:

```101:108:apps/web/src/lib/hooks/useAIStream.ts
        const response = await fetch("/api/ai/interpret-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
          signal: abortController.signal,
        });
```

**SSEイベント処理**:

```149:165:apps/web/src/lib/hooks/useAIStream.ts
              if (event.type === "reasoning") {
                // 思考過程（Claude Extended Thinking）
                thinkingBuffer += event.text;
                setState((prev) => ({
                  ...prev,
                  thinkingText: thinkingBuffer,
                }));
              } else if (event.type === "text-delta") {
                // テキスト出力
                outputBuffer += event.text;
                setState((prev) => ({
                  ...prev,
                  outputText: outputBuffer,
                }));
              } else if (event.type === "error") {
                throw new Error(event.error);
              }
```

---

## プロバイダー設定

### 対応プロバイダー

環境変数`AI_PROVIDER`で以下のプロバイダーを切り替え可能です：

| プロバイダー | 環境変数値 | 使用モデル | APIキー環境変数 |
|------------|----------|----------|---------------|
| Anthropic | `anthropic`（デフォルト） | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| Google | `google` | `gemini-2.0-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| OpenAI | `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` |

### プロバイダー選択ロジック

```32:41:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

### Claude Extended Thinking設定

Claude使用時のみ、Extended Thinking（思考過程の可視化）を有効化しています。

```46:59:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

---

## マルチモーダル入力

画像とテキストの両方を入力として受け取ることができます。

**使用例**:

```352:379:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

**用途**:
- 手書き文字の認識（OCR）
- 図形の視覚的な解釈
- 既存ダイアグラムとの位置関係の理解

---

## 出力形式

AI SDKから返されるテキストは、以下の形式でパースされます：

```
---MERMAID_START---
(修正後のMermaidコード)
---MERMAID_END---

---REASON_START---
(何を検出して、どのような修正を行ったかの説明)
---REASON_END---
```

**パース処理**:

```58:70:apps/web/src/lib/hooks/useAIStream.ts
  const parseResult = useCallback((text: string): ParsedResult => {
    const mermaidMatch = text.match(
      /---MERMAID_START---\s*([\s\S]*?)\s*---MERMAID_END---/,
    );
    const reasonMatch = text.match(
      /---REASON_START---\s*([\s\S]*?)\s*---REASON_END---/,
    );

    return {
      mermaidCode: mermaidMatch?.[1]?.trim() ?? null,
      reason: reasonMatch?.[1]?.trim() ?? null,
    };
  }, []);
```

---

## Langfuse連携

AI SDKの呼び出しは、Langfuseでトレース・ログ記録されています。

**トレース開始**:

```256:267:apps/web/src/app/api/ai/interpret-stream/route.ts
  // Langfuseトレースを開始
  const langfuse = getLangfuse();
  const trace = langfuse?.trace({
    name: "interpret-stream",
    metadata: {
      diagramType,
      strokeCount: strokes.length,
      hasImage: !!canvasImage,
      hasHint: !!hint,
      provider: getProvider(),
    },
  });
```

**Generationスパン作成**:

```408:420:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

**完了時の記録**:

```458:465:apps/web/src/app/api/ai/interpret-stream/route.ts
        // Langfuse Generationを完了としてマーク
        generation?.end({
          output: fullOutput,
          level: "DEFAULT",
        });

        // Langfuseのイベントをフラッシュ
        await flushLangfuse();
```

---

## プロンプト設計

### ストローク解釈用プロンプト

図の種類ごとに専用のプロンプトが定義されています：

- **構文ルール**: Mermaidの構文を説明
- **ストローク解釈ルール**: 手書き図形の形状から意図を推測するルール
- **X印による削除**: バツ印が描かれた要素を削除するルール

**プロンプト生成関数**: `getStrokeInterpretationPrompt()`

```147:203:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

---

## エラーハンドリング

### APIキー不足時のエラー

```386:406:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

### ストリーミングエラー処理

```470:488:apps/web/src/app/api/ai/interpret-stream/route.ts
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
```

---

## まとめ

### AI SDKが担っている役割

1. **LLM呼び出しの抽象化** - 複数のプロバイダー（Anthropic, Google, OpenAI）を統一インターフェースで扱える
2. **ストリーミング処理** - `streamText`と`fullStream`により、思考過程と出力をリアルタイムで取得
3. **マルチモーダル対応** - テキストと画像の両方を入力として扱える
4. **Extended Thinking対応** - Claudeの思考過程を可視化

### 今後の拡張可能性

- **Tool Calling**: 設計ドキュメント（`doc/develop.md`）では言及されているが、現在は未実装
- **Function Calling**: より構造化された出力のための関数呼び出し機能
- **ストリーミングの最適化**: より細かい制御やレート制限の追加

---

## 関連ドキュメント

- [APIリファレンス](./api-reference.md) - APIエンドポイントの詳細
- [設計ドキュメント](./develop.md) - アーキテクチャ全体の説明
- [開発ガイド](./development-guide.md) - 開発ワークフロー
