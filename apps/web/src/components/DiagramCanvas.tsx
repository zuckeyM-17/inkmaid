"use client";

import { useState, useCallback } from "react";
import DynamicHandwritingCanvas from "./DynamicHandwritingCanvas";
import DynamicMermaidPreview from "./DynamicMermaidPreview";
import type { Stroke } from "./HandwritingCanvas";

type DiagramCanvasProps = {
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** 初期のMermaidコード */
  initialMermaidCode?: string;
  /** ストロークの色 */
  strokeColor?: string;
  /** ストロークの太さ */
  strokeWidth?: number;
  /** ストロークが完了したときのコールバック */
  onStrokeComplete?: (stroke: Stroke) => void;
  /** Mermaidコードが更新されたときのコールバック */
  onMermaidCodeChange?: (code: string) => void;
};

/**
 * サンプルのMermaidコード
 */
const SAMPLE_MERMAID_CODE = `flowchart TD
    A[開始] --> B{条件分岐}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E`;

/**
 * ハイブリッド・キャンバスコンポーネント
 * 下層：Mermaid.js によるSVGレイヤー
 * 上層：Konva.js による手書きレイヤー
 */
export default function DiagramCanvas({
  width,
  height,
  initialMermaidCode = SAMPLE_MERMAID_CODE,
  strokeColor = "#3730a3",
  strokeWidth = 3,
  onStrokeComplete,
  onMermaidCodeChange,
}: DiagramCanvasProps) {
  const [mermaidCode, setMermaidCode] = useState(initialMermaidCode);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCode, setEditingCode] = useState(initialMermaidCode);

  /**
   * ストローク完了時のハンドラ
   */
  const handleStrokeComplete = useCallback(
    (stroke: Stroke) => {
      onStrokeComplete?.(stroke);
      // TODO: ストロークをAIに送信して図を更新
    },
    [onStrokeComplete]
  );

  /**
   * Mermaidコードの更新
   */
  const handleCodeUpdate = useCallback(() => {
    setMermaidCode(editingCode);
    setIsEditing(false);
    onMermaidCodeChange?.(editingCode);
  }, [editingCode, onMermaidCodeChange]);

  /**
   * 編集をキャンセル
   */
  const handleCancelEdit = useCallback(() => {
    setEditingCode(mermaidCode);
    setIsEditing(false);
  }, [mermaidCode]);

  return (
    <div className="flex flex-col gap-4">
      {/* ハイブリッドキャンバス */}
      <div
        className="relative overflow-hidden bg-white rounded-xl border border-gray-200"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        {/* 下層: Mermaid SVG レイヤー */}
        <div className="absolute inset-0 pointer-events-none">
          <DynamicMermaidPreview
            code={mermaidCode}
            width={width}
            height={height}
            id="diagram-preview"
          />
        </div>

        {/* 上層: 手書きレイヤー */}
        <div className="absolute inset-0">
          <DynamicHandwritingCanvas
            width={width}
            height={height}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            onStrokeComplete={handleStrokeComplete}
          />
        </div>

        {/* レイヤー切り替えインジケータ */}
        <div className="absolute bottom-3 right-3 flex gap-2 z-20">
          <div className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 bg-indigo-500 rounded-full" />
            手書きレイヤー
          </div>
          <div className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            Mermaid
          </div>
        </div>
      </div>

      {/* Mermaidコードエディタ */}
      <div className="bg-gray-900 rounded-xl p-4 text-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-300 font-medium flex items-center gap-2">
            <span>📝</span> Mermaidコード
          </h3>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCodeUpdate}
                  className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                >
                  適用
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
              >
                編集
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <textarea
            value={editingCode}
            onChange={(e) => setEditingCode(e.target.value)}
            className="w-full h-40 bg-gray-800 text-gray-100 font-mono text-xs p-3 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
            spellCheck={false}
          />
        ) : (
          <pre className="bg-gray-800 text-gray-100 font-mono text-xs p-3 rounded-lg overflow-x-auto">
            <code>{mermaidCode}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

