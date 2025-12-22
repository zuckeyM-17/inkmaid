import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  DIAGRAM_TEMPLATES,
  DIAGRAM_TYPES,
  type DiagramType,
  diagramVersions,
  handwritingStrokes,
  projects,
} from "../../db/schema";
import { publicProcedure, router } from "../init";

/**
 * ストロークデータのZodスキーマ
 */
const strokeSchema = z.object({
  id: z.string(),
  points: z.array(z.number()),
  color: z.string(),
  strokeWidth: z.number(),
});

/**
 * 図の種類のZodスキーマ
 */
const diagramTypeSchema = z.enum(DIAGRAM_TYPES);

export const diagramRouter = router({
  /**
   * アクティブなプロジェクト一覧を取得（アーカイブ済みを除外）
   */
  listProjects: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.projects.findMany({
      where: isNull(projects.archivedAt),
      orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
    });
  }),

  /**
   * アーカイブ済みプロジェクト一覧を取得
   */
  listArchivedProjects: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.projects.findMany({
      where: isNotNull(projects.archivedAt),
      orderBy: (projects, { desc }) => [desc(projects.archivedAt)],
    });
  }),

  // プロジェクトを作成
  createProject: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        diagramType: diagramTypeSchema.optional().default("flowchart"),
        initialMermaidCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diagramType = input.diagramType as DiagramType;

      const [project] = await ctx.db
        .insert(projects)
        .values({
          name: input.name,
          diagramType,
        })
        .returning();

      // 初期バージョンを作成（図の種類に応じたテンプレートを使用）
      const mermaidCode =
        input.initialMermaidCode ?? DIAGRAM_TEMPLATES[diagramType];
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
      }),
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

  /**
   * ダイアグラムとストロークデータを一緒に保存
   * 新しいバージョンを作成し、ストロークデータも保存する
   */
  saveDiagramWithStrokes: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        mermaidCode: z.string(),
        strokes: z.array(strokeSchema),
        updateType: z.enum(["initial", "chat", "handwriting"]),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 現在の最新バージョン番号を取得
      const latestVersion = await ctx.db.query.diagramVersions.findFirst({
        where: eq(diagramVersions.projectId, input.projectId),
        orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
      });

      const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      // 新しいバージョンを作成
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

      // ストロークデータを保存（存在する場合のみ）
      if (input.strokes.length > 0) {
        await ctx.db.insert(handwritingStrokes).values({
          versionId: version.id,
          strokeData: input.strokes,
        });
      }

      // プロジェクトのupdatedAtを更新
      await ctx.db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, input.projectId));

      return version;
    }),

  /**
   * プロジェクトをアーカイブ
   * データは保持したまま一覧から非表示にする
   */
  archiveProject: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project) {
        throw new Error("プロジェクトが見つかりません");
      }

      const [archivedProject] = await ctx.db
        .update(projects)
        .set({ archivedAt: new Date() })
        .where(eq(projects.id, input.projectId))
        .returning();

      return { success: true, archivedProject };
    }),

  /**
   * プロジェクトのアーカイブを解除
   */
  unarchiveProject: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project) {
        throw new Error("プロジェクトが見つかりません");
      }

      const [restoredProject] = await ctx.db
        .update(projects)
        .set({ archivedAt: null })
        .where(eq(projects.id, input.projectId))
        .returning();

      return { success: true, restoredProject };
    }),

  /**
   * プロジェクト名を変更
   */
  renameProject: publicProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project) {
        throw new Error("プロジェクトが見つかりません");
      }

      const [updatedProject] = await ctx.db
        .update(projects)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, input.projectId))
        .returning();

      return { success: true, project: updatedProject };
    }),

  /**
   * プロジェクトの最新バージョンとストロークデータを取得
   */
  getProjectWithStrokes: publicProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.query.projects.findFirst({
        where: eq(projects.id, input.projectId),
      });

      if (!project) {
        throw new Error("プロジェクトが見つかりません");
      }

      // 最新バージョンを取得
      const latestVersion = await ctx.db.query.diagramVersions.findFirst({
        where: eq(diagramVersions.projectId, input.projectId),
        orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
      });

      // 最新バージョンのストロークデータを取得
      let strokes: unknown[] = [];
      if (latestVersion) {
        const strokeRecord = await ctx.db.query.handwritingStrokes.findFirst({
          where: eq(handwritingStrokes.versionId, latestVersion.id),
        });
        if (strokeRecord) {
          strokes = strokeRecord.strokeData as unknown[];
        }
      }

      return {
        ...project,
        latestVersion,
        strokes,
      };
    }),
});
