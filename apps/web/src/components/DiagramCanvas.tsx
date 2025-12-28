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
   * Mermaidコードから現在の方向を取得
   */
  const getCurrentDirection = useCallback((): "TD" | "LR" => {
    const match = mermaidCode.match(/^flowchart\s+(TD|LR|RL|BT)/i);
    if (match?.[1]) {
      const dir = match[1].toUpperCase();
      // TDとBTは縦方向、LRとRLは横方向として扱う
      return dir === "TD" || dir === "BT" ? "TD" : "LR";
    }
    return "TD"; // デフォルトは縦方向
  }, [mermaidCode]);

  /**
   * フローチャートの方向を変更
   */
  const changeDirection = useCallback(
    (newDirection: "TD" | "LR") => {
      const currentDir = getCurrentDirection();
      if (currentDir === newDirection) return;

      // flowchart TD または flowchart LR を置換
      const updatedCode = mermaidCode.replace(
        /^flowchart\s+(TD|LR|RL|BT)/i,
        `flowchart ${newDirection}`,
      );

      setMermaidCode(updatedCode);
      setHasUnsavedChanges(true);
    },
    [mermaidCode, getCurrentDirection],
  );

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
   * ズーム・パン操作を考慮して、ビューポート全体をキャプチャ
   */
  const generateCanvasImage = useCallback(async (): Promise<string | null> => {
    try {
      // Mermaid SVGを取得
      const svgElement = mermaidContainerRef.current?.querySelector("svg");
      if (!svgElement) return null;

      // コンテナの実際のサイズを取得
      const containerRect =
        mermaidContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return null;

      // Canvasを作成（ビューポート全体をカバー）
      const canvas = document.createElement("canvas");
      canvas.width = actualSize.width;
      canvas.height = actualSize.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // 白背景を描画
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // SVGをBase64 Data URLに変換（Tainted Canvas問題を回避）
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

      // SVGにxmlns属性を確保
      if (!svgClone.getAttribute("xmlns")) {
        svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }

      // SVGの元のサイズを取得（viewBoxまたはwidth/height属性から）
      const svgViewBox = svgClone.getAttribute("viewBox");
      let svgWidth = 0;
      let svgHeight = 0;

      if (svgViewBox) {
        const viewBoxValues = svgViewBox.split(/\s+/).map(Number);
        if (viewBoxValues.length >= 4) {
          svgWidth = viewBoxValues[2] ?? 0;
          svgHeight = viewBoxValues[3] ?? 0;
        }
      }

      if (svgWidth === 0 || svgHeight === 0) {
        // viewBoxがない場合はwidth/height属性から取得
        const widthAttr = svgClone.getAttribute("width");
        const heightAttr = svgClone.getAttribute("height");
        if (widthAttr && heightAttr) {
          svgWidth = Number.parseFloat(widthAttr) || 0;
          svgHeight = Number.parseFloat(heightAttr) || 0;
        } else {
          // それでも取得できない場合はgetBoundingClientRectから取得
          const svgRect = svgElement.getBoundingClientRect();
          svgWidth = svgRect.width / viewTransform.scale;
          svgHeight = svgRect.height / viewTransform.scale;
        }
      }

      // SVGの実際の描画サイズ（ズームを考慮）
      const scaledSvgWidth = svgWidth * viewTransform.scale;
      const scaledSvgHeight = svgHeight * viewTransform.scale;

      // SVGの描画位置を計算（パンを考慮）
      // viewTransformはコンテナの左上を基準としたオフセット
      const svgDrawX = viewTransform.x;
      const svgDrawY = viewTransform.y;

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
      const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // SVGを正しい位置とサイズで描画（ズーム・パンを考慮）
          ctx.drawImage(
            img,
            svgDrawX,
            svgDrawY,
            scaledSvgWidth,
            scaledSvgHeight,
          );
          resolve();
        };
        img.onerror = (e) => {
          console.error("SVG画像の読み込みエラー:", e);
          reject(new Error("SVG画像の読み込みに失敗"));
        };
        img.src = svgDataUrl;
      });

      // ストロークを直接Canvasに描画（viewTransformを考慮）
      // ストロークの座標はビューポート座標系（元の座標系）で保存されているため、
      // viewTransformを適用して画面座標に変換する必要がある
      if (strokes.length > 0) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const stroke of strokes) {
          ctx.strokeStyle = stroke.color;
          // ストロークの太さもscaleを考慮
          ctx.lineWidth = stroke.strokeWidth * viewTransform.scale;
          ctx.beginPath();

          const points = stroke.points;
          if (points.length >= 2) {
            const firstX = points[0];
            const firstY = points[1];
            if (firstX !== undefined && firstY !== undefined) {
              // ビューポート座標を画面座標に変換
              const screenX = firstX * viewTransform.scale + viewTransform.x;
              const screenY = firstY * viewTransform.scale + viewTransform.y;
              ctx.moveTo(screenX, screenY);

              for (let i = 2; i < points.length; i += 2) {
                const x = points[i];
                const y = points[i + 1];
                if (x !== undefined && y !== undefined) {
                  // ビューポート座標を画面座標に変換
                  const screenX2 = x * viewTransform.scale + viewTransform.x;
                  const screenY2 = y * viewTransform.scale + viewTransform.y;
                  ctx.lineTo(screenX2, screenY2);
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
  }, [actualSize.width, actualSize.height, strokes, viewTransform]);

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
          {/* 方向切り替えボタン（フローチャートの場合のみ表示） */}
          {mermaidCode.trim().toLowerCase().startsWith("flowchart") && (
            <div className="shrink-0 flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => changeDirection("TD")}
                className={`px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  getCurrentDirection() === "TD"
                    ? "bg-violet-100 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                title="縦方向（上から下）"
              >
                <span>↕️</span>縦
              </button>
              <div className="w-px h-4 bg-gray-200" />
              <button
                type="button"
                onClick={() => changeDirection("LR")}
                className={`px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  getCurrentDirection() === "LR"
                    ? "bg-violet-100 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                title="横方向（左から右）"
              >
                <span>↔️</span>横
              </button>
            </div>
          )}

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
          <div className="absolute top-16 left-3 z-30 w-[50vw] max-w-[800px] bg-white rounded-xl border border-violet-200 shadow-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="hint-input"
                className="text-xs font-medium text-violet-700 flex items-center gap-1.5"
              >
                <span>💡</span>
                補足説明（オプション）
              </label>
            </div>
            <textarea
              id="hint-input"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例: 上の四角はユーザー認証、矢印はデータの流れ..."
              rows={15}
              className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y min-h-[200px]"
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
