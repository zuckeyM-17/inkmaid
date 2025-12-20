import { router } from "../init";
import { diagramRouter } from "./diagram";

export const appRouter = router({
  diagram: diagramRouter,
});

export type AppRouter = typeof appRouter;

