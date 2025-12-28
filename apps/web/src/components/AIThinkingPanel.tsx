"use client";

import { useEffect, useRef } from "react";

type AIThinkingPanelProps = {
  /** 現在のAI処理状態 */
  isProcessing: boolean;
  /** 思考過程のテキスト（ストリーミング） */
  thinkingText: string;
  /** 最終結果の理由 */
  resultReason: string | null;
  /** エラーメッセージ */
  errorMessage: string | null;
  /** パネルを閉じる */
  onClose: () => void;
  /** パネルの表示/非表示 */
  isOpen: boolean;
  /** 多段階処理の進捗情報（オプション） */
  progress?: {
    current: number;
    total: number;
    message: string;
  };
  /** 多段階処理の状態（オプション） */
  multiStageState?:
    | "idle"
    | "stage1"
    | "stage2a"
    | "stage2b"
    | "completed"
    | "error";
  /** 両方のパネルが開いているかどうか */
  isBothOpen?: boolean;
};

/**
 * AI思考ログをリアルタイム表示するサイドパネル
 */
export default function AIThinkingPanel({
  isProcessing,
  thinkingText,
  resultReason,
  errorMessage,
  onClose,
  isOpen,
  progress,
  multiStageState,
  isBothOpen = false,
}: AIThinkingPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいテキストが追加されたら自動スクロール
  const thinkingLength = thinkingText.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: thinkingLengthの変化でスクロールを実行する意図的な実装
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinkingLength]);

  if (!isOpen) return null;

  // 両方が開いている場合は左ボーダー、1つだけの場合は右ボーダー
  const borderClass = isBothOpen
    ? "border-l border-slate-700"
    : "border-r border-slate-700";

  return (
    <aside
      className={`w-80 bg-slate-900 ${borderClass} flex flex-col shrink-0 text-slate-100 h-full`}
    >
      {/* ヘッダー */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h2 className="text-sm font-semibold">AI思考ログ</h2>
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              処理中
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors text-lg"
          title="閉じる"
        >
          ×
        </button>
      </div>

      {/* 多段階処理の進捗表示 */}
      {progress &&
        progress.total > 0 &&
        multiStageState &&
        multiStageState !== "idle" &&
        multiStageState !== "completed" &&
        multiStageState !== "error" && (
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 bg-slate-700 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-400 min-w-12 text-right">
                {progress.current}/{progress.total}
              </span>
            </div>
            <p className="text-xs text-slate-300">{progress.message}</p>
            {multiStageState === "stage1" && (
              <p className="text-xs text-slate-500 mt-1">
                全体構造を解析中... 主要な要素を抽出しています
              </p>
            )}
            {multiStageState === "stage2a" && (
              <p className="text-xs text-slate-500 mt-1">
                詳細を追加中... 既存の構造に詳細を統合しています
              </p>
            )}
            {multiStageState === "stage2b" && (
              <p className="text-xs text-slate-500 mt-1">
                領域ごとに処理中... 分割処理で詳細を追加しています
              </p>
            )}
          </div>
        )}

      {/* 思考ログ表示エリア */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
      >
        {/* エラー表示 */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-red-400">❌</span>
              <p className="text-red-200">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 思考過程（Extended Thinking） */}
        {thinkingText && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 text-violet-400">
              <span>💭</span>
              <span className="text-xs font-semibold uppercase tracking-wider">
                Thinking
              </span>
            </div>
            <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
              <pre className="whitespace-pre-wrap text-slate-300">
                {thinkingText}
                {isProcessing && (
                  <span className="inline-block w-2 h-4 bg-violet-400 ml-1 animate-pulse" />
                )}
              </pre>
            </div>
          </div>
        )}

        {/* 結果の理由 */}
        {resultReason && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <span>✅</span>
              <span className="text-xs font-semibold uppercase tracking-wider">
                Result
              </span>
            </div>
            <div className="p-3 bg-slate-800 rounded-lg border border-emerald-700/50">
              <p className="text-slate-200">{resultReason}</p>
            </div>
          </div>
        )}

        {/* 処理中で思考がまだない場合 */}
        {isProcessing && !thinkingText && !errorMessage && (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">AIが解析を開始しています...</p>
          </div>
        )}

        {/* 何もない場合 */}
        {!isProcessing && !thinkingText && !resultReason && !errorMessage && (
          <div className="flex flex-col items-center justify-center h-32 text-slate-500">
            <span className="text-3xl mb-2 opacity-50">💭</span>
            <p className="text-xs text-center">
              AIで変換するとここに
              <br />
              思考過程が表示されます
            </p>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
        <div className="flex items-center justify-between">
          <span>Claude Extended Thinking</span>
          {thinkingText && <span>{thinkingText.length} chars</span>}
        </div>
      </div>
    </aside>
  );
}
