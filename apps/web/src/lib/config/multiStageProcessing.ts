/**
 * 多段階処理の設定パラメータ
 */
export const MULTI_STAGE_CONFIG = {
  // 判定閾値
  /** 多段階処理を使用するストローク数の閾値 */
  THRESHOLD_STROKE_COUNT: 50,
  /** 多段階処理を使用するデータサイズの閾値（バイト） */
  THRESHOLD_SIZE_BYTES: 900 * 1024, // 900KB

  // Stage 1設定（全体構造の把握）
  /** Stage 1での簡略化の許容誤差（ピクセル） */
  STAGE1_SIMPLIFICATION_TOLERANCE: 3.0,
  /** Stage 1でのストロークあたりの最大points数 */
  STAGE1_MAX_POINTS_PER_STROKE: 300,

  // Stage 2設定（詳細の追加）
  /** Stage 2での簡略化の許容誤差（ピクセル） */
  STAGE2_SIMPLIFICATION_TOLERANCE: 2.0,
  /** Stage 2でのストロークあたりの最大points数 */
  STAGE2_MAX_POINTS_PER_STROKE: 500,

  // 空間分割設定
  SPATIAL_DIVISION: {
    /** グリッドの列数 */
    GRID_COLS: 3,
    /** グリッドの行数 */
    GRID_ROWS: 3,
    /** 領域あたりの最小ストローク数 */
    MIN_STROKES_PER_REGION: 5,
  },

  // クラスタリング設定
  CLUSTERING: {
    /** クラスタリングの距離閾値（ピクセル） */
    DISTANCE_THRESHOLD: 100,
    /** 最小クラスタサイズ */
    MIN_CLUSTER_SIZE: 3,
  },
} as const;
