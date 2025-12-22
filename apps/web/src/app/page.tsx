"use client";

import {
  DIAGRAM_TYPES,
  DIAGRAM_TYPE_INFO,
  type DiagramType,
} from "@/server/db/schema";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * トップページ - プロジェクト一覧
 */
export default function Home() {
  const router = useRouter();
  const [projectName, setProjectName] = useState("");
  const [selectedDiagramType, setSelectedDiagramType] =
    useState<DiagramType>("flowchart");
  const [archivingProjectId, setArchivingProjectId] = useState<string | null>(
    null,
  );
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(
    null,
  );
  const [showArchived, setShowArchived] = useState(false);

  // プロジェクト一覧を取得
  const { data: projects, refetch: refetchProjects } =
    trpc.diagram.listProjects.useQuery();

  // アーカイブ済みプロジェクト一覧を取得
  const { data: archivedProjects, refetch: refetchArchived } =
    trpc.diagram.listArchivedProjects.useQuery();

  // プロジェクト作成のmutation
  const createProject = trpc.diagram.createProject.useMutation({
    onSuccess: (project) => {
      setProjectName("");
      setSelectedDiagramType("flowchart");
      // 作成後すぐにプロジェクト詳細ページに遷移
      router.push(`/projects/${project.id}`);
    },
  });

  // プロジェクトアーカイブのmutation
  const archiveProject = trpc.diagram.archiveProject.useMutation({
    onSuccess: () => {
      setArchivingProjectId(null);
      refetchProjects();
      refetchArchived();
    },
    onError: () => {
      setArchivingProjectId(null);
    },
  });

  // プロジェクト復元のmutation
  const unarchiveProject = trpc.diagram.unarchiveProject.useMutation({
    onSuccess: () => {
      setRestoringProjectId(null);
      refetchProjects();
      refetchArchived();
    },
    onError: () => {
      setRestoringProjectId(null);
    },
  });

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
   * プロジェクト選択（URLで遷移）
   */
  const handleSelectProject = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  /**
   * プロジェクトをアーカイブ
   */
  const handleArchiveProject = (
    e: React.MouseEvent,
    projectId: string,
    projectName: string,
  ) => {
    e.stopPropagation(); // 親のクリックイベントを阻止

    if (window.confirm(`「${projectName}」をアーカイブしますか？`)) {
      setArchivingProjectId(projectId);
      archiveProject.mutate({ projectId });
    }
  };

  /**
   * プロジェクトを復元
   */
  const handleRestoreProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setRestoringProjectId(projectId);
    unarchiveProject.mutate({ projectId });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✍️</span>
            <div>
              <h1 className="text-2xl font-bold bg-linear-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                Inkmaid
              </h1>
              <p className="text-sm text-gray-400">
                手書きとAIで直感的に図解するプラットフォーム
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* 新規プロジェクト作成セクション */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            新規プロジェクト
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label
                  htmlFor="projectName"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  プロジェクト名
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="例: システム構成図、ER設計..."
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="w-48">
                <label
                  htmlFor="diagramType"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  図の種類
                </label>
                <select
                  id="diagramType"
                  value={selectedDiagramType}
                  onChange={(e) =>
                    setSelectedDiagramType(e.target.value as DiagramType)
                  }
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white"
                >
                  {DIAGRAM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {DIAGRAM_TYPE_INFO[type].icon} {DIAGRAM_TYPE_INFO[type].label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createProject.isPending || !projectName.trim()}
                className="px-6 py-2.5 text-sm bg-linear-to-r from-violet-600 to-fuchsia-600 text-white font-medium rounded-lg hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {createProject.isPending ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </section>

        {/* プロジェクト一覧 */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            プロジェクト一覧
          </h2>

          {projects?.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl mb-4 block opacity-50">📭</span>
              <p className="text-gray-500 mb-2">プロジェクトがまだありません</p>
              <p className="text-sm text-gray-400">
                上のフォームから新規プロジェクトを作成してください
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects?.map((project) => {
                const diagramType = (project.diagramType ||
                  "flowchart") as DiagramType;
                const typeInfo = DIAGRAM_TYPE_INFO[diagramType];
                const isArchiving = archivingProjectId === project.id;

                return (
                  <div
                    key={project.id}
                    onClick={() => !isArchiving && handleSelectProject(project.id)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !isArchiving &&
                      handleSelectProject(project.id)
                    }
                    className={`bg-white rounded-xl border border-gray-200 p-5 cursor-pointer transition-all hover:border-violet-300 hover:shadow-md group ${
                      isArchiving ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl" title={typeInfo.label}>
                        {typeInfo.icon}
                      </span>
                      <button
                        type="button"
                        onClick={(e) =>
                          handleArchiveProject(e, project.id, project.name)
                        }
                        disabled={isArchiving}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                        title="アーカイブ"
                      >
                        {isArchiving ? (
                          <span className="w-4 h-4 block border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-1 truncate">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                        {typeInfo.label}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(project.createdAt).toLocaleDateString("ja-JP")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* アーカイブ済みプロジェクト */}
        {(archivedProjects?.length ?? 0) > 0 && (
          <section className="mb-12">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 transition-transform ${showArchived ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="font-medium">
                アーカイブ済み ({archivedProjects?.length})
              </span>
            </button>

            {showArchived && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedProjects?.map((project) => {
                  const diagramType = (project.diagramType ||
                    "flowchart") as DiagramType;
                  const typeInfo = DIAGRAM_TYPE_INFO[diagramType];
                  const isRestoring = restoringProjectId === project.id;

                  return (
                    <div
                      key={project.id}
                      className={`bg-gray-50 rounded-xl border border-gray-200 p-5 opacity-75 hover:opacity-100 transition-all group ${
                        isRestoring ? "pointer-events-none" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-2xl grayscale" title={typeInfo.label}>
                          {typeInfo.icon}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleRestoreProject(e, project.id)}
                          disabled={isRestoring}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          title="復元"
                        >
                          {isRestoring ? (
                            <span className="w-4 h-4 block border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                      <h3 className="font-semibold text-gray-600 mb-1 truncate">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="bg-gray-200 px-2 py-0.5 rounded">
                          {typeInfo.label}
                        </span>
                        <span>·</span>
                        <span>
                          {project.archivedAt &&
                            new Date(project.archivedAt).toLocaleDateString(
                              "ja-JP",
                            )}
                          にアーカイブ
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* フッター */}
        <footer className="mt-16 text-center text-xs text-gray-400">
          <div className="flex justify-center gap-8 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                □
              </span>
              <span>四角 → ノード</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                ◇
              </span>
              <span>ひし形 → 分岐</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                →
              </span>
              <span>線 → 接続</span>
            </div>
          </div>
          <p>手書きでダイアグラムを描いて、AIが自動でMermaidコードに変換します</p>
        </footer>
      </main>
    </div>
  );
}
