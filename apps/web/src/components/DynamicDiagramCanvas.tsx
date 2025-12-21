"use client";

import dynamic from "next/dynamic";

/**
 * DiagramCanvasはKonva.js（SSR非対応）を含むため、クライアントサイドでのみ読み込む
 */
const DynamicDiagramCanvas = dynamic(() => import("./DiagramCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 w-full bg-gray-50 rounded-xl border border-gray-200">
      <div className="text-center text-gray-400">
        <span className="text-4xl mb-2 block animate-pulse">✍️</span>
        <p className="text-sm">キャンバスを読み込み中...</p>
      </div>
    </div>
  ),
});

export default DynamicDiagramCanvas;
