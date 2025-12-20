"use client";

import { trpc } from "@/lib/trpc/client";
import { useState, useCallback } from "react";
import DynamicDiagramCanvas from "@/components/DynamicDiagramCanvas";
import type { Stroke } from "@/components/HandwritingCanvas";

/**
 * 選択中のプロジェクト情報
 */
type SelectedProject = {
  id: string;
  name: string;
  mermaidCode: string;
  strokes: Stroke[];
};

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);

  // プロジェクト一覧を取得
  const { data: projects, refetch } = trpc.diagram.listProjects.useQuery();

  // プロジェクト作成のmutation
  const createProject = trpc.diagram.createProject.useMutation({
    onSuccess: () => {
      setProjectName("");
      refetch();
    },
  });

  // プロジェクト詳細（ストローク含む）を取得
  const getProjectWithStrokes = trpc.diagram.getProjectWithStrokes.useQuery(
    { projectId: selectedProject?.id ?? "" },
    { enabled: !!selectedProject?.id }
  );

  // ダイアグラムとストロークを保存
  const saveDiagramWithStrokes = trpc.diagram.saveDiagramWithStrokes.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  /**
   * プロジェクト作成
   */
  const handleCreate = () => {
    if (projectName.trim()) {
      createProject.mutate({ name: projectName });
    }
  };

  /**
   * プロジェクト選択
   */
  const handleSelectProject = useCallback((project: { id: string; name: string }) => {
    setSelectedProject({
      id: project.id,
      name: project.name,
      mermaidCode: "",
      strokes: [],
    });
  }, []);

  /**
   * プロジェクト選択解除
   */
  const handleDeselectProject = useCallback(() => {
    setSelectedProject(null);
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
        reason: "手書き編集による更新",
      });
    },
    [selectedProject, saveDiagramWithStrokes]
  );

  // プロジェクト詳細データを取得した後の情報
  const projectData = getProjectWithStrokes.data;
  const currentMermaidCode = projectData?.latestVersion?.mermaidCode ?? "flowchart TD\n    A[Start]";
  const currentStrokes = (projectData?.strokes ?? []) as Stroke[];

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* サイドバー */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* ロゴ */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">✍️</span>
            <h1 className="text-xl font-bold bg-linear-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Inkmaid
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">手書きとAIで直感的に図解</p>
        </div>

        {/* 新規プロジェクト作成 */}
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
            <span>📁</span> 新規プロジェクト
          </h2>
          <div className="space-y-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="プロジェクト名..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createProject.isPending || !projectName.trim()}
              className="w-full px-4 py-2 text-sm bg-linear-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {createProject.isPending ? "作成中..." : "作成"}
            </button>
          </div>
        </div>

        {/* プロジェクト一覧 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
            <span>📋</span> プロジェクト一覧
          </h2>
          {projects?.length === 0 && (
            <div className="text-center py-6">
              <span className="text-3xl mb-2 block">📭</span>
              <p className="text-xs text-gray-400">プロジェクトがありません</p>
            </div>
          )}
          <ul className="space-y-2">
            {projects?.map((project) => (
              <li
                key={project.id}
                onClick={() => handleSelectProject(project)}
                onKeyDown={(e) => e.key === "Enter" && handleSelectProject(project)}
                className={`p-3 rounded-lg border cursor-pointer transition-all group ${
                  selectedProject?.id === project.id
                    ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50"
                }`}
              >
                <div
                  className={`text-sm font-medium transition-colors truncate ${
                    selectedProject?.id === project.id
                      ? "text-indigo-700"
                      : "text-gray-700 group-hover:text-indigo-700"
                  }`}
                >
                  {project.name}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(project.createdAt).toLocaleDateString("ja-JP")}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <header className="h-14 border-b border-gray-200 bg-white px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            {selectedProject ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeselectProject}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="プロジェクト一覧に戻る"
                >
                  ←
                </button>
                <h2 className="text-lg font-semibold text-gray-800">
                  {selectedProject.name}
                </h2>
              </div>
            ) : (
              <h2 className="text-lg font-semibold text-gray-800">ダイアグラムエディタ</h2>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {selectedProject
              ? "Mermaid + 手書きでダイアグラムを編集"
              : "プロジェクトを選択してください"}
          </p>
        </header>

        {/* キャンバスエリア */}
        <div className="flex-1 p-6 overflow-auto">
          {selectedProject ? (
            getProjectWithStrokes.isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-500">プロジェクトを読み込み中...</p>
                </div>
              </div>
            ) : (
              <DynamicDiagramCanvas
                key={selectedProject.id}
                width={1200}
                height={600}
                strokeColor="#3730a3"
                strokeWidth={3}
                initialMermaidCode={currentMermaidCode}
                initialStrokes={currentStrokes}
                isSaving={saveDiagramWithStrokes.isPending}
                onSave={handleSave}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="text-6xl mb-4 block">📝</span>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  プロジェクトを選択
                </h3>
                <p className="text-gray-500">
                  左のサイドバーからプロジェクトを選択するか、新規作成してください
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 保存成功メッセージ */}
        {saveDiagramWithStrokes.isSuccess && (
          <div className="fixed bottom-6 right-6 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
            <span>✅</span>
            <span>保存しました！</span>
          </div>
        )}
      </main>
    </div>
  );
}
