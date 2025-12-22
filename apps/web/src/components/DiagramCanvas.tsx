"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DynamicHandwritingCanvas from "./DynamicHandwritingCanvas";
import DynamicMermaidPreview from "./DynamicMermaidPreview";
import type { Stroke } from "./HandwritingCanvas";
import type { NodePosition } from "./MermaidPreview";

/** AIで変換時に渡すデータ */
export type ConvertWithAIData = {
  mermaidCode: string;
  strokes: Stroke[];
  nodePositions: NodePosition[];
  /** キャンバスの画像（Base64 PNG） */
  canvasImage?: string;
  hint?: string;
};

type DiagramCanvasProps = {
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** 初期のMermaidコード */
  initialMermaidCode?: string;
  /** 初期のストロークデータ */
  initialStrokes?: Stroke[];
  /** ストロークの色 */
  strokeColor?: string;
  /** ストロークの太さ */
  strokeWidth?: number;
  /** 保存中かどうか */
  isSaving?: boolean;
  /** AI変換中かどうか */
  isConverting?: boolean;
  /** エラー修正中かどうか */
  isFixingError?: boolean;
  /** Mermaidコードが更新されたときのコールバック */
  onMermaidCodeChange?: (code: string) => void;
  /** 保存ボタンが押されたときのコールバック */
  onSave?: (data: { mermaidCode: string; strokes: Stroke[] }) => void;
  /** AIで変換ボタンが押されたときのコールバック（ノード位置情報付き） */
  onConvertWithAI?: (data: ConvertWithAIData) => void;
  /** Mermaidパースエラー時のコールバック */
  onMermaidParseError?: (error: string, code: string) => void;
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
  initialStrokes = [],
  strokeColor = "#3730a3",
  strokeWidth = 3,
  isSaving = false,
  isConverting = false,
  isFixingError = false,
  onMermaidCodeChange,
  onSave,
  onConvertWithAI,
  onMermaidParseError,
}: DiagramCanvasProps) {
  const [mermaidCode, setMermaidCode] = useState(initialMermaidCode);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCode, setEditingCode] = useState(initialMermaidCode);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hint, setHint] = useState("");
  const [showHintInput, setShowHintInput] = useState(false);

  // refs
  const mermaidContainerRef = useRef<HTMLDivElement>(null);

  /**
   * initialMermaidCodeが外部から変更された場合に内部状態を同期
   * 画面遷移後にAPIからデータが取得された場合などに対応
   */
  useEffect(() => {
    setMermaidCode(initialMermaidCode);
    setEditingCode(initialMermaidCode);
  }, [initialMermaidCode]);

  /**
   * initialStrokesが外部から変更された場合に内部状態を同期
   */
  useEffect(() => {
    setStrokes(initialStrokes);
  }, [initialStrokes]);

  /**
   * Mermaidレンダリング成功時のハンドラ（ノード位置情報を保存）
   */
  const handleRenderSuccess = useCallback((positions: NodePosition[]) => {
    setNodePositions(positions);
  }, []);

  /**
   * ストロークが変更されたときのハンドラ
   */
  const handleStrokesChange = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
    setHasUnsavedChanges(true);
  }, []);

  /**
   * Mermaidコードの更新
   */
  const handleCodeUpdate = useCallback(() => {
    setMermaidCode(editingCode);
    setIsEditing(false);
    setHasUnsavedChanges(true);
    onMermaidCodeChange?.(editingCode);
  }, [editingCode, onMermaidCodeChange]);

  /**
   * 編集をキャンセル
   */
  const handleCancelEdit = useCallback(() => {
    setEditingCode(mermaidCode);
    setIsEditing(false);
  }, [mermaidCode]);

  /**
   * 保存ボタンのハンドラ
   */
  const handleSave = useCallback(() => {
    onSave?.({ mermaidCode, strokes });
    setHasUnsavedChanges(false);
  }, [mermaidCode, strokes, onSave]);

  /**
   * MermaidのSVGとストロークを合成した画像を生成
   */
  const generateCanvasImage = useCallback(async (): Promise<string | null> => {
    try {
      // Mermaid SVGを取得
      const svgElement = mermaidContainerRef.current?.querySelector("svg");
      if (!svgElement) return null;

      // Canvasを作成
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // 白背景を描画
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);

      // SVGをBase64 Data URLに変換（Tainted Canvas問題を回避）
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

      // SVGにxmlns属性を確保
      if (!svgClone.getAttribute("xmlns")) {
        svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // SVGをキャンバスの中央に配置
          const svgRect = svgElement.getBoundingClientRect();
          const containerRect =
            mermaidContainerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const offsetX = svgRect.left - containerRect.left;
            const offsetY = svgRect.top - containerRect.top;
            ctx.drawImage(img, offsetX, offsetY, svgRect.width, svgRect.height);
          } else {
            ctx.drawImage(img, 0, 0);
          }
          resolve();
        };
        img.onerror = (e) => {
          console.error("SVG画像の読み込みエラー:", e);
          reject(new Error("SVG画像の読み込みに失敗"));
        };
        img.src = svgDataUrl;
      });

      // ストロークを直接Canvasに描画
      if (strokes.length > 0) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const stroke of strokes) {
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.strokeWidth;
          ctx.beginPath();

          const points = stroke.points;
          if (points.length >= 2) {
            ctx.moveTo(points[0], points[1]);
            for (let i = 2; i < points.length; i += 2) {
              ctx.lineTo(points[i], points[i + 1]);
            }
            ctx.stroke();
          }
        }
      }

      return canvas.toDataURL("image/png");
    } catch (error) {
      console.error("キャンバス画像の生成に失敗:", error);
      return null;
    }
  }, [width, height, strokes]);

  /**
   * AIで変換ボタンのハンドラ（ノード位置情報付き、画像付き）
   */
  const handleConvertWithAI = useCallback(async () => {
    // キャンバス画像を生成
    const canvasImage = await generateCanvasImage();

    onConvertWithAI?.({
      mermaidCode,
      strokes,
      nodePositions,
      canvasImage: canvasImage || undefined,
      hint: hint || undefined,
    });
    setShowHintInput(false);
    setHint("");
  }, [
    mermaidCode,
    strokes,
    nodePositions,
    hint,
    onConvertWithAI,
    generateCanvasImage,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* メインツールバー */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span>✍️</span> 手書きキャンバス
          </h3>
          <div className="text-xs text-gray-400">
            図形を描いて「AIで変換」をクリック
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AIで変換ボタン */}
          <button
            type="button"
            onClick={() =>
              strokes.length > 0
                ? showHintInput
                  ? handleConvertWithAI()
                  : setShowHintInput(true)
                : undefined
            }
            disabled={isConverting || strokes.length === 0}
            className="px-4 py-2 text-sm bg-linear-to-r from-violet-600 to-fuchsia-600 text-white font-medium rounded-lg hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md shadow-violet-200"
          >
            {isConverting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                変換中...
              </>
            ) : (
              <>🪄 AIで変換</>
            )}
          </button>

          {/* 保存ボタン */}
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>💾 保存</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ヒント入力（オプション） */}
      {showHintInput && (
        <div className="bg-violet-50 rounded-xl border border-violet-200 p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label
              htmlFor="hint-input"
              className="block text-xs font-medium text-violet-700 mb-1.5"
            >
              💡 補足説明（オプション）
            </label>
            <input
              id="hint-input"
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例: 上の四角はユーザー認証、矢印はデータの流れ..."
              className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              onKeyDown={(e) => e.key === "Enter" && handleConvertWithAI()}
            />
          </div>
          <button
            type="button"
            onClick={handleConvertWithAI}
            disabled={isConverting}
            className="px-4 py-2 text-sm bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all"
          >
            変換実行
          </button>
          <button
            type="button"
            onClick={() => {
              setShowHintInput(false);
              setHint("");
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* ハイブリッドキャンバス */}
      <div
        className="relative overflow-hidden bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-violet-300 transition-colors"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        {/* 下層: Mermaid SVG レイヤー */}
        <div
          ref={mermaidContainerRef}
          className="absolute inset-0 pointer-events-none"
        >
          <DynamicMermaidPreview
            code={mermaidCode}
            width={width}
            height={height}
            id="diagram-preview"
            onParseError={onMermaidParseError}
            onRenderSuccess={handleRenderSuccess}
          />
        </div>

        {/* 上層: 手書きレイヤー */}
        <div className="absolute inset-0">
          <DynamicHandwritingCanvas
            width={width}
            height={height}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            initialStrokes={initialStrokes}
            onStrokesChange={handleStrokesChange}
          />
        </div>

        {/* ストローク数インジケータ */}
        <div className="absolute bottom-3 left-3 z-20">
          <div
            className={`px-3 py-1.5 text-xs rounded-full flex items-center gap-1.5 ${
              strokes.length > 0
                ? "bg-violet-100 text-violet-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${strokes.length > 0 ? "bg-violet-500" : "bg-gray-400"}`}
            />
            {strokes.length} ストローク
          </div>
        </div>

        {/* レイヤーインジケータ */}
        <div className="absolute bottom-3 right-3 flex gap-2 z-20">
          <div className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            Mermaid
          </div>
        </div>

        {/* 未保存の変更インジケータ */}
        {hasUnsavedChanges && (
          <div className="absolute top-3 left-3 z-20">
            <div className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              未保存
            </div>
          </div>
        )}

        {/* 変換中オーバーレイ */}
        {/* 変換中オーバーレイ */}
        {isConverting && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-violet-700 font-medium">AIが解析中...</p>
              <p className="text-xs text-gray-500 mt-1">
                手書きをMermaidに変換しています
              </p>
            </div>
          </div>
        )}

        {/* エラー修正中オーバーレイ */}
        {isFixingError && (
          <div className="absolute inset-0 bg-amber-50/90 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-amber-700 font-medium">
                構文エラーを修正中...
              </p>
              <p className="text-xs text-gray-500 mt-1">
                AIが自動でコードを修正しています
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mermaidコードエディタ（折りたたみ） */}
      <details className="bg-gray-900 rounded-xl overflow-hidden">
        <summary className="p-4 text-sm cursor-pointer hover:bg-gray-800 transition-colors">
          <span className="text-gray-300 font-medium flex items-center gap-2">
            <span>📝</span> Mermaidコード
            <span className="text-xs text-gray-500 ml-2">
              （クリックで展開）
            </span>
          </span>
        </summary>
        <div className="p-4 pt-0">
          <div className="flex items-center justify-end mb-3 gap-2">
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

          {isEditing ? (
            <textarea
              value={editingCode}
              onChange={(e) => setEditingCode(e.target.value)}
              className="w-full h-40 bg-gray-800 text-gray-100 font-mono text-xs p-3 rounded-lg border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
              spellCheck={false}
            />
          ) : (
            <pre className="bg-gray-800 text-gray-100 font-mono text-xs p-3 rounded-lg overflow-x-auto max-h-40">
              <code>{mermaidCode}</code>
            </pre>
          )}
        </div>
      </details>
    </div>
  );
}
