"use client";

import type Konva from "konva";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Layer, Line, Stage } from "react-konva";

/**
 * ストロークデータの型定義
 * 各ストロークは座標の配列と色、太さを持つ
 */
export type Stroke = {
  /** ストロークのユニークID */
  id: string;
  /** 座標データ [x1, y1, x2, y2, ...] */
  points: number[];
  /** ストロークの色 */
  color: string;
  /** ストロークの太さ */
  strokeWidth: number;
};

/**
 * ズーム・パン状態の型定義
 */
export type ViewTransform = {
  /** ズーム倍率 */
  scale: number;
  /** X方向のオフセット */
  x: number;
  /** Y方向のオフセット */
  y: number;
};

/**
 * HandwritingCanvasのref経由で呼び出せるメソッド
 */
export type HandwritingCanvasRef = {
  /** 現在のストロークを取得 */
  getStrokes: () => Stroke[];
  /** ストロークを設定 */
  setStrokes: (strokes: Stroke[]) => void;
  /** ストロークをクリア */
  clearStrokes: () => void;
  /** ストロークを画像としてエクスポート（Base64 PNG） */
  toDataURL: () => string | null;
  /** 現在のビュー変換状態を取得 */
  getViewTransform: () => ViewTransform;
  /** ビュー変換をリセット */
  resetViewTransform: () => void;
};

type HandwritingCanvasProps = {
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** ストロークの色 */
  strokeColor?: string;
  /** ストロークの太さ */
  strokeWidth?: number;
  /** 初期ストロークデータ */
  initialStrokes?: Stroke[];
  /** ストロークが追加されたときのコールバック */
  onStrokeComplete?: (stroke: Stroke) => void;
  /** ストロークデータが更新されたときのコールバック */
  onStrokesChange?: (strokes: Stroke[]) => void;
  /** ビュー変換が変更されたときのコールバック */
  onViewTransformChange?: (transform: ViewTransform) => void;
  /** 外部から制御するビュー変換 */
  viewTransform?: ViewTransform;
};

/** ズームの最小・最大値 */
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
/** ズーム時のステップ倍率 */
const ZOOM_STEP = 1.15;

/**
 * 手書き入力用のCanvasコンポーネント
 * Konva.jsを使用してスムーズな手書き体験を提供
 * ズーム・パン操作に対応
 */
const HandwritingCanvas = forwardRef<
  HandwritingCanvasRef,
  HandwritingCanvasProps
>(function HandwritingCanvas(
  {
    width,
    height,
    strokeColor = "#1a1a2e",
    strokeWidth = 3,
    initialStrokes = [],
    onStrokeComplete,
    onStrokesChange,
    onViewTransformChange,
    viewTransform: externalViewTransform,
  },
  ref,
) {
  // 描画中のストローク
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  // 完了したストローク一覧
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  // 描画中フラグ
  const isDrawing = useRef(false);
  // パン中フラグ
  const isPanning = useRef(false);
  // スペースキー押下中フラグ
  const isSpacePressed = useRef(false);
  // Konvaステージへの参照
  const stageRef = useRef<Konva.Stage>(null);
  // コンテナへの参照
  const containerRef = useRef<HTMLDivElement>(null);

  // ビュー変換状態（内部管理）
  const [internalViewTransform, setInternalViewTransform] =
    useState<ViewTransform>({
      scale: 1,
      x: 0,
      y: 0,
    });

  // 外部から制御される場合は外部の値を使用
  const viewTransform = externalViewTransform ?? internalViewTransform;

  // ビュー変換を更新する関数
  const updateViewTransform = useCallback(
    (newTransform: ViewTransform) => {
      if (!externalViewTransform) {
        setInternalViewTransform(newTransform);
      }
      onViewTransformChange?.(newTransform);
    },
    [externalViewTransform, onViewTransformChange],
  );

  // 初期ストロークが変更されたら反映
  useEffect(() => {
    setStrokes(initialStrokes);
  }, [initialStrokes]);

  // スペースキーのイベントリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isSpacePressed.current) {
        isSpacePressed.current = true;
        if (containerRef.current) {
          containerRef.current.style.cursor = "grab";
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressed.current = false;
        if (containerRef.current) {
          containerRef.current.style.cursor = "crosshair";
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // refからアクセスできるメソッドを公開
  useImperativeHandle(
    ref,
    () => ({
      getStrokes: () => strokes,
      setStrokes: (newStrokes: Stroke[]) => {
        setStrokes(newStrokes);
        onStrokesChange?.(newStrokes);
      },
      clearStrokes: () => {
        setStrokes([]);
        setCurrentStroke([]);
        onStrokesChange?.([]);
      },
      toDataURL: () => {
        if (!stageRef.current) return null;
        return stageRef.current.toDataURL({ pixelRatio: 1 });
      },
      getViewTransform: () => viewTransform,
      resetViewTransform: () => {
        updateViewTransform({ scale: 1, x: 0, y: 0 });
      },
    }),
    [strokes, onStrokesChange, viewTransform, updateViewTransform],
  );

  /**
   * ユニークなIDを生成
   */
  const generateId = () =>
    `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  /**
   * ポインター座標をキャンバス座標に変換（ズーム・パン考慮）
   */
  const getTransformedPointerPosition = useCallback(
    (stage: Konva.Stage): { x: number; y: number } | null => {
      const pos = stage.getPointerPosition();
      if (!pos) return null;

      // ズーム・パンを考慮して座標を変換
      return {
        x: (pos.x - viewTransform.x) / viewTransform.scale,
        y: (pos.y - viewTransform.y) / viewTransform.scale,
      };
    },
    [viewTransform],
  );

  /**
   * 描画開始
   */
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      // ミドルクリックまたはスペース押下中はパンモード
      const nativeEvent = e.evt as MouseEvent;
      if (nativeEvent.button === 1 || isSpacePressed.current) {
        isPanning.current = true;
        if (containerRef.current) {
          containerRef.current.style.cursor = "grabbing";
        }
        return;
      }

      // 通常の描画
      isDrawing.current = true;
      const pos = getTransformedPointerPosition(stage);
      if (pos) {
        setCurrentStroke([pos.x, pos.y]);
      }
    },
    [getTransformedPointerPosition],
  );

  /**
   * 描画中 / パン中
   */
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      // パンモード
      if (isPanning.current) {
        const nativeEvent = e.evt as MouseEvent | TouchEvent;
        let movementX = 0;
        let movementY = 0;

        if ("movementX" in nativeEvent) {
          movementX = nativeEvent.movementX;
          movementY = nativeEvent.movementY;
        }

        updateViewTransform({
          ...viewTransform,
          x: viewTransform.x + movementX,
          y: viewTransform.y + movementY,
        });
        return;
      }

      // 描画モード
      if (!isDrawing.current) return;

      const pos = getTransformedPointerPosition(stage);
      if (pos) {
        setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
      }
    },
    [getTransformedPointerPosition, viewTransform, updateViewTransform],
  );

  /**
   * 描画終了 / パン終了
   */
  const handleMouseUp = useCallback(() => {
    // パン終了
    if (isPanning.current) {
      isPanning.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor = isSpacePressed.current
          ? "grab"
          : "crosshair";
      }
      return;
    }

    // 描画終了
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (currentStroke.length >= 4) {
      const newStroke: Stroke = {
        id: generateId(),
        points: currentStroke,
        color: strokeColor,
        strokeWidth,
      };

      const updatedStrokes = [...strokes, newStroke];
      setStrokes(updatedStrokes);

      // コールバックを呼び出し
      onStrokeComplete?.(newStroke);
      onStrokesChange?.(updatedStrokes);
    }

    setCurrentStroke([]);
  }, [
    currentStroke,
    strokeColor,
    strokeWidth,
    strokes,
    onStrokeComplete,
    onStrokesChange,
  ]);

  /**
   * ホイールでズーム
   */
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = e.target.getStage();
      if (!stage) return;

      const oldScale = viewTransform.scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // ズームイン/アウト
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, oldScale * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)),
      );

      // ポインター位置を中心にズーム
      const mousePointTo = {
        x: (pointer.x - viewTransform.x) / oldScale,
        y: (pointer.y - viewTransform.y) / oldScale,
      };

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };

      updateViewTransform({
        scale: newScale,
        x: newPos.x,
        y: newPos.y,
      });
    },
    [viewTransform, updateViewTransform],
  );

  /**
   * ズームイン
   */
  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(MAX_SCALE, viewTransform.scale * ZOOM_STEP);
    // キャンバス中央を基準にズーム
    const centerX = width / 2;
    const centerY = height / 2;

    const mousePointTo = {
      x: (centerX - viewTransform.x) / viewTransform.scale,
      y: (centerY - viewTransform.y) / viewTransform.scale,
    };

    updateViewTransform({
      scale: newScale,
      x: centerX - mousePointTo.x * newScale,
      y: centerY - mousePointTo.y * newScale,
    });
  }, [viewTransform, updateViewTransform, width, height]);

  /**
   * ズームアウト
   */
  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(MIN_SCALE, viewTransform.scale / ZOOM_STEP);
    // キャンバス中央を基準にズーム
    const centerX = width / 2;
    const centerY = height / 2;

    const mousePointTo = {
      x: (centerX - viewTransform.x) / viewTransform.scale,
      y: (centerY - viewTransform.y) / viewTransform.scale,
    };

    updateViewTransform({
      scale: newScale,
      x: centerX - mousePointTo.x * newScale,
      y: centerY - mousePointTo.y * newScale,
    });
  }, [viewTransform, updateViewTransform, width, height]);

  /**
   * ズームをリセット
   */
  const handleZoomReset = useCallback(() => {
    updateViewTransform({ scale: 1, x: 0, y: 0 });
  }, [updateViewTransform]);

  /**
   * 全ストロークをクリア
   */
  const clearCanvas = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    onStrokesChange?.([]);
  }, [onStrokesChange]);

  /**
   * 最後のストロークを取り消し（Undo）
   */
  const undoLastStroke = useCallback(() => {
    if (strokes.length === 0) return;
    const updatedStrokes = strokes.slice(0, -1);
    setStrokes(updatedStrokes);
    onStrokesChange?.(updatedStrokes);
  }, [strokes, onStrokesChange]);

  // ズーム倍率の表示用
  const zoomPercentage = Math.round(viewTransform.scale * 100);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: "transparent",
      }}
    >
      {/* ツールバー */}
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={undoLastStroke}
          disabled={strokes.length === 0}
          className="px-3 py-1.5 text-sm bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="元に戻す (Undo)"
        >
          ↶ 戻す
        </button>
        <button
          type="button"
          onClick={clearCanvas}
          disabled={strokes.length === 0}
          className="px-3 py-1.5 text-sm bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="全てクリア"
        >
          🗑 クリア
        </button>
      </div>

      {/* ズームコントロール */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={viewTransform.scale <= MIN_SCALE}
          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-l-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="ズームアウト"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleZoomReset}
          className="px-2 h-8 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors min-w-[50px]"
          title="リセット (100%)"
        >
          {zoomPercentage}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={viewTransform.scale >= MAX_SCALE}
          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-r-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="ズームイン"
        >
          +
        </button>
      </div>

      {/* パン操作ヒント */}
      <div className="absolute bottom-3 right-3 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
        🖱 ホイール: ズーム / Space+ドラッグ: 移動
      </div>

      {/* キャンバス */}
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={viewTransform.scale}
        scaleY={viewTransform.scale}
        x={viewTransform.x}
        y={viewTransform.y}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
        className="cursor-crosshair touch-none"
      >
        <Layer>
          {/* 完了したストローク */}
          {strokes.map((stroke) => (
            <Line
              key={stroke.id}
              points={stroke.points}
              stroke={stroke.color}
              strokeWidth={stroke.strokeWidth}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="source-over"
            />
          ))}
          {/* 描画中のストローク */}
          {currentStroke.length >= 4 && (
            <Line
              points={currentStroke}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="source-over"
            />
          )}
        </Layer>
      </Stage>

      {/* ストローク数の表示 */}
      <div className="absolute bottom-3 left-3 text-xs text-gray-400">
        {strokes.length} ストローク
      </div>
    </div>
  );
});

export default HandwritingCanvas;
