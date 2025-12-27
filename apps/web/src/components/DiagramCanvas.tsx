"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DynamicHandwritingCanvas from "./DynamicHandwritingCanvas";
import DynamicMermaidPreview from "./DynamicMermaidPreview";
import type { Stroke, ViewTransform } from "./HandwritingCanvas";
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
 * 両レイヤーは同期したズーム・パン操作が可能
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
  onSave,
  onConvertWithAI,
  onMermaidParseError,
}: DiagramCanvasProps) {
  const [mermaidCode, setMermaidCode] = useState(initialMermaidCode);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hint, setHint] = useState("");
  const [showHintInput, setShowHintInput] = useState(false);

  // ズーム・パン状態（両レイヤーで共有）
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    scale: 1,
    x: 0,
    y: 0,
  });

  // refs
  const mermaidContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualSize, setActualSize] = useState({ width, height });

  // 親要素のサイズを監視して実際のサイズを更新
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setActualSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    // 初回サイズ設定
    updateSize();

    // リサイズ監視
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // ウィンドウリサイズも監視
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  /**
   * キャンバスサイズが変更されたときにviewTransformをリセット
   * サイドバーの開閉などでサイズが変わった場合に座標ズレを防ぐ
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: width/heightはpropsであり、変更時にリセットが必要
  useEffect(() => {
    setViewTransform({ scale: 1, x: 0, y: 0 });
  }, [width, height]);

  /**
   * initialMermaidCodeが外部から変更された場合に内部状態を同期
   * 画面遷移後にAPIからデータが取得された場合などに対応
   */
  useEffect(() => {
    setMermaidCode(initialMermaidCode);
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
   * ビュー変換が変更されたときのハンドラ
   */
  const handleViewTransformChange = useCallback(
    (newTransform: ViewTransform) => {
      setViewTransform(newTransform);
    },
    [],
  );

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
            const firstX = points[0];
            const firstY = points[1];
            if (firstX !== undefined && firstY !== undefined) {
              ctx.moveTo(firstX, firstY);
              for (let i = 2; i < points.length; i += 2) {
                const x = points[i];
                const y = points[i + 1];
                if (x !== undefined && y !== undefined) {
                  ctx.lineTo(x, y);
                }
              }
              ctx.stroke();
            }
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

  // Mermaidレイヤーに適用するCSS transform
  const mermaidTransformStyle = {
    transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
    transformOrigin: "0 0",
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden bg-white"
    >
      {/* ハイブリッドキャンバス */}
      <div className="absolute inset-0 overflow-hidden">
        {/* 下層: Mermaid SVG レイヤー（ズーム・パン同期） */}
        <div
          ref={mermaidContainerRef}
          className="absolute inset-0 pointer-events-none"
          style={mermaidTransformStyle}
        >
          <DynamicMermaidPreview
            code={mermaidCode}
            width={actualSize.width}
            height={actualSize.height}
            id="diagram-preview"
            onParseError={onMermaidParseError}
            onRenderSuccess={handleRenderSuccess}
          />
        </div>

        {/* 上層: 手書きレイヤー */}
        <div className="absolute inset-0">
          <DynamicHandwritingCanvas
            width={actualSize.width}
            height={actualSize.height}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            initialStrokes={initialStrokes}
            onStrokesChange={handleStrokesChange}
            viewTransform={viewTransform}
            onViewTransformChange={handleViewTransformChange}
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

        {/* ツールバー（左上） */}
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHintInput(!showHintInput)}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
              showHintInput
                ? "bg-violet-100 text-violet-700 border border-violet-200"
                : "bg-white/90 backdrop-blur border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
            title="補足説明を追加"
          >
            <span>💡</span>
            補足説明
          </button>

          {/* AIで変換ボタン */}
          <button
            type="button"
            onClick={handleConvertWithAI}
            disabled={isConverting || strokes.length === 0}
            className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-md shadow-violet-200"
          >
            {isConverting ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                変換中...
              </>
            ) : (
              <>
                <span>🪄</span>
                AIで変換
              </>
            )}
          </button>

          {/* 保存ボタン */}
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-lg bg-white/90 backdrop-blur border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <span className="w-3 h-3 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <span>💾</span>
                  保存
                </>
              )}
            </button>
          )}
        </div>

        {/* 補足説明入力エリア（オーバーレイ） */}
        {showHintInput && (
          <div className="absolute top-16 left-3 z-30 w-96 bg-white rounded-xl border border-violet-200 shadow-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="hint-input"
                className="text-xs font-medium text-violet-700 flex items-center gap-1.5"
              >
                <span>💡</span>
                補足説明（オプション）
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowHintInput(false);
                  setHint("");
                }}
                className="text-gray-400 hover:text-gray-600 text-lg"
                title="閉じる"
              >
                ×
              </button>
            </div>
            <textarea
              id="hint-input"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例: 上の四角はユーザー認証、矢印はデータの流れ..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowHintInput(false);
                  setHint("");
                }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConvertWithAI}
                disabled={isConverting}
                className="px-4 py-1.5 text-xs bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all"
              >
                変換実行
              </button>
            </div>
          </div>
        )}

        {/* レイヤーインジケータ */}
        <div className="absolute bottom-3 right-3 flex gap-2 z-20">
          <div className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            Mermaid
          </div>
        </div>

        {/* 未保存の変更インジケータ */}
        {hasUnsavedChanges && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <div className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              未保存
            </div>
          </div>
        )}

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
    </div>
  );
}
