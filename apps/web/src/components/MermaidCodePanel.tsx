"use client";

type MermaidCodePanelProps = {
  /** Mermaidコード */
  mermaidCode: string;
  /** パネルの表示/非表示 */
  isOpen: boolean;
  /** パネルを閉じる */
  onClose: () => void;
};

/**
 * Mermaidコードを表示するパネルコンポーネント
 * 全画面モード時にキャンバスの前面に表示される
 */
export default function MermaidCodePanel({
  mermaidCode,
  isOpen,
  onClose,
}: MermaidCodePanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[80vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col m-4">
        {/* ヘッダー */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h2 className="text-sm font-semibold text-slate-100">
              Mermaidコード
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-lg"
            title="閉じる"
          >
            ×
          </button>
        </div>

        {/* コード表示エリア */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap break-words">
            {mermaidCode}
          </pre>
        </div>

        {/* フッター */}
        <div className="p-3 border-t border-slate-700 text-xs text-slate-500 shrink-0">
          <div className="flex items-center justify-between">
            <span>Mermaid Diagram Code</span>
            <span>{mermaidCode.length} chars</span>
          </div>
        </div>
      </div>
    </div>
  );
}
