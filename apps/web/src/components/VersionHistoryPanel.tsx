"use client";

import { trpc } from "@/lib/trpc/client";
import { useCallback, useState } from "react";

type VersionHistoryPanelProps = {
  /** プロジェクトID */
  projectId: string;
  /** パネルの表示/非表示 */
  isOpen: boolean;
  /** パネルを閉じる */
  onClose: () => void;
  /** ロールバック完了時のコールバック */
  onRollbackComplete?: () => void;
};

/**
 * 更新タイプに応じたアイコンを返す
 */
function getUpdateTypeIcon(updateType: string): string {
  switch (updateType) {
    case "initial":
      return "🆕";
    case "handwriting":
      return "✏️";
    case "chat":
      return "🤖";
    default:
      return "📝";
  }
}

/**
 * 更新タイプのラベル
 */
function getUpdateTypeLabel(updateType: string): string {
  switch (updateType) {
    case "initial":
      return "作成";
    case "handwriting":
      return "手書き";
    case "chat":
      return "AI";
    default:
      return updateType;
  }
}

/**
 * 日時をフォーマット
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * バージョン履歴パネルコンポーネント
 * プロジェクトのバージョン履歴を表示し、ロールバックを実行できる
 */
export default function VersionHistoryPanel({
  projectId,
  isOpen,
  onClose,
  onRollbackComplete,
}: VersionHistoryPanelProps) {
  // 選択中のバージョン（プレビュー用）
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(
    null,
  );
  // ロールバック確認ダイアログ
  const [confirmingRollback, setConfirmingRollback] = useState<number | null>(
    null,
  );

  // バージョン履歴を取得
  const {
    data: versions,
    isLoading,
    refetch,
  } = trpc.diagram.getVersionHistory.useQuery(
    { projectId },
    { enabled: isOpen && !!projectId },
  );

  // 選択中のバージョンの詳細を取得
  const { data: selectedVersion, isLoading: isLoadingVersion } =
    trpc.diagram.getVersion.useQuery(
      { projectId, versionId: selectedVersionId ?? 0 },
      { enabled: !!selectedVersionId },
    );

  // ロールバックmutation
  const rollbackMutation = trpc.diagram.rollbackToVersion.useMutation({
    onSuccess: () => {
      setConfirmingRollback(null);
      setSelectedVersionId(null);
      refetch();
      onRollbackComplete?.();
    },
  });

  /**
   * バージョンを選択
   */
  const handleSelectVersion = useCallback((versionId: number) => {
    setSelectedVersionId((prev) => (prev === versionId ? null : versionId));
    setConfirmingRollback(null);
  }, []);

  /**
   * ロールバックを実行
   */
  const handleRollback = useCallback(() => {
    if (!confirmingRollback) return;
    rollbackMutation.mutate({
      projectId,
      versionId: confirmingRollback,
    });
  }, [confirmingRollback, projectId, rollbackMutation]);

  if (!isOpen) return null;

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col shrink-0 text-slate-100">
      {/* ヘッダー */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📜</span>
          <h2 className="text-sm font-semibold">バージョン履歴</h2>
          {versions && (
            <span className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
              {versions.length}件
            </span>
          )}
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

      {/* バージョン一覧 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : versions && versions.length > 0 ? (
          <ul className="divide-y divide-slate-700">
            {versions.map((version, index) => {
              const isLatest = index === 0;
              const isSelected = selectedVersionId === version.id;
              const isConfirming = confirmingRollback === version.id;

              return (
                <li key={version.id}>
                  {/* バージョン項目 */}
                  <button
                    type="button"
                    onClick={() => handleSelectVersion(version.id)}
                    className={`w-full p-3 text-left transition-colors ${
                      isSelected
                        ? "bg-violet-900/50"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {getUpdateTypeIcon(version.updateType)}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-200">
                              v{version.versionNumber}
                            </span>
                            {isLatest && (
                              <span className="text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                                最新
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {getUpdateTypeLabel(version.updateType)}・
                            {formatDate(version.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs transition-transform ${
                          isSelected ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                    </div>

                    {/* 変更理由 */}
                    {version.reason && (
                      <p className="mt-2 text-xs text-slate-400 line-clamp-2">
                        {version.reason}
                      </p>
                    )}
                  </button>

                  {/* 展開時の詳細 */}
                  {isSelected && (
                    <div className="px-3 pb-3 bg-slate-800/30">
                      {/* Mermaidコードプレビュー */}
                      <div className="mb-3">
                        <p className="text-xs text-slate-500 mb-1">
                          Mermaidコード:
                        </p>
                        <pre className="p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto max-h-32 overflow-y-auto">
                          {isLoadingVersion
                            ? "読み込み中..."
                            : selectedVersion?.mermaidCode ||
                              version.mermaidCode}
                        </pre>
                      </div>

                      {/* ロールバックボタン（最新以外に表示） */}
                      {!isLatest && (
                        <div className="flex flex-col gap-2">
                          {isConfirming ? (
                            <>
                              <p className="text-xs text-amber-400">
                                ⚠️ この状態に戻しますか？
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleRollback}
                                  disabled={rollbackMutation.isPending}
                                  className="flex-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                                >
                                  {rollbackMutation.isPending
                                    ? "処理中..."
                                    : "確定"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingRollback(null)}
                                  disabled={rollbackMutation.isPending}
                                  className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
                                >
                                  キャンセル
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmingRollback(version.id)
                              }
                              className="w-full px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded transition-colors flex items-center justify-center gap-1"
                            >
                              <span>⏪</span>
                              この状態に戻す
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-slate-500">
            <span className="text-3xl mb-2 opacity-50">📜</span>
            <p className="text-xs text-center">
              履歴がありません
            </p>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
        <p>
          ロールバックすると、選択したバージョンの
          <br />
          状態を新しいバージョンとして復元します
        </p>
      </div>
    </aside>
  );
}

