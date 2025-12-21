"use client";

import mermaid from "mermaid";
import { useEffect, useRef, useState } from "react";

/**
 * MermaidのSVGからノードの位置情報を抽出する
 */
function extractNodePositions(
  svgElement: SVGSVGElement,
  container: HTMLElement,
): NodePosition[] {
  const positions: NodePosition[] = [];

  // コンテナの位置を取得（相対座標計算用）
  const containerRect = container.getBoundingClientRect();
  const svgRect = svgElement.getBoundingClientRect();

  // SVGのviewBoxを考慮したスケール計算
  const viewBox = svgElement.viewBox.baseVal;
  const scaleX = svgRect.width / (viewBox.width || svgRect.width);
  const scaleY = svgRect.height / (viewBox.height || svgRect.height);

  // SVGのオフセット（コンテナ内でのSVGの位置）
  const svgOffsetX = svgRect.left - containerRect.left;
  const svgOffsetY = svgRect.top - containerRect.top;

  // .node クラスを持つ要素（フローチャートのノード）を取得
  const nodeElements = svgElement.querySelectorAll(".node");

  for (const node of nodeElements) {
    try {
      // ノードのIDを取得（flowchart-nodeId-xxx 形式）
      const fullId = node.id || "";
      // flowchart-A-0 → A のように抽出
      const idMatch = fullId.match(/flowchart-([^-]+)-/);
      const nodeId = idMatch ? idMatch[1] : fullId;

      // ラベルテキストを取得
      const labelElement = node.querySelector(
        ".nodeLabel, text, foreignObject",
      );
      const label = labelElement?.textContent?.trim() || nodeId;

      // ノードのbounding boxを取得
      const nodeRect = node.getBoundingClientRect();

      // コンテナ内の相対座標に変換
      const x = nodeRect.left - containerRect.left;
      const y = nodeRect.top - containerRect.top;
      const nodeWidth = nodeRect.width;
      const nodeHeight = nodeRect.height;

      positions.push({
        id: nodeId,
        label,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(nodeWidth),
        height: Math.round(nodeHeight),
        centerX: Math.round(x + nodeWidth / 2),
        centerY: Math.round(y + nodeHeight / 2),
      });
    } catch (err) {
      console.warn("ノード位置の抽出に失敗:", err);
    }
  }

  return positions;
}

/** ノードの位置情報 */
export type NodePosition = {
  /** ノードのID（Mermaidコード内のID） */
  id: string;
  /** ノードのラベルテキスト */
  label: string;
  /** 左上のX座標 */
  x: number;
  /** 左上のY座標 */
  y: number;
  /** ノードの幅 */
  width: number;
  /** ノードの高さ */
  height: number;
  /** 中心X座標 */
  centerX: number;
  /** 中心Y座標 */
  centerY: number;
};

type MermaidPreviewProps = {
  /** Mermaidコード */
  code: string;
  /** キャンバスの幅 */
  width: number;
  /** キャンバスの高さ */
  height: number;
  /** ユニークID（複数のプレビューを区別するため） */
  id?: string;
  /** パースエラー時のコールバック */
  onParseError?: (error: string, code: string) => void;
  /** レンダリング成功時のコールバック（ノード位置情報付き） */
  onRenderSuccess?: (nodePositions: NodePosition[]) => void;
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
  onParseError,
  onRenderSuccess,
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
          const errorMsg = "Mermaidコードの構文が無効です";
          setError(errorMsg);
          onParseError?.(errorMsg, code);
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

            // ノードの位置情報を抽出
            const nodePositions = extractNodePositions(
              svgElement,
              containerRef.current,
            );

            // レンダリング成功を通知（ノード位置情報付き）
            onRenderSuccess?.(nodePositions);
          }
        }
      } catch (err) {
        console.error("Mermaid レンダリングエラー:", err);
        const errorMsg =
          err instanceof Error ? err.message : "レンダリングに失敗しました";
        setError(errorMsg);
        onParseError?.(errorMsg, code);
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
