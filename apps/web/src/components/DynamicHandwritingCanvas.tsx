"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type HandwritingCanvasComponent from "./HandwritingCanvas";

/**
 * SSR対応のHandwritingCanvasラッパー
 * Konva.jsはSSR非対応のため、クライアントサイドでのみ読み込む
 */
const DynamicHandwritingCanvas = dynamic(() => import("./HandwritingCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-gray-50 rounded-xl animate-pulse">
      <span className="text-gray-400">キャンバスを読み込み中...</span>
    </div>
  ),
});

export type HandwritingCanvasProps = ComponentProps<
  typeof HandwritingCanvasComponent
>;

export default DynamicHandwritingCanvas;
