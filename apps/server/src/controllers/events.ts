import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "@/lib/trpc";
import { db } from "@/models/database";

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
});
