import type { Stroke } from "@/components/HandwritingCanvas";
import { MULTI_STAGE_CONFIG } from "@/lib/config/multiStageProcessing";
import {
  estimateStrokeDataSize,
  getStrokeBounds,
} from "./strokeSimplification";

/**
 * ストロークを空間的にグリッド分割する
 *
 * @param strokes - ストローク配列
 * @param canvasSize - キャンバスサイズ
 * @param gridSize - グリッドサイズ（列数、行数）
 * @returns 領域ごとに分割されたストローク配列
 */
export function divideStrokesBySpace(
  strokes: Stroke[],
  canvasSize: { width: number; height: number },
  gridSize?: { cols: number; rows: number },
): Stroke[][] {
  const { GRID_COLS, GRID_ROWS, MIN_STROKES_PER_REGION } =
    MULTI_STAGE_CONFIG.SPATIAL_DIVISION;
  const cols = gridSize?.cols ?? GRID_COLS;
  const rows = gridSize?.rows ?? GRID_ROWS;

  // グリッドを初期化
  const grid: Stroke[][] = Array(cols * rows)
    .fill(null)
    .map(() => []);

  for (const stroke of strokes) {
    const bounds = getStrokeBounds(stroke.points);
    const centerX = bounds.centerX;
    const centerY = bounds.centerY;

    // グリッドのインデックスを計算
    const col = Math.min(
      Math.floor((centerX / canvasSize.width) * cols),
      cols - 1,
    );
    const row = Math.min(
      Math.floor((centerY / canvasSize.height) * rows),
      rows - 1,
    );
    const index = row * cols + col;

    grid[index]?.push(stroke);
  }

  // 最小ストローク数未満の領域を除外
  return grid.filter((group) => group.length >= MIN_STROKES_PER_REGION);
}

/**
 * ストロークをクラスタリングでグループ化する
 * 近接するストロークを同じグループに分類
 *
 * @param strokes - ストローク配列
 * @param distanceThreshold - 距離閾値（ピクセル）
 * @returns クラスタごとにグループ化されたストローク配列
 */
export function clusterStrokes(
  strokes: Stroke[],
  distanceThreshold?: number,
): Stroke[][] {
  const { DISTANCE_THRESHOLD, MIN_CLUSTER_SIZE } =
    MULTI_STAGE_CONFIG.CLUSTERING;
  const threshold = distanceThreshold ?? DISTANCE_THRESHOLD;

  if (strokes.length === 0) {
    return [];
  }

  // 各ストロークの中心座標を計算
  const centers = strokes.map((stroke) => {
    const bounds = getStrokeBounds(stroke.points);
    return {
      stroke,
      x: bounds.centerX,
      y: bounds.centerY,
      clusterId: -1,
    };
  });

  // クラスタリング（簡易版: 最近傍クラスタリング）
  let nextClusterId = 0;
  const clusters: Stroke[][] = [];

  for (const [index, center] of centers.entries()) {
    if (center.clusterId !== -1) {
      continue; // 既にクラスタに属している
    }

    // 新しいクラスタを作成
    center.clusterId = nextClusterId;
    const cluster: Stroke[] = [center.stroke];

    // 近接するストロークを同じクラスタに追加
    for (const [otherIndex, other] of centers.entries()) {
      if (otherIndex === index || other.clusterId !== -1) {
        continue;
      }

      const distance = Math.sqrt(
        (center.x - other.x) ** 2 + (center.y - other.y) ** 2,
      );

      if (distance <= threshold) {
        other.clusterId = nextClusterId;
        cluster.push(other.stroke);
      }
    }

    // 最小クラスタサイズ以上のクラスタのみを追加
    if (cluster.length >= MIN_CLUSTER_SIZE) {
      clusters.push(cluster);
      nextClusterId++;
    } else {
      // 最小サイズ未満の場合はクラスタIDをリセット
      for (const c of centers) {
        if (c.clusterId === nextClusterId) {
          c.clusterId = -1;
        }
      }
    }
  }

  // クラスタに属さないストロークを個別のクラスタとして追加
  for (const center of centers) {
    if (center.clusterId === -1) {
      clusters.push([center.stroke]);
    }
  }

  return clusters;
}

/**
 * ストロークを時間的順序で分割する
 * 描画順序（ストロークのインデックス）で分割
 *
 * @param strokes - ストローク配列
 * @param batchSize - 1バッチあたりのストローク数
 * @returns 時間順に分割されたストローク配列
 */
export function divideStrokesByTime(
  strokes: Stroke[],
  batchSize: number,
): Stroke[][] {
  const batches: Stroke[][] = [];

  for (let i = 0; i < strokes.length; i += batchSize) {
    batches.push(strokes.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * 残りのストロークを取得
 * Stage 1で処理済みのストロークを除外
 *
 * @param allStrokes - 全ストローク配列
 * @param processedIndices - 処理済みのストロークインデックス配列
 * @returns 残りのストローク配列
 */
export function getRemainingStrokes(
  allStrokes: Stroke[],
  processedIndices: number[],
): Stroke[] {
  return allStrokes.filter((_, index) => !processedIndices.includes(index));
}

/**
 * ストロークを最適な方法で分割する
 * データサイズとストローク数に応じて最適な分割方法を選択
 *
 * @param strokes - ストローク配列
 * @param canvasSize - キャンバスサイズ
 * @returns 分割されたストローク配列と分割方法
 */
export function divideStrokesOptimally(
  strokes: Stroke[],
  canvasSize: { width: number; height: number },
): {
  dividedStrokes: Stroke[][];
  method: "spatial" | "clustering" | "time";
} {
  const dataSize = estimateStrokeDataSize(strokes);

  // データサイズが非常に大きい場合は空間分割
  if (dataSize > MULTI_STAGE_CONFIG.THRESHOLD_SIZE_BYTES * 2) {
    const divided = divideStrokesBySpace(strokes, canvasSize);
    if (divided.length > 1) {
      return { dividedStrokes: divided, method: "spatial" };
    }
  }

  // ストローク数が多い場合はクラスタリング
  if (strokes.length > MULTI_STAGE_CONFIG.THRESHOLD_STROKE_COUNT * 2) {
    const clustered = clusterStrokes(strokes);
    if (clustered.length > 1) {
      return { dividedStrokes: clustered, method: "clustering" };
    }
  }

  // デフォルト: 時間的順序で分割
  const batchSize = Math.ceil(
    strokes.length / MULTI_STAGE_CONFIG.SPATIAL_DIVISION.GRID_COLS,
  );
  return {
    dividedStrokes: divideStrokesByTime(strokes, batchSize),
    method: "time",
  };
}
