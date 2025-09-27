import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "@/lib/trpc";
import { db } from "@/models/database";
import { eq } from "drizzle-orm";
import { events } from "@/models/events";
import { TRPCError } from "@trpc/server";

export const EventRouter = router({
  getAll: publicProcedure.query(async () => {
    try {
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
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch events",
        cause: error,
      });
    }
  }),
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        const query = await db.query.events.findFirst({
          where: eq(events.id, input.id),
        });
        if (!query) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Event not found",
          });
        }
        return query;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch event",
          cause: error,
        });
      }
    }),

  getEventsCreatedByUser: protectedProcedure.query(async ({ ctx }) => {
    try {
      const query = await db.query.events.findMany({
        where: eq(events.createdBy, ctx.session.user.id),
        with: {
          rspvs: {
            with: {
              user: {
                columns: {
                  name: true,
                },
              },
            },
          },
        },
      });
      if (!query) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Events not found",
        });
      }
      return query;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch events",
        cause: error,
      });
    }
  }),
});
