"use client";

import type { Stroke } from "@/components/HandwritingCanvas";
import type { NodePosition } from "@/components/MermaidPreview";
import type { DiagramType } from "@/server/db/schema";
import { useCallback, useRef, useState } from "react";

/**
 * ストリーミングAI応答の状態
 */
type AIStreamState = {
  /** 処理中かどうか */
  isProcessing: boolean;
  /** 思考過程（リアルタイム更新） */
  thinkingText: string;
  /** 最終的な出力テキスト */
  outputText: string;
  /** エラーメッセージ */
  errorMessage: string | null;
};

/**
 * パース結果
 */
type ParsedResult = {
  mermaidCode: string | null;
  reason: string | null;
};

/**
 * ストリーミングAI呼び出しのパラメータ
 */
type InterpretParams = {
  strokes: Stroke[];
  currentMermaidCode: string;
  nodePositions: NodePosition[];
  canvasImage?: string;
  hint?: string;
  diagramType: DiagramType;
};

/**
 * AIストリーミングを管理するカスタムフック
 */
export function useAIStream() {
  const [state, setState] = useState<AIStreamState>({
    isProcessing: false,
    thinkingText: "",
    outputText: "",
    errorMessage: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * AIの応答テキストからMermaidコードと理由を抽出
   */
  const parseResult = useCallback((text: string): ParsedResult => {
    const mermaidMatch = text.match(
      /---MERMAID_START---\s*([\s\S]*?)\s*---MERMAID_END---/,
    );
    const reasonMatch = text.match(
      /---REASON_START---\s*([\s\S]*?)\s*---REASON_END---/,
    );

    return {
      mermaidCode: mermaidMatch ? mermaidMatch[1].trim() : null,
      reason: reasonMatch ? reasonMatch[1].trim() : null,
    };
  }, []);

  /**
   * ストリーミングでストローク解釈を実行
   */
  const interpretStrokes = useCallback(
    async (
      params: InterpretParams,
      onComplete: (result: {
        mermaidCode: string | null;
        reason: string | null;
        thinking: string;
      }) => void,
    ) => {
      // 既存のリクエストをキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // 状態をリセット
      setState({
        isProcessing: true,
        thinkingText: "",
        outputText: "",
        errorMessage: null,
      });

      try {
        const response = await fetch("/api/ai/interpret-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "API呼び出しに失敗しました");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("レスポンスボディを読み取れません");
        }

        const decoder = new TextDecoder();
        let thinkingBuffer = "";
        let outputBuffer = "";
        let buffer = "";

        // SSEストリームを読み取り
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSEイベントをパース（data: で始まる行）
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // 最後の不完全な行を保持

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6); // "data: " を除去

            // 完了シグナル
            if (data === "[DONE]") {
              continue;
            }

            try {
              const event = JSON.parse(data);

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
            } catch (e) {
              // JSON パースエラーは無視（不完全なデータの場合）
              if (data !== "[DONE]" && data.trim()) {
                console.warn("SSE parse error:", e, data);
              }
            }
          }
        }

        // 完了後、結果をパース
        const { mermaidCode, reason } = parseResult(outputBuffer);

        setState((prev) => ({
          ...prev,
          isProcessing: false,
        }));

        onComplete({
          mermaidCode,
          reason,
          thinking: thinkingBuffer,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          // キャンセルされた場合は無視
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : "不明なエラーが発生しました";
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          errorMessage,
        }));
      }
    },
    [parseResult],
  );

  /**
   * 処理をキャンセル
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isProcessing: false,
    }));
  }, []);

  /**
   * 状態をリセット
   */
  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      thinkingText: "",
      outputText: "",
      errorMessage: null,
    });
  }, []);

  return {
    ...state,
    interpretStrokes,
    cancel,
    reset,
  };
}
