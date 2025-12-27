import type { Stroke } from "@/components/HandwritingCanvas";

/**
 * ストロークのpointsを簡略化する（形状を保ちつつデータ量を削減）
 * Douglas-Peuckerアルゴリズムの簡易版を使用
 *
 * @param points - 元のpoints配列 [x1, y1, x2, y2, ...]
 * @param tolerance - 許容誤差（ピクセル単位、デフォルト: 2.0）
 * @returns 簡略化されたpoints配列
 */
export function simplifyStrokePoints(
  points: number[],
  tolerance = 2.0,
): number[] {
  if (points.length < 6) {
    // 3点未満の場合はそのまま返す
    return points;
  }

  // 2点間の距離を計算
  const distance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };

  // 点から線分への距離を計算
  const pointToLineDistance = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx: number;
    let yy: number;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 簡略化されたpointsを格納する配列
  const simplified: number[] = [];

  // 最初の点は必ず含める
  simplified.push(points[0]!, points[1]!);

  let lastIndex = 0;

  // 連続する点をチェックして、許容誤差内の点をスキップ
  for (let i = 2; i < points.length - 2; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const lastX = points[lastIndex]!;
    const lastY = points[lastIndex + 1]!;
    const nextX = points[i + 2];
    const nextY = points[i + 3];

    if (
      x === undefined ||
      y === undefined ||
      nextX === undefined ||
      nextY === undefined
    ) {
      continue;
    }

    // 前の点との距離が許容誤差より大きい場合、または角度が大きい場合は含める
    const dist = distance(lastX, lastY, x, y);
    const angleDistance = pointToLineDistance(x, y, lastX, lastY, nextX, nextY);

    if (dist > tolerance || angleDistance > tolerance) {
      simplified.push(x, y);
      lastIndex = i;
    }
  }

  // 最後の点は必ず含める
  const lastX = points[points.length - 2];
  const lastY = points[points.length - 1];
  if (lastX !== undefined && lastY !== undefined) {
    simplified.push(lastX, lastY);
  }

  return simplified;
}

/**
 * ストロークの配列を簡略化する
 *
 * @param strokes - 元のストローク配列
 * @param tolerance - 許容誤差（ピクセル単位、デフォルト: 2.0）
 * @param maxPointsPerStroke - ストロークあたりの最大points数（デフォルト: 500）
 * @returns 簡略化されたストローク配列
 */
export function simplifyStrokes(
  strokes: Stroke[],
  tolerance = 2.0,
  maxPointsPerStroke = 500,
): Stroke[] {
  return strokes.map((stroke) => {
    let simplifiedPoints = simplifyStrokePoints(stroke.points, tolerance);

    // 最大points数を超える場合は、さらに間引く
    if (simplifiedPoints.length > maxPointsPerStroke * 2) {
      const step = Math.ceil(
        simplifiedPoints.length / (maxPointsPerStroke * 2),
      );
      const sampled: number[] = [];
      for (let i = 0; i < simplifiedPoints.length; i += step * 2) {
        const x = simplifiedPoints[i];
        const y = simplifiedPoints[i + 1];
        if (x !== undefined && y !== undefined) {
          sampled.push(x, y);
        }
      }
      // 最後の点を確実に含める
      const lastX = simplifiedPoints[simplifiedPoints.length - 2];
      const lastY = simplifiedPoints[simplifiedPoints.length - 1];
      if (
        lastX !== undefined &&
        lastY !== undefined &&
        (sampled[sampled.length - 2] !== lastX ||
          sampled[sampled.length - 1] !== lastY)
      ) {
        sampled.push(lastX, lastY);
      }
      simplifiedPoints = sampled;
    }

    return {
      ...stroke,
      points: simplifiedPoints,
    };
  });
}

/**
 * ストロークデータのサイズを推定する（バイト単位）
 *
 * @param strokes - ストローク配列
 * @returns 推定サイズ（バイト）
 */
export function estimateStrokeDataSize(strokes: Stroke[]): number {
  // JSON文字列化した場合のサイズを推定
  const jsonString = JSON.stringify(strokes);
  return new Blob([jsonString]).size;
}

/**
 * ストロークデータが大きすぎるかチェック
 *
 * @param strokes - ストローク配列
 * @param maxSizeBytes - 最大サイズ（バイト、デフォルト: 900KB）
 * @returns 大きすぎる場合true
 */
export function isStrokeDataTooLarge(
  strokes: Stroke[],
  maxSizeBytes: number = 900 * 1024, // 900KB（Next.jsのデフォルト制限は1MB）
): boolean {
  const size = estimateStrokeDataSize(strokes);
  return size > maxSizeBytes;
}
