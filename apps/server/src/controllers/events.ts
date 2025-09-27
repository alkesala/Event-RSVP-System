import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "@/lib/trpc";
import { db } from "@/models/database";
import { eq } from "drizzle-orm";
import { events } from "@/models/events";

export const EventRouter = router({
  getAll: publicProcedure.query(async () => {
    return await db.query.events.findMany({
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return await db.query.events.findFirst({
        where: eq(events.id, input.id),
      });
    }),
});
