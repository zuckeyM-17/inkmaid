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
  // タッチ中フラグ（範囲選択を防ぐため）
  const isTouching = useRef(false);
  // 最後のタッチ位置（パン用）
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  // ピンチズーム用の状態
  const pinchState = useRef<{
    initialDistance: number;
    initialScale: number;
    initialCenter: { x: number; y: number };
    initialTransform: ViewTransform;
  } | null>(null);
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

  // キャンバスサイズが変更されたときにviewTransformをリセット
  // リサイズ時にストロークがずれるのを防ぐ
  // biome-ignore lint/correctness/useExhaustiveDependencies: width/heightはpropsであり、変更時にリセットが必要
  useEffect(() => {
    if (!externalViewTransform) {
      setInternalViewTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [width, height, externalViewTransform]);

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
  const generateId = useCallback(
    () => `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

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
   * 2本指の距離を計算
   */
  const getTouchDistance = useCallback(
    (touch1: Touch, touch2: Touch): number => {
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },
    [],
  );

  /**
   * 2本指の中点を計算
   */
  const getTouchCenter = useCallback(
    (touch1: Touch, touch2: Touch): { x: number; y: number } => {
      return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
    },
    [],
  );

  /**
   * 描画開始（マウス）
   */
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
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
   * タッチ開始（タッチデバイス専用）
   * 範囲選択などのデフォルト動作を防ぐ
   */
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      // デフォルト動作を防ぐ（範囲選択など）
      e.evt.preventDefault();

      const stage = e.target.getStage();
      if (!stage) return;

      // タッチ中フラグを設定
      isTouching.current = true;

      // 2本指の場合はピンチズームモード
      if (e.evt.touches.length === 2) {
        const touch1 = e.evt.touches[0];
        const touch2 = e.evt.touches[1];
        if (!touch1 || !touch2) return;

        // 描画を中断
        if (isDrawing.current) {
          isDrawing.current = false;
          setCurrentStroke([]);
        }

        // ピンチズームの初期状態を記録
        const distance = getTouchDistance(touch1, touch2);
        const center = getTouchCenter(touch1, touch2);

        pinchState.current = {
          initialDistance: distance,
          initialScale: viewTransform.scale,
          initialCenter: center,
          initialTransform: { ...viewTransform },
        };
        return;
      }

      // 1本指の場合は描画
      if (e.evt.touches.length === 1) {
        // ピンチズームを終了
        pinchState.current = null;

        // 描画開始
        isDrawing.current = true;
        const pos = getTransformedPointerPosition(stage);
        if (pos) {
          setCurrentStroke([pos.x, pos.y]);
          const touch = e.evt.touches[0];
          if (touch) {
            lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
          }
        }
      }
    },
    [
      getTransformedPointerPosition,
      getTouchDistance,
      getTouchCenter,
      viewTransform,
    ],
  );

  /**
   * 描画中 / パン中（マウス）
   */
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      // パンモード
      if (isPanning.current) {
        const nativeEvent = e.evt as MouseEvent;
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
   * タッチ移動（タッチデバイス専用）
   * 範囲選択などのデフォルト動作を防ぐ
   */
  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      // デフォルト動作を防ぐ（範囲選択、スクロールなど）
      e.evt.preventDefault();

      const stage = e.target.getStage();
      if (!stage) return;

      // 2本指の場合はピンチズーム
      if (e.evt.touches.length === 2 && pinchState.current) {
        const touch1 = e.evt.touches[0];
        const touch2 = e.evt.touches[1];
        if (!touch1 || !touch2) return;

        const currentDistance = getTouchDistance(touch1, touch2);
        const currentCenter = getTouchCenter(touch1, touch2);

        // 距離の変化からスケールを計算
        const scaleRatio = currentDistance / pinchState.current.initialDistance;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchState.current.initialScale * scaleRatio),
        );

        // 中心点の移動を計算（パン）
        const centerDeltaX =
          currentCenter.x - pinchState.current.initialCenter.x;
        const centerDeltaY =
          currentCenter.y - pinchState.current.initialCenter.y;

        // ピンチズームの中心点を基準にズーム
        // 初期状態での中心点のキャンバス座標を計算
        const initialCenterOnCanvas = {
          x:
            (pinchState.current.initialCenter.x -
              pinchState.current.initialTransform.x) /
            pinchState.current.initialScale,
          y:
            (pinchState.current.initialCenter.y -
              pinchState.current.initialTransform.y) /
            pinchState.current.initialScale,
        };

        // 新しいスケールでの中心点の位置を計算
        const newCenterX =
          initialCenterOnCanvas.x * newScale +
          pinchState.current.initialTransform.x;
        const newCenterY =
          initialCenterOnCanvas.y * newScale +
          pinchState.current.initialTransform.y;

        // ズームとパンを適用（中心点を基準にズームし、中心点の移動でパン）
        updateViewTransform({
          scale: newScale,
          x:
            pinchState.current.initialTransform.x +
            centerDeltaX +
            (pinchState.current.initialCenter.x - newCenterX),
          y:
            pinchState.current.initialTransform.y +
            centerDeltaY +
            (pinchState.current.initialCenter.y - newCenterY),
        });
        return;
      }

      // 1本指の場合は描画
      if (e.evt.touches.length === 1 && isDrawing.current) {
        const touch = e.evt.touches[0];
        if (!touch) return;

        const pos = getTransformedPointerPosition(stage);
        if (pos) {
          setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
          lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        }
      }
    },
    [
      getTransformedPointerPosition,
      getTouchDistance,
      getTouchCenter,
      updateViewTransform,
    ],
  );

  /**
   * 描画終了 / パン終了（マウス）
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
    generateId,
  ]);

  /**
   * タッチ終了（タッチデバイス専用）
   * 範囲選択などのデフォルト動作を防ぐ
   */
  const handleTouchEnd = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      // デフォルト動作を防ぐ
      e.evt.preventDefault();

      // 2本指から1本指になった場合、ピンチズームを終了
      if (e.evt.touches.length === 1 && pinchState.current) {
        pinchState.current = null;
        // 1本指が残っている場合は描画モードに切り替え
        const touch = e.evt.touches[0];
        if (touch) {
          const stage = e.target.getStage();
          if (stage) {
            isDrawing.current = true;
            const pos = getTransformedPointerPosition(stage);
            if (pos) {
              setCurrentStroke([pos.x, pos.y]);
              lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
            }
          }
        }
        return;
      }

      // 全てのタッチが終了した場合
      if (e.evt.touches.length === 0) {
        // タッチ中フラグを解除
        isTouching.current = false;
        lastTouchPos.current = null;
        pinchState.current = null;

        // 描画終了
        if (isDrawing.current) {
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
        }
      }
    },
    [
      currentStroke,
      strokeColor,
      strokeWidth,
      strokes,
      onStrokeComplete,
      onStrokesChange,
      generateId,
      getTransformedPointerPosition,
    ],
  );

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
        Math.max(
          MIN_SCALE,
          oldScale * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
        ),
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
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ツールバー */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className="flex gap-2">
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
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-sm">
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        className="cursor-crosshair"
        style={{ touchAction: "none" }}
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
