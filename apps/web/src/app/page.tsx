"use client";

import { trpc } from "@/lib/trpc/client";
import { useState } from "react";

export default function Home() {
  const [projectName, setProjectName] = useState("");

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

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-4xl font-bold mb-4">Inkmaid</h1>
      <p className="text-lg text-gray-600 mb-8">
        手書きとAIで直感的に図解するプラットフォーム
      </p>

      {/* プロジェクト作成フォーム */}
      <div className="flex gap-2 mb-8">
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="プロジェクト名"
          className="border rounded px-4 py-2"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={createProject.isPending}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {createProject.isPending ? "作成中..." : "作成"}
        </button>
      </div>

      {/* プロジェクト一覧 */}
      <div className="w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">プロジェクト一覧</h2>
        {projects?.length === 0 && (
          <p className="text-gray-500">プロジェクトがありません</p>
        )}
        <ul className="space-y-2">
          {projects?.map((project) => (
            <li
              key={project.id}
              className="border rounded p-4 hover:bg-gray-50"
            >
              <div className="font-medium">{project.name}</div>
              <div className="text-sm text-gray-500">
                作成: {new Date(project.createdAt).toLocaleString("ja-JP")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
