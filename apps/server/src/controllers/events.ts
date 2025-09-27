import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { db } from "@/models/database";
import { events } from "@/models/events";

const insertEventSchema = createInsertSchema(events).omit({
	id: true,
	createdBy: true,
	createdAt: true,
	updatedAt: true,
});

// Update is for future
const _updateEventSchema = createInsertSchema(events)
	.partial()
	.omit({ id: true, createdBy: true, createdAt: true, updatedAt: true });

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

	create: protectedProcedure
		.input(insertEventSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const [newEvent] = await db
					.insert(events)
					.values({ id: nanoid(), ...input, createdBy: ctx.session.user.id })
					.returning();
				if (!newEvent) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create event",
					});
				}
				return newEvent;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Something happened",
					cause: error,
				});
			}
		}),
});
