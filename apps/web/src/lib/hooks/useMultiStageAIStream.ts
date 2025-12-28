"use client";

import type { Stroke } from "@/components/HandwritingCanvas";
import type { NodePosition } from "@/components/MermaidPreview";
import { MULTI_STAGE_CONFIG } from "@/lib/config/multiStageProcessing";
import {
  divideStrokesOptimally,
  getRemainingStrokes,
} from "@/lib/utils/strokeDivision";
import {
  estimateStrokeDataSize,
  isStrokeDataTooLarge,
  simplifyStrokes,
} from "@/lib/utils/strokeSimplification";
import type { DiagramType } from "@/server/db/schema";
import { useCallback, useRef, useState } from "react";

/**
 * 多段階処理の状態
 */
type MultiStageProcessingState =
  | "idle"
  | "stage1"
  | "stage2a"
  | "stage2b"
  | "completed"
  | "error";

/**
 * 多段階処理の進捗情報
 */
type Progress = {
  current: number;
  total: number;
  message: string;
};

/**
 * Stage 1の結果
 */
type Stage1Result = {
  mermaidCode: string;
  reason: string;
  thinking: string;
  processedStrokeIndices: number[];
};

/**
 * Stage 2の結果
 */
type Stage2Result = {
  mermaidCode: string;
  reason: string;
  thinking: string;
  processedRegions?: Array<{
    regionId: string;
    strokeCount: number;
  }>;
};

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
  /** 多段階処理の状態 */
  multiStageState: MultiStageProcessingState;
  /** 進捗情報 */
  progress: Progress;
  /** Stage 1の結果 */
  stage1Result: Stage1Result | null;
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
  canvasSize?: { width: number; height: number };
};

/**
 * パース結果
 */
type ParsedResult = {
  mermaidCode: string | null;
  reason: string | null;
};

/**
 * 多段階処理を使用すべきか判定
 */
function shouldUseMultiStageProcessing(strokes: Stroke[]): boolean {
  const strokeCount = strokes.length;
  const dataSize = estimateStrokeDataSize(strokes);

  return (
    strokeCount > MULTI_STAGE_CONFIG.THRESHOLD_STROKE_COUNT ||
    dataSize > MULTI_STAGE_CONFIG.THRESHOLD_SIZE_BYTES
  );
}

/**
 * SSEストリームを読み取り、thinking と output を収集する共通関数
 */
async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onProgress: (thinking: string, output: string) => void,
): Promise<{ thinkingBuffer: string; outputBuffer: string }> {
  const decoder = new TextDecoder();
  let thinkingBuffer = "";
  let outputBuffer = "";
  let buffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      streamDone = true;
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      // 空行をスキップ
      if (!line.trim()) continue;

      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        streamDone = true;
        break;
      }

      if (!data) continue;

      try {
        const event = JSON.parse(data);

        if (event.type === "reasoning") {
          thinkingBuffer += event.text || "";
          onProgress(thinkingBuffer, outputBuffer);
        } else if (event.type === "text-delta") {
          outputBuffer += event.text || "";
          onProgress(thinkingBuffer, outputBuffer);
        } else if (event.type === "error") {
          throw new Error(event.error || "Unknown error");
        }
      } catch (e) {
        // JSONパースエラーの場合は警告を出して続行
        if (data !== "[DONE]" && data.trim()) {
          console.warn("SSE parse error:", e, "Data:", data);
        }
      }
    }

    if (streamDone) break;
  }

  return { thinkingBuffer, outputBuffer };
}

/**
 * 通常処理（単一API呼び出し）
 */
async function normalProcessing(
  params: InterpretParams,
  signal: AbortSignal,
  onProgress: (thinking: string, output: string) => void,
): Promise<ParsedResult> {
  const response = await fetch("/api/ai/interpret-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      strokes: params.strokes,
      currentMermaidCode: params.currentMermaidCode,
      nodePositions: params.nodePositions,
      canvasImage: params.canvasImage,
      hint: params.hint,
      diagramType: params.diagramType,
      mode: "normal",
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "API呼び出しに失敗しました");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("レスポンスボディを読み取れません");
  }

  const { outputBuffer } = await readSSEStream(reader, onProgress);

  return parseResult(outputBuffer);
}

/**
 * Stage 1処理（全体構造の把握）
 */
async function processStage1(
  params: InterpretParams,
  signal: AbortSignal,
  onProgress: (thinking: string, output: string) => void,
): Promise<Stage1Result & { processedStrokeIndices: number[] }> {
  // 簡略化されたストロークを準備
  const simplifiedStrokes = simplifyStrokes(
    params.strokes,
    MULTI_STAGE_CONFIG.STAGE1_SIMPLIFICATION_TOLERANCE,
    MULTI_STAGE_CONFIG.STAGE1_MAX_POINTS_PER_STROKE,
  );

  // 簡略化で使用されたストロークのインデックスを記録
  // 簡略化は全ストロークを使用するため、全インデックスを記録
  const processedStrokeIndices = params.strokes.map((_, index) => index);

  const response = await fetch("/api/ai/interpret-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      strokes: simplifiedStrokes,
      currentMermaidCode: params.currentMermaidCode,
      nodePositions: params.nodePositions,
      canvasImage: params.canvasImage,
      hint: params.hint,
      diagramType: params.diagramType,
      mode: "structure-extraction",
      stage: 1,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Stage 1でエラーが発生しました");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("レスポンスボディを読み取れません");
  }

  const { thinkingBuffer, outputBuffer } = await readSSEStream(
    reader,
    onProgress,
  );

  const { mermaidCode, reason } = parseResult(outputBuffer);

  if (!mermaidCode) {
    throw new Error("Stage 1でMermaidコードを生成できませんでした");
  }

  return {
    mermaidCode,
    reason: reason || "全体構造を抽出しました",
    thinking: thinkingBuffer,
    processedStrokeIndices,
  };
}

/**
 * Stage 2A処理（直接追加）
 */
async function processStage2A(
  baseMermaidCode: string,
  remainingStrokes: Stroke[],
  params: InterpretParams,
  signal: AbortSignal,
  onProgress: (thinking: string, output: string) => void,
): Promise<Stage2Result> {
  const response = await fetch("/api/ai/interpret-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      strokes: remainingStrokes,
      currentMermaidCode: baseMermaidCode,
      nodePositions: params.nodePositions,
      canvasImage: params.canvasImage,
      hint: params.hint,
      diagramType: params.diagramType,
      mode: "detail-addition",
      stage: 2,
      baseMermaidCode,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Stage 2Aでエラーが発生しました");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("レスポンスボディを読み取れません");
  }

  const { thinkingBuffer, outputBuffer } = await readSSEStream(
    reader,
    onProgress,
  );

  const { mermaidCode, reason } = parseResult(outputBuffer);

  if (!mermaidCode) {
    throw new Error("Stage 2AでMermaidコードを生成できませんでした");
  }

  return {
    mermaidCode,
    reason: reason || "詳細を追加しました",
    thinking: thinkingBuffer,
  };
}

/**
 * Stage 2B処理（分割処理）
 */
async function processStage2B(
  baseMermaidCode: string,
  remainingStrokes: Stroke[],
  params: InterpretParams,
  signal: AbortSignal,
  onProgress: (
    thinking: string,
    output: string,
    regionProgress?: { current: number; total: number },
  ) => void,
): Promise<Stage2Result> {
  if (!params.canvasSize) {
    throw new Error("Stage 2BにはcanvasSizeが必要です");
  }

  // ストロークを分割
  const { dividedStrokes, method } = divideStrokesOptimally(
    remainingStrokes,
    params.canvasSize,
  );

  let mergedMermaidCode = baseMermaidCode;
  const processedRegions: Array<{ regionId: string; strokeCount: number }> = [];

  // 各領域を順次処理
  for (let i = 0; i < dividedStrokes.length; i++) {
    const regionStrokes = dividedStrokes[i];
    if (!regionStrokes || regionStrokes.length === 0) continue;

    const regionId = `region-${i + 1}`;
    onProgress("", "", { current: i + 1, total: dividedStrokes.length });

    try {
      const result = await processStage2A(
        mergedMermaidCode,
        regionStrokes,
        params,
        signal,
        (thinking, output) => {
          onProgress(thinking, output, {
            current: i + 1,
            total: dividedStrokes.length,
          });
        },
      );

      mergedMermaidCode = result.mermaidCode;
      processedRegions.push({
        regionId,
        strokeCount: regionStrokes.length,
      });
    } catch (error) {
      console.warn(`領域 ${regionId} の処理に失敗:`, error);
      // エラーが発生しても続行
    }
  }

  return {
    mermaidCode: mergedMermaidCode,
    reason: `${method}方式で${processedRegions.length}領域を処理しました`,
    thinking: "",
    processedRegions,
  };
}

/**
 * AIの応答テキストからMermaidコードと理由を抽出
 */
function parseResult(text: string): ParsedResult {
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
}

/**
 * 多段階AIストリーミングを管理するカスタムフック
 */
export function useMultiStageAIStream() {
  const [state, setState] = useState<AIStreamState>({
    isProcessing: false,
    thinkingText: "",
    outputText: "",
    errorMessage: null,
    multiStageState: "idle",
    progress: { current: 0, total: 0, message: "" },
    stage1Result: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * ストリーミングでストローク解釈を実行（多段階処理対応）
   */
  const interpretStrokes = useCallback(
    async (
      params: InterpretParams,
      onComplete: (result: {
        mermaidCode: string | null;
        reason: string | null;
        thinking: string;
      }) => void,
      onStage1Complete?: (result: {
        mermaidCode: string;
        reason: string;
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
        multiStageState: "idle",
        progress: { current: 0, total: 0, message: "" },
        stage1Result: null,
      });

      try {
        // 多段階処理を使用すべきか判定
        if (!shouldUseMultiStageProcessing(params.strokes)) {
          // 通常処理
          setState((prev) => ({
            ...prev,
            progress: { current: 1, total: 1, message: "処理中..." },
          }));

          let finalThinking = "";
          const result = await normalProcessing(
            params,
            abortController.signal,
            (thinking, output) => {
              finalThinking = thinking;
              setState((prev) => ({
                ...prev,
                thinkingText: thinking,
                outputText: output,
              }));
            },
          );

          // 処理完了状態に更新（onComplete呼び出しの前に確実に状態を更新）
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            multiStageState: "completed",
          }));

          // onCompleteコールバックを実行
          onComplete({
            mermaidCode: result.mermaidCode,
            reason: result.reason,
            thinking: finalThinking,
          });

          return;
        }

        // Stage 1: 全体構造の把握
        setState((prev) => ({
          ...prev,
          multiStageState: "stage1",
          progress: {
            current: 1,
            total: 2,
            message: "全体構造を解析中...",
          },
        }));

        const stage1Result = await processStage1(
          params,
          abortController.signal,
          (thinking, output) => {
            setState((prev) => ({
              ...prev,
              thinkingText: thinking,
              outputText: output,
            }));
          },
        );

        setState((prev) => ({
          ...prev,
          stage1Result: {
            mermaidCode: stage1Result.mermaidCode,
            reason: stage1Result.reason,
            thinking: stage1Result.thinking,
            processedStrokeIndices: stage1Result.processedStrokeIndices,
          },
        }));

        // Stage 1完了時に中間結果を通知
        if (onStage1Complete) {
          onStage1Complete({
            mermaidCode: stage1Result.mermaidCode,
            reason: stage1Result.reason,
          });
        }

        // 残りのストロークを取得
        const remainingStrokes = getRemainingStrokes(
          params.strokes,
          stage1Result.processedStrokeIndices,
        );

        if (remainingStrokes.length === 0) {
          // Stage 1の結果で完了
          // 処理完了状態に更新（onComplete呼び出しの前に確実に状態を更新）
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            multiStageState: "completed",
          }));

          // onCompleteコールバックを実行
          onComplete({
            mermaidCode: stage1Result.mermaidCode,
            reason: stage1Result.reason,
            thinking: stage1Result.thinking,
          });

          return;
        }

        // Stage 2: 詳細の追加
        if (isStrokeDataTooLarge(remainingStrokes)) {
          // Stage 2B: 分割処理
          setState((prev) => ({
            ...prev,
            multiStageState: "stage2b",
            progress: {
              current: 2,
              total: 3,
              message: "詳細を追加中（分割処理）...",
            },
          }));

          const stage2Result = await processStage2B(
            stage1Result.mermaidCode,
            remainingStrokes,
            params,
            abortController.signal,
            (thinking, output, regionProgress) => {
              setState((prev) => ({
                ...prev,
                thinkingText: thinking,
                outputText: output,
                progress: regionProgress
                  ? {
                      current:
                        2 + regionProgress.current / regionProgress.total,
                      total: 3,
                      message: `領域 ${regionProgress.current}/${regionProgress.total} を処理中...`,
                    }
                  : prev.progress,
              }));
            },
          );

          // 処理完了状態に更新（onComplete呼び出しの前に確実に状態を更新）
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            multiStageState: "completed",
          }));

          // onCompleteコールバックを実行
          onComplete({
            mermaidCode: stage2Result.mermaidCode,
            reason: stage2Result.reason,
            thinking: `${stage1Result.thinking}\n\n${stage2Result.thinking}`,
          });
        } else {
          // Stage 2A: 直接追加
          setState((prev) => ({
            ...prev,
            multiStageState: "stage2a",
            progress: {
              current: 2,
              total: 2,
              message: "詳細を追加中...",
            },
          }));

          const stage2Result = await processStage2A(
            stage1Result.mermaidCode,
            remainingStrokes,
            params,
            abortController.signal,
            (thinking, output) => {
              setState((prev) => ({
                ...prev,
                thinkingText: thinking,
                outputText: output,
              }));
            },
          );

          // 処理完了状態に更新（onComplete呼び出しの前に確実に状態を更新）
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            multiStageState: "completed",
          }));

          // onCompleteコールバックを実行
          onComplete({
            mermaidCode: stage2Result.mermaidCode,
            reason: stage2Result.reason,
            thinking: `${stage1Result.thinking}\n\n${stage2Result.thinking}`,
          });
        }
      } catch (error) {
        // AbortError（キャンセル）の場合も状態を適切に更新
        if ((error as Error).name === "AbortError") {
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            multiStageState: "idle",
          }));
          return;
        }

        // その他のエラーの場合
        const errorMessage =
          error instanceof Error ? error.message : "不明なエラーが発生しました";
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          multiStageState: "error",
          errorMessage,
        }));
      }
    },
    [],
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
      multiStageState: "idle",
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
      multiStageState: "idle",
      progress: { current: 0, total: 0, message: "" },
      stage1Result: null,
    });
  }, []);

  return {
    ...state,
    interpretStrokes,
    cancel,
    reset,
  };
}
