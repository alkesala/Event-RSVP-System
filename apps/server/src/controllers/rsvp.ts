import { TRPCError } from "@trpc/server"
import { and, eq, sql } from "drizzle-orm"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc"
import { db } from "@/models/database"
import { events, rspvs } from "@/models/events"

const insertRsvpSchema = createInsertSchema(rspvs).omit({
	id: true,
	userId: true,
	eventId: true,
	createdAt: true,
	updatedAt: true,
})

const updateRsvpSchema = createInsertSchema(rspvs).partial().omit({
	id: true,
	userId: true,
	eventId: true,
	createdAt: true,
	updatedAt: true,
})

export const RsvpRouter = router({
	// Get all RSVPs for an event
	getByEvent: publicProcedure
		.input(z.object({ eventId: z.string() }))
		.query(async ({ input }) => {
			try {
				return await db.query.rspvs.findMany({
					where: eq(rspvs.eventId, input.eventId),
					with: {
						user: {
							columns: {
								id: true,
								name: true,
								email: true,
							},
						},
					},
				})
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch RSVPs",
					cause: error,
				})
			}
		}),

	// Get user's RSVPs
	getMyRsvps: protectedProcedure.query(async ({ ctx }) => {
		try {
			return await db.query.rspvs.findMany({
				where: eq(rspvs.userId, ctx.session.user.id),
				with: {
					event: true,
				},
			})
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch your RSVPs",
				cause: error,
			})
		}
	}),

	// Create RSVP with capacity check
	create: protectedProcedure
		.input(
			z.object({
				eventId: z.string(),
				data: insertRsvpSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				// Check if event exists and get capacity
				const event = await db.query.events.findFirst({
					where: eq(events.id, input.eventId),
				})

				if (!event) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Event not found",
					})
				}

				// Check capacity if it's set
				if (event.capacity !== null) {
					const attendingCount = await db
						.select({ count: sql<number>`count(*)` })
						.from(rspvs)
						.where(
							and(
								eq(rspvs.eventId, input.eventId),
								eq(rspvs.status, "attending"),
							),
						)

					const currentAttendees = Number(attendingCount[0]?.count ?? 0)

					if (
						input.data.status === "attending" &&
						currentAttendees >= event.capacity
					) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Event is at full capacity",
						})
					}
				}

				// Check for existing RSVP
				const existingRsvp = await db.query.rspvs.findFirst({
					where: and(
						eq(rspvs.userId, ctx.session.user.id),
						eq(rspvs.eventId, input.eventId),
					),
				})

				if (existingRsvp) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You have already RSVPed to this event",
					})
				}

				const [newRsvp] = await db
					.insert(rspvs)
					.values({
						id: nanoid(),
						...input.data,
						userId: ctx.session.user.id,
						eventId: input.eventId,
					})
					.returning()

				if (!newRsvp) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create RSVP",
					})
				}

				return newRsvp
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create RSVP",
					cause: error,
				})
			}
		}),

	// Update RSVP status
	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				data: updateRsvpSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				// Check if RSVP exists and belongs to user
				const existingRsvp = await db.query.rspvs.findFirst({
					where: eq(rspvs.id, input.id),
				})

				if (!existingRsvp) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "RSVP not found",
					})
				}

				if (existingRsvp.userId !== ctx.session.user.id) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You can only update your own RSVPs",
					})
				}

				// If changing to attending, check capacity
				if (
					input.data.status === "attending" &&
					existingRsvp.status !== "attending"
				) {
					const event = await db.query.events.findFirst({
						where: eq(events.id, existingRsvp.eventId),
					})

					if (event?.capacity !== null && event?.capacity !== undefined) {
						const attendingCount = await db
							.select({ count: sql<number>`count(*)` })
							.from(rspvs)
							.where(
								and(
									eq(rspvs.eventId, existingRsvp.eventId),
									eq(rspvs.status, "attending"),
								),
							)

						const currentAttendees = Number(attendingCount[0]?.count ?? 0)

						if (currentAttendees >= event.capacity) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: "Event is at full capacity",
							})
						}
					}
				}

				const [updatedRsvp] = await db
					.update(rspvs)
					.set({ ...input.data, updatedAt: new Date() })
					.where(eq(rspvs.id, input.id))
					.returning()

				if (!updatedRsvp) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to update RSVP",
					})
				}

				return updatedRsvp
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update RSVP",
					cause: error,
				})
			}
		}),

	// Delete RSVP
	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const existingRsvp = await db.query.rspvs.findFirst({
					where: eq(rspvs.id, input.id),
				})

				if (!existingRsvp) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "RSVP not found",
					})
				}

				if (existingRsvp.userId !== ctx.session.user.id) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You can only delete your own RSVPs",
					})
				}

				await db.delete(rspvs).where(eq(rspvs.id, input.id))

				return { success: true }
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete RSVP",
					cause: error,
				})
			}
		}),
})
