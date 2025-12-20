"use client";

import { useCallback, useRef, useState } from "react";
import { Stage, Layer, Line } from "react-konva";
import type Konva from "konva";

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

type HandwritingCanvasProps = {
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** ストロークの色 */
  strokeColor?: string;
  /** ストロークの太さ */
  strokeWidth?: number;
  /** ストロークが追加されたときのコールバック */
  onStrokeComplete?: (stroke: Stroke) => void;
  /** ストロークデータが更新されたときのコールバック */
  onStrokesChange?: (strokes: Stroke[]) => void;
};

/**
 * 手書き入力用のCanvasコンポーネント
 * Konva.jsを使用してスムーズな手書き体験を提供
 */
export default function HandwritingCanvas({
  width,
  height,
  strokeColor = "#1a1a2e",
  strokeWidth = 3,
  onStrokeComplete,
  onStrokesChange,
}: HandwritingCanvasProps) {
  // 描画中のストローク
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  // 完了したストローク一覧
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  // 描画中フラグ
  const isDrawing = useRef(false);

  /**
   * ユニークなIDを生成
   */
  const generateId = () => `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  /**
   * 描画開始
   */
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      isDrawing.current = true;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (pos) {
        setCurrentStroke([pos.x, pos.y]);
      }
    },
    []
  );

  /**
   * 描画中
   */
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawing.current) return;

      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (pos) {
        setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
      }
    },
    []
  );

  /**
   * 描画終了
   */
  const handleMouseUp = useCallback(() => {
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
  }, [currentStroke, strokeColor, strokeWidth, strokes, onStrokeComplete, onStrokesChange]);

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

  return (
    <div
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

      {/* キャンバス */}
      <Stage
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
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
}

