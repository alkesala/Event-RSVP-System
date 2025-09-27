import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { EventRouter } from "./events";
export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	events: EventRouter,
});
export type AppRouter = typeof appRouter;
