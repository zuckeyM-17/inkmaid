import { initTRPC } from "@trpc/server";
import { db } from "../db";

// コンテキストの作成
export const createTRPCContext = async () => {
  return {
    db,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

// tRPCインスタンスの初期化
const t = initTRPC.context<TRPCContext>().create();

// 基本のルーターとプロシージャ
export const router = t.router;
export const publicProcedure = t.procedure;
