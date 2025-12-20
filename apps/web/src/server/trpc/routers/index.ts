import { router } from "../init";
import { aiRouter } from "./ai";
import { diagramRouter } from "./diagram";

export const appRouter = router({
  diagram: diagramRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;

