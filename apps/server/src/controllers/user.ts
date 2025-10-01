import { TRPCError } from "@trpc/server"
import { protectedProcedure, router } from "@/lib/trpc"
import { db } from "@/models/database"

export const UserRoute = router({
	get: protectedProcedure.query(async () => {
		try {
			return await db.query.account.findMany({
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
				message: "Failed to fetch users",
				cause: error,
			})
		}
	}),
})
