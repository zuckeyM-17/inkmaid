"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

type MermaidPreviewProps = {
  /** Mermaidコード */
  code: string;
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** ユニークID（複数のプレビューを区別するため） */
  id?: string;
};

/**
 * Mermaid.js を使用してダイアグラムをSVGとしてレンダリングするコンポーネント
 * ハイブリッドキャンバスの下層レイヤーとして機能する
 */
export default function MermaidPreview({
  code,
  width,
  height,
  id = "mermaid-preview",
}: MermaidPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Mermaid の初期化
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: "basis",
      },
    });
    setIsInitialized(true);
  }, []);

  // ダイアグラムのレンダリング
  useEffect(() => {
    if (!isInitialized || !containerRef.current || !code.trim()) {
      return;
    }

    const renderDiagram = async () => {
      try {
        setError(null);
        const uniqueId = `${id}-${Date.now()}`;

        // Mermaidコードの構文チェック
        const isValid = await mermaid.parse(code);
        if (!isValid) {
          setError("Mermaidコードの構文が無効です");
          return;
        }

        // SVGをレンダリング
        const { svg } = await mermaid.render(uniqueId, code);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;

          // SVG要素のスタイルを調整
          const svgElement = containerRef.current.querySelector("svg");
          if (svgElement) {
            svgElement.style.maxWidth = "100%";
            svgElement.style.maxHeight = "100%";
          }
        }
      } catch (err) {
        console.error("Mermaid レンダリングエラー:", err);
        setError(err instanceof Error ? err.message : "レンダリングに失敗しました");
      }
    };

    renderDiagram();
  }, [code, id, isInitialized]);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* エラー表示 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50/80 rounded-lg">
          <div className="text-center p-4">
            <span className="text-3xl mb-2 block">⚠️</span>
            <p className="text-sm text-red-600 font-medium">構文エラー</p>
            <p className="text-xs text-red-500 mt-1 max-w-xs">{error}</p>
          </div>
        </div>
      )}

      {/* コードが空の場合のプレースホルダー */}
      {!code.trim() && !error && (
        <div className="text-center text-gray-400">
          <span className="text-4xl mb-2 block opacity-50">📊</span>
          <p className="text-sm">ダイアグラムがここに表示されます</p>
        </div>
      )}

      {/* Mermaid SVG のコンテナ */}
      <div
        ref={containerRef}
        className="mermaid-container"
        style={{
          display: code.trim() && !error ? "flex" : "none",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

