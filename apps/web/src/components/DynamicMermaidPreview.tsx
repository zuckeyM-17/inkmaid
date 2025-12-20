"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type MermaidPreviewComponent from "./MermaidPreview";

/**
 * Mermaid.jsはSSR非対応のため、クライアントサイドでのみ読み込む
 */
const DynamicMermaidPreview = dynamic(() => import("./MermaidPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full">
      <div className="text-center text-gray-400">
        <span className="text-3xl mb-2 block animate-pulse">📊</span>
        <p className="text-sm">読み込み中...</p>
      </div>
    </div>
  ),
});

export default DynamicMermaidPreview;

export type MermaidPreviewProps = ComponentProps<typeof MermaidPreviewComponent>;

