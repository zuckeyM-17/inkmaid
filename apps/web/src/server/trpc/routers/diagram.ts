import { eq } from "drizzle-orm";
import { z } from "zod";
import { diagramVersions, projects } from "../../db/schema";
import { publicProcedure, router } from "../init";

export const diagramRouter = router({
  // プロジェクト一覧を取得
  listProjects: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.projects.findMany({
      orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
    });
  }),

  // プロジェクトを作成
  createProject: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        initialMermaidCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [project] = await ctx.db
        .insert(projects)
        .values({ name: input.name })
        .returning();

      // 初期バージョンを作成
      const mermaidCode =
        input.initialMermaidCode ?? "flowchart TD\n    A[Start]";
      await ctx.db.insert(diagramVersions).values({
        projectId: project.id,
        versionNumber: 1,
        mermaidCode,
        updateType: "initial",
        reason: "プロジェクト作成",
      });

      return project;
    }),

  // プロジェクトの詳細を取得（最新バージョン含む）
  getProject: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.id),
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const latestVersion = await ctx.db.query.diagramVersions.findFirst({
        where: eq(diagramVersions.projectId, input.id),
        orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
      });

      return { ...project, latestVersion };
    }),

  // バージョン履歴を取得
  getVersionHistory: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.diagramVersions.findMany({
        where: eq(diagramVersions.projectId, input.projectId),
        orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
      });
    }),

  // 新しいバージョンを保存
  saveVersion: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        mermaidCode: z.string(),
        updateType: z.enum(["initial", "chat", "handwriting"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 現在の最新バージョン番号を取得
      const latestVersion = await ctx.db.query.diagramVersions.findFirst({
        where: eq(diagramVersions.projectId, input.projectId),
        orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
      });

      const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      const [version] = await ctx.db
        .insert(diagramVersions)
        .values({
          projectId: input.projectId,
          versionNumber: newVersionNumber,
          mermaidCode: input.mermaidCode,
          updateType: input.updateType,
          reason: input.reason,
        })
        .returning();

      // プロジェクトのupdatedAtを更新
      await ctx.db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));

      return version;
    }),
});

