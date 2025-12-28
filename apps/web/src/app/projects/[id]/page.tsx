"use client";

import AIThinkingPanel from "@/components/AIThinkingPanel";
import type { ConvertWithAIData } from "@/components/DiagramCanvas";
import DynamicDiagramCanvas from "@/components/DynamicDiagramCanvas";
import type { Stroke } from "@/components/HandwritingCanvas";
import MermaidCodePanel from "@/components/MermaidCodePanel";
import VersionHistoryPanel from "@/components/VersionHistoryPanel";
import { useMultiStageAIStream } from "@/lib/hooks/useMultiStageAIStream";
import { trpc } from "@/lib/trpc/client";
import { DIAGRAM_TYPE_INFO, type DiagramType } from "@/server/db/schema";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * プロジェクト詳細ページ
 * /projects/[id] でアクセス
 */
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // 編集中のMermaidコード
  const [editingMermaidCode, setEditingMermaidCode] = useState<string>("");
  const [editingStrokes, setEditingStrokes] = useState<Stroke[]>([]);
  // DiagramCanvasを再マウントするためのキー
  const [canvasKey, setCanvasKey] = useState(0);
  // AI変換結果のフィードバック
  const [lastAiResult, setLastAiResult] = useState<string | null>(null);
  // エラーリトライ回数
  const [errorRetryCount, setErrorRetryCount] = useState(0);
  // 最大リトライ回数
  const MAX_RETRY_COUNT = 3;

  // AI思考パネルの表示状態
  const [showThinkingPanel, setShowThinkingPanel] = useState(false);

  // バージョン履歴パネルの表示状態
  const [showVersionPanel, setShowVersionPanel] = useState(false);

  // Mermaidコードパネルの表示状態
  const [showMermaidCodePanel, setShowMermaidCodePanel] = useState(false);

  // プロジェクト名の編集状態
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");

  // バージョンプレビュー状態
  const [_previewVersionId, setPreviewVersionId] = useState<number | null>(
    null,
  );
  const [previewMermaidCode, setPreviewMermaidCode] = useState<string | null>(
    null,
  );
  const [previewStrokes, setPreviewStrokes] = useState<Stroke[]>([]);

  // AIストリーミングフック（多段階処理対応）
  const aiStream = useMultiStageAIStream();

  // キャンバスコンテナのサイズ管理
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 600 });

  // コンテナサイズの監視
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      // 全画面モード時は画面全体を使用（ヘッダー分を除く）
      const headerHeight = 48; // h-12 = 48px
      const newWidth = Math.floor(window.innerWidth);
      const newHeight = Math.floor(window.innerHeight - headerHeight);
      setCanvasSize({ width: newWidth, height: newHeight });
    };

    // 初回サイズ設定
    updateSize();

    // リサイズ監視
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    // ウィンドウリサイズも監視
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // プロジェクト詳細（ストローク含む）を取得
  const {
    data: projectData,
    isLoading,
    error,
    refetch,
  } = trpc.diagram.getProjectWithStrokes.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // ダイアグラムとストロークを保存
  const saveDiagramWithStrokes =
    trpc.diagram.saveDiagramWithStrokes.useMutation({
      onSuccess: () => {
        refetch();
      },
    });

  // プロジェクト名を変更
  const renameProject = trpc.diagram.renameProject.useMutation({
    onSuccess: () => {
      setIsEditingName(false);
      refetch();
    },
  });

  // Stage 1完了時のコールバック（中間結果を反映）
  const handleStage1Complete = useCallback(
    (result: { mermaidCode: string; reason: string }) => {
      try {
        // Stage 1の結果を中間結果として反映
        setEditingMermaidCode(result.mermaidCode);
        setCanvasKey((prev) => prev + 1);
        setLastAiResult(
          `📊 全体構造を抽出しました（中間結果）: ${result.reason}`,
        );
      } catch (error) {
        console.error("handleStage1Complete でエラーが発生:", error);
        setLastAiResult(
          `エラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
        );
      }
    },
    [],
  );

  // ストローク解釈完了時のコールバック
  const handleStreamComplete = useCallback(
    (result: {
      mermaidCode: string | null;
      reason: string | null;
      thinking: string;
    }) => {
      try {
        if (result.mermaidCode) {
          setEditingMermaidCode(result.mermaidCode);
          setEditingStrokes([]); // 変換後はストロークをクリア
          setCanvasKey((prev) => prev + 1);
          setLastAiResult(
            `✅ 詳細を追加しました（最終結果）: ${result.reason || "変換が完了しました"}`,
          );

          // DBにも保存
          if (projectId) {
            saveDiagramWithStrokes.mutate({
              projectId,
              mermaidCode: result.mermaidCode,
              strokes: [],
              updateType: "handwriting",
              reason: result.reason || "手書きストロークからAIで変換",
            });
          }
        } else {
          setLastAiResult(
            "ストロークを解釈できませんでした。もう一度お試しください。",
          );
        }
      } catch (error) {
        console.error("handleStreamComplete でエラーが発生:", error);
        setLastAiResult(
          `エラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
        );
      }
    },
    [projectId, saveDiagramWithStrokes],
  );

  // Mermaidエラー修正API
  const fixMermaidError = trpc.ai.fixMermaidError.useMutation({
    onSuccess: (data) => {
      if (data.wasFixed && data.updatedMermaidCode) {
        setEditingMermaidCode(data.updatedMermaidCode);
        setCanvasKey((prev) => prev + 1);
        setLastAiResult(
          `🔧 エラーを修正しました（${data.retryCount}回目）: ${data.reasoning}`,
        );
        setErrorRetryCount(0); // リセット

        // DBにも保存
        if (projectId) {
          saveDiagramWithStrokes.mutate({
            projectId,
            mermaidCode: data.updatedMermaidCode,
            strokes: editingStrokes,
            updateType: "chat",
            reason: `エラー自動修正: ${data.reasoning}`,
          });
        }
      } else {
        setLastAiResult(
          "エラーを修正できませんでした。コードを手動で確認してください。",
        );
        setErrorRetryCount(0);
      }
    },
    onError: (error) => {
      setLastAiResult(`修正エラー: ${error.message}`);
      setErrorRetryCount(0);
    },
  });

  // プロジェクトデータが取得されたら編集状態を初期化
  useEffect(() => {
    if (projectData) {
      const code =
        projectData.latestVersion?.mermaidCode ?? "flowchart TD\n    A[Start]";
      const strokes = (projectData.strokes ?? []) as Stroke[];
      setEditingMermaidCode(code);
      setEditingStrokes(strokes);
      setLastAiResult(null);
    }
  }, [projectData]);

  /**
   * トップページに戻る
   */
  const handleBack = useCallback(() => {
    router.push("/");
  }, [router]);

  /**
   * プロジェクト名の編集を開始
   */
  const handleStartEditName = useCallback(() => {
    if (projectData) {
      setEditingName(projectData.name);
      setIsEditingName(true);
    }
  }, [projectData]);

  /**
   * プロジェクト名の編集を確定
   */
  const handleSaveName = useCallback(() => {
    const trimmedName = editingName.trim();
    if (!trimmedName || !projectId) {
      setIsEditingName(false);
      return;
    }

    renameProject.mutate({
      projectId,
      name: trimmedName,
    });
  }, [editingName, projectId, renameProject]);

  /**
   * プロジェクト名の編集をキャンセル
   */
  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setEditingName("");
  }, []);

  /**
   * 保存ボタンのハンドラ
   */
  const handleSave = useCallback(
    (data: { mermaidCode: string; strokes: Stroke[] }) => {
      if (!projectId) return;

      saveDiagramWithStrokes.mutate({
        projectId,
        mermaidCode: data.mermaidCode,
        strokes: data.strokes,
        updateType: "handwriting",
        reason: "手動保存",
      });

      setEditingMermaidCode(data.mermaidCode);
      setEditingStrokes(data.strokes);
    },
    [projectId, saveDiagramWithStrokes],
  );

  /**
   * AIで変換ボタンのハンドラ（ストリーミング対応）
   */
  const handleConvertWithAI = useCallback(
    (data: ConvertWithAIData) => {
      setLastAiResult(null);
      setErrorRetryCount(0);
      // AIストリーム開始時に思考パネルを自動的に開く
      setShowThinkingPanel(true);

      // ストリーミングAPIを呼び出し（多段階処理対応）
      aiStream.interpretStrokes(
        {
          strokes: data.strokes,
          currentMermaidCode: data.mermaidCode,
          nodePositions: data.nodePositions,
          canvasImage: data.canvasImage,
          hint: data.hint,
          diagramType: (projectData?.diagramType as DiagramType) ?? "flowchart",
          canvasSize: { width: canvasSize.width, height: canvasSize.height },
        },
        handleStreamComplete,
        handleStage1Complete,
      );
    },
    [
      aiStream,
      projectData?.diagramType,
      handleStreamComplete,
      handleStage1Complete,
      canvasSize,
    ],
  );

  /**
   * Mermaidパースエラー時のハンドラ（自動リトライ）
   */
  const handleMermaidParseError = useCallback(
    (error: string, brokenCode: string) => {
      // リトライ回数をチェック
      if (errorRetryCount >= MAX_RETRY_COUNT) {
        setLastAiResult(
          `❌ 自動修正に${MAX_RETRY_COUNT}回失敗しました。コードを手動で確認してください。\nエラー: ${error}`,
        );
        setErrorRetryCount(0);
        return;
      }

      // 自動修正を実行
      setLastAiResult(
        `⚠️ 構文エラーを検出: ${error}\n🔧 自動修正中... (${errorRetryCount + 1}/${MAX_RETRY_COUNT}回目)`,
      );
      setErrorRetryCount((prev) => prev + 1);

      fixMermaidError.mutate({
        brokenCode,
        errorMessage: error,
        retryCount: errorRetryCount,
      });
    },
    [errorRetryCount, fixMermaidError],
  );

  /**
   * バージョンプレビュー時のコールバック
   */
  const handleVersionPreview = useCallback(
    (data: {
      versionId: number;
      mermaidCode: string;
      strokes: Array<{ points: number[]; color: string; width: number }>;
    }) => {
      setPreviewVersionId(data.versionId);
      setPreviewMermaidCode(data.mermaidCode);
      setPreviewStrokes(
        data.strokes.map((s) => ({
          id: `preview-${Date.now()}-${Math.random()}`,
          points: s.points,
          color: s.color,
          strokeWidth: s.width,
        })),
      );
      setCanvasKey((prev) => prev + 1);
    },
    [],
  );

  /**
   * プレビューをキャンセル
   */
  const handlePreviewCancel = useCallback(() => {
    setPreviewVersionId(null);
    setPreviewMermaidCode(null);
    setPreviewStrokes([]);
    setCanvasKey((prev) => prev + 1);
  }, []);

  /**
   * ロールバック完了時のコールバック
   */
  const handleRollbackComplete = useCallback(() => {
    // ロールバック完了後にデータを再取得
    refetch();
    setCanvasKey((prev) => prev + 1);
    // プレビューを解除
    handlePreviewCancel();
  }, [refetch, handlePreviewCancel]);

  // ローディング中
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラーまたはプロジェクトが見つからない
  if (error || !projectData) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <span className="text-6xl mb-4 block">😕</span>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            プロジェクトが見つかりません
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            {error?.message ||
              "指定されたプロジェクトは存在しないか削除されました"}
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            トップに戻る
          </button>
        </div>
      </div>
    );
  }

  const diagramType = (projectData.diagramType || "flowchart") as DiagramType;
  const typeInfo = DIAGRAM_TYPE_INFO[diagramType];

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <header className="h-12 border-b border-gray-200 bg-white px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
              title="戻る"
            >
              ←
            </button>
            <span className="text-base">{typeInfo.icon}</span>

            {/* プロジェクト名（インライン編集対応） */}
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={(input) => input?.focus()}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") handleCancelEditName();
                  }}
                  className="text-sm font-semibold text-gray-800 border border-violet-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  disabled={renameProject.isPending}
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={renameProject.isPending}
                  className="text-emerald-600 hover:text-emerald-700 text-sm px-1"
                  title="保存"
                >
                  {renameProject.isPending ? "..." : "✓"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditName}
                  disabled={renameProject.isPending}
                  className="text-gray-400 hover:text-gray-600 text-sm px-1"
                  title="キャンセル"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditName}
                className="text-sm font-semibold text-gray-800 hover:text-violet-600 transition-colors group flex items-center gap-1"
                title="クリックして名前を編集"
              >
                {projectData.name}
                <span className="text-gray-300 group-hover:text-violet-400 text-xs">
                  ✎
                </span>
              </button>
            )}

            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              {typeInfo.label}
            </span>
          </div>

          {/* ヘッダー右側のボタン群 */}
          <div className="flex items-center gap-2">
            {/* Mermaidコードパネルトグル */}
            <button
              type="button"
              onClick={() => setShowMermaidCodePanel(!showMermaidCodePanel)}
              className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-all ${
                showMermaidCodePanel
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span>📝</span>
              コード
            </button>

            {/* バージョン履歴トグル */}
            <button
              type="button"
              onClick={() => setShowVersionPanel(!showVersionPanel)}
              className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-all ${
                showVersionPanel
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span>📜</span>
              履歴
            </button>

            {/* AI思考パネルトグル */}
            <button
              type="button"
              onClick={() => setShowThinkingPanel(!showThinkingPanel)}
              className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-all ${
                showThinkingPanel
                  ? "bg-violet-100 text-violet-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span>🧠</span>
              AI思考ログ
              {aiStream.isProcessing && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </header>

        {/* コンテンツエリア（全画面モード） */}
        <div ref={canvasContainerRef} className="flex-1 w-full h-full relative">
          <DynamicDiagramCanvas
            key={`${projectId}-${canvasKey}`}
            width={canvasSize.width}
            height={canvasSize.height}
            strokeColor="#7c3aed"
            strokeWidth={3}
            initialMermaidCode={previewMermaidCode ?? editingMermaidCode}
            initialStrokes={
              previewStrokes.length > 0 ? previewStrokes : editingStrokes
            }
            isSaving={saveDiagramWithStrokes.isPending}
            isConverting={aiStream.isProcessing}
            isFixingError={fixMermaidError.isPending}
            onSave={handleSave}
            onConvertWithAI={handleConvertWithAI}
            onMermaidParseError={handleMermaidParseError}
          />
        </div>
      </main>

      {/* Mermaidコードパネル（オーバーレイ） */}
      <MermaidCodePanel
        mermaidCode={previewMermaidCode ?? editingMermaidCode}
        isOpen={showMermaidCodePanel}
        onClose={() => setShowMermaidCodePanel(false)}
      />

      {/* バージョン履歴パネル（オーバーレイ） */}
      {showVersionPanel && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div
            className={`absolute top-12 h-[calc(100%-3rem)] pointer-events-auto shadow-2xl ${
              showThinkingPanel && showVersionPanel
                ? "right-[320px]"
                : "right-0"
            }`}
          >
            <VersionHistoryPanel
              projectId={projectId}
              isOpen={showVersionPanel}
              onClose={() => setShowVersionPanel(false)}
              onRollbackComplete={handleRollbackComplete}
              onVersionPreview={handleVersionPreview}
              onPreviewCancel={handlePreviewCancel}
            />
          </div>
        </div>
      )}

      {/* AI思考ログパネル（オーバーレイ） */}
      {showThinkingPanel && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute right-0 top-12 h-[calc(100%-3rem)] pointer-events-auto shadow-2xl">
            <AIThinkingPanel
              isOpen={showThinkingPanel}
              isProcessing={aiStream.isProcessing}
              thinkingText={aiStream.thinkingText}
              resultReason={lastAiResult}
              errorMessage={aiStream.errorMessage}
              onClose={() => setShowThinkingPanel(false)}
              progress={aiStream.progress}
              multiStageState={aiStream.multiStageState}
              isBothOpen={showThinkingPanel && showVersionPanel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
