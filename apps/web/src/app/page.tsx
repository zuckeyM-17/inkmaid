"use client";

import AIThinkingPanel from "@/components/AIThinkingPanel";
import type { ConvertWithAIData } from "@/components/DiagramCanvas";
import DynamicDiagramCanvas from "@/components/DynamicDiagramCanvas";
import type { Stroke } from "@/components/HandwritingCanvas";
import { useAIStream } from "@/lib/hooks/useAIStream";
import { trpc } from "@/lib/trpc/client";
import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_INFO,
  type DiagramType,
} from "@/server/db/schema";
import { useCallback, useEffect, useState } from "react";

/**
 * 選択中のプロジェクト情報
 */
type SelectedProject = {
  id: string;
  name: string;
  diagramType: DiagramType;
};

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [selectedDiagramType, setSelectedDiagramType] =
    useState<DiagramType>("flowchart");
  const [selectedProject, setSelectedProject] =
    useState<SelectedProject | null>(null);

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
  const [showThinkingPanel, setShowThinkingPanel] = useState(true);

  // AIストリーミングフック
  const aiStream = useAIStream();

  // プロジェクト一覧を取得
  const { data: projects, refetch } = trpc.diagram.listProjects.useQuery();

  // プロジェクト作成のmutation
  const createProject = trpc.diagram.createProject.useMutation({
    onSuccess: () => {
      setProjectName("");
      setSelectedDiagramType("flowchart");
      refetch();
    },
  });

  // プロジェクト詳細（ストローク含む）を取得
  const getProjectWithStrokes = trpc.diagram.getProjectWithStrokes.useQuery(
    { projectId: selectedProject?.id ?? "" },
    { enabled: !!selectedProject?.id },
  );

  // ダイアグラムとストロークを保存
  const saveDiagramWithStrokes =
    trpc.diagram.saveDiagramWithStrokes.useMutation({
      onSuccess: () => {
        refetch();
        getProjectWithStrokes.refetch();
      },
    });

  // ストローク解釈完了時のコールバック
  const handleStreamComplete = useCallback(
    (result: {
      mermaidCode: string | null;
      reason: string | null;
      thinking: string;
    }) => {
      if (result.mermaidCode) {
        console.log("AI Stream Response:", {
          reasoning: result.reason,
          thinking: result.thinking,
        });
        setEditingMermaidCode(result.mermaidCode);
        setEditingStrokes([]); // 変換後はストロークをクリア
        setCanvasKey((prev) => prev + 1);
        setLastAiResult(result.reason || "変換が完了しました");

        // DBにも保存
        if (selectedProject) {
          saveDiagramWithStrokes.mutate({
            projectId: selectedProject.id,
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
    },
    [selectedProject, saveDiagramWithStrokes],
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
        if (selectedProject) {
          saveDiagramWithStrokes.mutate({
            projectId: selectedProject.id,
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
  const projectData = getProjectWithStrokes.data;
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
   * プロジェクト作成
   */
  const handleCreate = () => {
    if (projectName.trim()) {
      createProject.mutate({
        name: projectName,
        diagramType: selectedDiagramType,
      });
    }
  };

  /**
   * プロジェクト選択
   */
  const handleSelectProject = useCallback(
    (project: { id: string; name: string; diagramType: string }) => {
      setSelectedProject({
        id: project.id,
        name: project.name,
        diagramType: project.diagramType as DiagramType,
      });
      setCanvasKey((prev) => prev + 1);
      setLastAiResult(null);
    },
    [],
  );

  /**
   * プロジェクト選択解除
   */
  const handleDeselectProject = useCallback(() => {
    setSelectedProject(null);
    setEditingMermaidCode("");
    setEditingStrokes([]);
    setLastAiResult(null);
  }, []);

  /**
   * 保存ボタンのハンドラ
   */
  const handleSave = useCallback(
    (data: { mermaidCode: string; strokes: Stroke[] }) => {
      if (!selectedProject) return;

      saveDiagramWithStrokes.mutate({
        projectId: selectedProject.id,
        mermaidCode: data.mermaidCode,
        strokes: data.strokes,
        updateType: "handwriting",
        reason: "手動保存",
      });

      setEditingMermaidCode(data.mermaidCode);
      setEditingStrokes(data.strokes);
    },
    [selectedProject, saveDiagramWithStrokes],
  );

  /**
   * AIで変換ボタンのハンドラ（ストリーミング対応）
   */
  const handleConvertWithAI = useCallback(
    (data: ConvertWithAIData) => {
      setLastAiResult(null);
      setErrorRetryCount(0);
      // 思考パネルを自動的に開く
      setShowThinkingPanel(true);

      // ストリーミングAPIを呼び出し
      aiStream.interpretStrokes(
        {
          strokes: data.strokes,
          currentMermaidCode: data.mermaidCode,
          nodePositions: data.nodePositions,
          canvasImage: data.canvasImage,
          hint: data.hint,
          diagramType: selectedProject?.diagramType ?? "flowchart",
        },
        handleStreamComplete,
      );
    },
    [aiStream, selectedProject?.diagramType, handleStreamComplete],
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

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* 左サイドバー */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* ロゴ */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✍️</span>
            <h1 className="text-xl font-bold bg-linear-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              Inkmaid
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            手書きからダイアグラムを生成
          </p>
        </div>

        {/* 新規プロジェクト作成 */}
        <div className="p-4 border-b border-gray-100">
          <div className="space-y-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="新規プロジェクト名..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {/* 図の種類選択 */}
            <select
              value={selectedDiagramType}
              onChange={(e) =>
                setSelectedDiagramType(e.target.value as DiagramType)
              }
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white"
            >
              {DIAGRAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DIAGRAM_TYPE_INFO[type].icon} {DIAGRAM_TYPE_INFO[type].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createProject.isPending || !projectName.trim()}
              className="w-full px-4 py-2 text-sm bg-linear-to-r from-violet-600 to-fuchsia-600 text-white font-medium rounded-lg hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {createProject.isPending ? "作成中..." : "+ 新規作成"}
            </button>
          </div>
        </div>

        {/* プロジェクト一覧 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            プロジェクト
          </h2>
          {projects?.length === 0 && (
            <div className="text-center py-6">
              <span className="text-3xl mb-2 block opacity-50">📭</span>
              <p className="text-xs text-gray-400">プロジェクトがありません</p>
            </div>
          )}
          <ul className="space-y-1">
            {projects?.map((project) => {
              const diagramType = (project.diagramType ||
                "flowchart") as DiagramType;
              const typeInfo = DIAGRAM_TYPE_INFO[diagramType];
              return (
                <li
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSelectProject(project)
                  }
                  className={`px-3 py-2 rounded-lg cursor-pointer transition-all ${
                    selectedProject?.id === project.id
                      ? "bg-violet-100 text-violet-700"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base" title={typeInfo.label}>
                      {typeInfo.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {project.name}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <span>{typeInfo.label}</span>
                        <span>·</span>
                        <span>
                          {new Date(project.createdAt).toLocaleDateString(
                            "ja-JP",
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <header className="h-12 border-b border-gray-200 bg-white px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {selectedProject ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeselectProject}
                  className="text-gray-400 hover:text-gray-600 transition-colors text-lg"
                  title="戻る"
                >
                  ←
                </button>
                <span className="text-base">
                  {DIAGRAM_TYPE_INFO[selectedProject.diagramType].icon}
                </span>
                <h2 className="text-sm font-semibold text-gray-800">
                  {selectedProject.name}
                </h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  {DIAGRAM_TYPE_INFO[selectedProject.diagramType].label}
                </span>
              </div>
            ) : (
              <h2 className="text-sm font-semibold text-gray-800">
                プロジェクトを選択
              </h2>
            )}
          </div>

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
        </header>

        {/* コンテンツエリア */}
        <div className="flex-1 flex flex-col overflow-auto">
          {selectedProject ? (
            getProjectWithStrokes.isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-500">読み込み中...</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-auto">
                {/* AI変換結果のフィードバック（コンパクト版） */}
                {lastAiResult && (
                  <div className="mb-4 bg-violet-50 rounded-xl border border-violet-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-lg">🤖</span>
                      <div className="flex-1">
                        <p className="text-sm text-violet-800">
                          {lastAiResult}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLastAiResult(null)}
                        className="text-violet-400 hover:text-violet-600 text-lg"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* メインキャンバス */}
                <DynamicDiagramCanvas
                  key={`${selectedProject.id}-${canvasKey}`}
                  width={showThinkingPanel ? 900 : 1100}
                  height={600}
                  strokeColor="#7c3aed"
                  strokeWidth={3}
                  initialMermaidCode={editingMermaidCode}
                  initialStrokes={editingStrokes}
                  isSaving={saveDiagramWithStrokes.isPending}
                  isConverting={aiStream.isProcessing}
                  isFixingError={fixMermaidError.isPending}
                  onSave={handleSave}
                  onConvertWithAI={handleConvertWithAI}
                  onMermaidParseError={handleMermaidParseError}
                />

                {/* デバッグ情報 */}
                <details className="mt-4 bg-gray-100 rounded-lg p-3 text-xs">
                  <summary className="cursor-pointer text-gray-600 font-medium">
                    🐛 デバッグ情報
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <strong>lastAiResult:</strong> {lastAiResult || "(empty)"}
                    </div>
                    <div>
                      <strong>aiThinking:</strong>{" "}
                      {aiStream.thinkingText
                        ? `${aiStream.thinkingText.substring(0, 100)}...`
                        : "(empty)"}
                    </div>
                    <div>
                      <strong>aiOutput:</strong>{" "}
                      {aiStream.outputText
                        ? `${aiStream.outputText.substring(0, 100)}...`
                        : "(empty)"}
                    </div>
                    <div>
                      <strong>errorRetryCount:</strong> {errorRetryCount}
                    </div>
                  </div>
                </details>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <span className="text-6xl mb-4 block">✍️</span>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  手書きでダイアグラムを作成
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  左のサイドバーからプロジェクトを選択するか、
                  <br />
                  新規作成して手書きを始めましょう
                </p>
                <div className="flex justify-center gap-6 text-xs text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-violet-100 rounded flex items-center justify-center">
                      □
                    </span>
                    四角 → ノード
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-violet-100 rounded flex items-center justify-center">
                      ◇
                    </span>
                    ひし形 → 分岐
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 bg-violet-100 rounded flex items-center justify-center">
                      →
                    </span>
                    線 → 接続
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 右サイドバー: AI思考ログパネル */}
      <AIThinkingPanel
        isOpen={showThinkingPanel}
        isProcessing={aiStream.isProcessing}
        thinkingText={aiStream.thinkingText}
        resultReason={lastAiResult}
        errorMessage={aiStream.errorMessage}
        onClose={() => setShowThinkingPanel(false)}
      />
    </div>
  );
}
