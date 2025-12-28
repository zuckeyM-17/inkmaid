import { getStrokeBounds } from "./strokeUtils";

/**
 * ノード位置情報の型
 */
export type NodePosition = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

/**
 * ストロークの型
 */
export type Stroke = {
  id: string;
  points: number[];
  color: string;
  strokeWidth: number;
};

/**
 * X印検出結果
 */
export type XMarkDetection = {
  isXMark: boolean;
  centerX: number;
  centerY: number;
  targetNodeId: string | null;
};

/**
 * 囲み線検出結果
 */
export type EnclosureDetection = {
  isEnclosure: boolean;
  strokeIndex: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
  };
  enclosedNodeIds: string[];
};

/**
 * 2本のストロークがX印（バツ）を形成しているか判定
 */
export function detectXMark(
  strokes: Stroke[],
  nodePositions?: NodePosition[],
): XMarkDetection | null {
  if (strokes.length < 2) return null;

  // 最後の2本のストロークをチェック
  const stroke1 = strokes[strokes.length - 2];
  const stroke2 = strokes[strokes.length - 1];

  if (!stroke1 || !stroke2) return null;

  const p1 = stroke1.points;
  const p2 = stroke2.points;

  const bounds1 = getStrokeBounds(p1);
  const bounds2 = getStrokeBounds(p2);

  // 両ストロークが近い位置にあるか（中心が近い）
  const centerDist = Math.sqrt(
    (bounds1.centerX - bounds2.centerX) ** 2 +
      (bounds1.centerY - bounds2.centerY) ** 2,
  );

  // 両ストロークのサイズが似ているか
  const size1 = Math.max(
    bounds1.maxX - bounds1.minX,
    bounds1.maxY - bounds1.minY,
  );
  const size2 = Math.max(
    bounds2.maxX - bounds2.minX,
    bounds2.maxY - bounds2.minY,
  );
  const sizeDiff = Math.abs(size1 - size2) / Math.max(size1, size2);

  // X印の条件: 中心が近く（80px以内）、サイズが似ている（差が50%以内）
  if (centerDist < 80 && sizeDiff < 0.5) {
    // 線が交差する形状かチェック（対角線的な動き）
    const start1X = p1[0];
    const start1Y = p1[1];
    const end1X = p1[p1.length - 2];
    const end1Y = p1[p1.length - 1];
    const start2X = p2[0];
    const start2Y = p2[1];
    const end2X = p2[p2.length - 2];
    const end2Y = p2[p2.length - 1];

    if (
      start1X === undefined ||
      start1Y === undefined ||
      end1X === undefined ||
      end1Y === undefined ||
      start2X === undefined ||
      start2Y === undefined ||
      end2X === undefined ||
      end2Y === undefined
    ) {
      return null;
    }

    const start1 = { x: start1X, y: start1Y };
    const end1 = { x: end1X, y: end1Y };
    const start2 = { x: start2X, y: start2Y };
    const end2 = { x: end2X, y: end2Y };

    // 両方のストロークが斜め線か（開始点と終了点のX,Yが両方変化）
    const isDiagonal1 =
      Math.abs(end1.x - start1.x) > 20 && Math.abs(end1.y - start1.y) > 20;
    const isDiagonal2 =
      Math.abs(end2.x - start2.x) > 20 && Math.abs(end2.y - start2.y) > 20;

    if (isDiagonal1 && isDiagonal2) {
      // X印の中心座標
      const xCenter = (bounds1.centerX + bounds2.centerX) / 2;
      const yCenter = (bounds1.centerY + bounds2.centerY) / 2;

      // どのノードの上にあるか判定
      let targetNodeId: string | null = null;
      if (nodePositions && nodePositions.length > 0) {
        for (const node of nodePositions) {
          // X印の中心がノードの範囲内にあるか
          if (
            xCenter >= node.x - 20 &&
            xCenter <= node.x + node.width + 20 &&
            yCenter >= node.y - 20 &&
            yCenter <= node.y + node.height + 20
          ) {
            targetNodeId = node.id;
            break;
          }
        }
      }

      return {
        isXMark: true,
        centerX: xCenter,
        centerY: yCenter,
        targetNodeId,
      };
    }
  }

  return null;
}

/**
 * 囲み線（閉じた図形）を検出し、内部のノードを特定
 */
export function detectEnclosure(
  strokes: Stroke[],
  nodePositions?: NodePosition[],
): EnclosureDetection | null {
  // 各ストロークをチェック
  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    if (!stroke) continue;

    const points = stroke.points;
    if (points.length < 6) continue; // 最低3点必要

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
      continue;
    }

    // 閉じた図形かどうか（開始点と終了点が近い）
    const distanceToClose = Math.sqrt(
      (startX - endX) ** 2 + (startY - endY) ** 2,
    );

    // 閉じた図形の条件: 開始点と終了点が50px以内
    if (distanceToClose < 50) {
      const bounds = getStrokeBounds(points);
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;

      // 囲み線として有効な最小サイズ（100x100px以上）
      if (width < 100 || height < 100) {
        continue;
      }

      // 点が多角形内にあるか判定する関数（Ray Casting Algorithm）
      const isPointInPolygon = (
        px: number,
        py: number,
        polygonPoints: number[],
      ): boolean => {
        let inside = false;
        for (let j = 0; j < polygonPoints.length - 2; j += 2) {
          const x1 = polygonPoints[j];
          const y1 = polygonPoints[j + 1];
          const x2 = polygonPoints[j + 2];
          const y2 = polygonPoints[j + 3];

          if (
            x1 === undefined ||
            y1 === undefined ||
            x2 === undefined ||
            y2 === undefined
          ) {
            continue;
          }

          const intersect =
            y1 > py !== y2 > py &&
            px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1;
          if (intersect) {
            inside = !inside;
          }
        }
        return inside;
      };

      // 囲み線内に含まれるノードを特定
      const enclosedNodeIds: string[] = [];
      if (nodePositions && nodePositions.length > 0) {
        for (const node of nodePositions) {
          // ノードの中心点が囲み線内にあるかチェック
          if (isPointInPolygon(node.centerX, node.centerY, points)) {
            enclosedNodeIds.push(node.id);
          }
        }
      }

      // 囲み線として有効（内部にノードが1つ以上ある）
      if (enclosedNodeIds.length > 0) {
        return {
          isEnclosure: true,
          strokeIndex: i,
          bounds,
          enclosedNodeIds,
        };
      }
    }
  }

  return null;
}
