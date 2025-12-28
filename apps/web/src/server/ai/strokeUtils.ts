/**
 * ストロークのバウンディングボックスを計算
 */
export function getStrokeBounds(points: number[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x !== undefined && y !== undefined) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * ストロークデータを解析用のテキストに変換
 */
export function formatStrokeDescriptions(
  strokes: Array<{ id: string; points: number[] }>,
): string {
  return strokes
    .map((stroke, index) => {
      const points = stroke.points;
      const numPoints = points.length / 2;
      const startX = points[0];
      const startY = points[1];
      const endX = points[points.length - 2];
      const endY = points[points.length - 1];

      if (
        startX === undefined ||
        startY === undefined ||
        endX === undefined ||
        endY === undefined
      ) {
        return `ストローク${index + 1}: 無効なデータ`;
      }

      // バウンディングボックスを計算
      const { minX, maxX, minY, maxY, centerX, centerY } =
        getStrokeBounds(points);
      const width = maxX - minX;
      const height = maxY - minY;

      // 閉じた図形かどうか
      const isClosed =
        Math.sqrt((startX - endX) ** 2 + (startY - endY) ** 2) < 50;

      // アスペクト比
      const aspectRatio = width / (height || 1);

      return `ストローク${index + 1}:
  - 点数: ${numPoints}
  - 範囲: (${Math.round(minX)}, ${Math.round(minY)}) ～ (${Math.round(maxX)}, ${Math.round(maxY)})
  - 中心: (${Math.round(centerX)}, ${Math.round(centerY)})
  - サイズ: ${Math.round(width)} x ${Math.round(height)}
  - 閉じた形状: ${isClosed ? "はい" : "いいえ"}
  - アスペクト比: ${aspectRatio.toFixed(2)}`;
    })
    .join("\n\n");
}

/**
 * ノード位置情報をテキストに変換
 */
export function formatNodePositions(
  nodePositions?: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }>,
): string {
  return nodePositions && nodePositions.length > 0
    ? nodePositions
        .map(
          (node) =>
            `- ノード「${node.label}」(ID: ${node.id}): 位置=(${node.x}, ${node.y}), サイズ=${node.width}x${node.height}, 中心=(${node.centerX}, ${node.centerY})`,
        )
        .join("\n")
    : "（ノード位置情報なし）";
}
