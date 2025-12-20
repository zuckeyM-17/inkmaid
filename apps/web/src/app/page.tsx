"use client";

import { trpc } from "@/lib/trpc/client";
import { useState, useCallback } from "react";
import DynamicDiagramCanvas from "@/components/DynamicDiagramCanvas";
import type { Stroke } from "@/components/HandwritingCanvas";

export default function Home() {
  const [projectName, setProjectName] = useState("");
  const [lastStroke, setLastStroke] = useState<Stroke | null>(null);

  // プロジェクト一覧を取得
  const { data: projects, refetch } = trpc.diagram.listProjects.useQuery();

  // プロジェクト作成のmutation
  const createProject = trpc.diagram.createProject.useMutation({
    onSuccess: () => {
      setProjectName("");
      refetch();
    },
  });

  const handleCreate = () => {
    if (projectName.trim()) {
      createProject.mutate({ name: projectName });
    }
  };

  /**
   * ストロークが完了したときのハンドラ
   */
  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    setLastStroke(stroke);
    console.log("ストローク完了:", stroke);
  }, []);

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
                className="p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-all group"
              >
                <div className="text-sm font-medium text-gray-700 group-hover:text-indigo-700 transition-colors truncate">
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
            <h2 className="text-lg font-semibold text-gray-800">ダイアグラムエディタ</h2>
          </div>
          <p className="text-sm text-gray-400">
            Mermaid + 手書きでダイアグラムを編集
          </p>
        </header>

        {/* キャンバスエリア */}
        <div className="flex-1 p-6 overflow-auto">
          <DynamicDiagramCanvas
            width={1200}
            height={600}
            strokeColor="#3730a3"
            strokeWidth={3}
            onStrokeComplete={handleStrokeComplete}
          />

          {/* デバッグ情報 */}
          {lastStroke && (
            <div className="mt-4 p-3 bg-gray-900 rounded-lg text-xs font-mono text-gray-300 inline-block">
              <span className="text-indigo-400">最後のストローク:</span>{" "}
              {lastStroke.points.length / 2} 点, ID: {lastStroke.id}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
