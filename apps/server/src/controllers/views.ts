import { eq } from "drizzle-orm"
import ejs from "ejs"
import { Hono } from "hono"
import { auth } from "@/lib/auth"
import { createContext } from "@/lib/context"
import { db } from "@/models/database"
import { events, rspvs } from "@/models/events"
import { appRouter } from "./index"

const viewsPath = `${import.meta.dir}/../views`

type User = {
  id: string
  name: string
  email: string
}

type Variables = {
  user: User | null
}

const app = new Hono<{ Variables: Variables }>()

// Helper to render with layout
const render = async (
  template: string,
  data: Record<string, unknown>,
  user: unknown = null,
) => {
  const body = await ejs.renderFile(
    `${viewsPath}/${template}.ejs`,
    data,
  )
  return ejs.renderFile(`${viewsPath}/layout.ejs`, {
    ...data,
    body,
    user,
    title: data.title || "Event System",
  })
}

// Middleware to get current user
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set("user", session?.user || null)
  await next()
})

// Home - List all events
app.get("/", async (c) => {
  const allEvents = await db.query.events.findMany({
    with: {
      createdBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  const html = await render(
    "events-list",
    { events: allEvents, user: c.get("user"), title: "All Events" },
    c.get("user"),
  )
  return c.html(html)
})

// Create event form - MUST come before /events/:id
app.get("/events/new", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const html = await render(
    "event-form",
    { event: null, user, title: "Create Event" },
    user,
  )
  return c.html(html)
})

// Event detail
app.get("/events/:id", async (c) => {
  const eventId = c.req.param("id")
  const user = c.get("user")

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      createdBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  if (!event) {
    return c.html("<h1>Event not found</h1>", 404)
  }

  const allRsvps = await db.query.rspvs.findMany({
    where: eq(rspvs.eventId, eventId),
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

  const attendingCount = allRsvps.filter((r) => r.status === "attending").length

  let userRsvp = null
  if (user) {
    userRsvp = allRsvps.find((r) => r.userId === user.id)
  }

  const html = await render(
    "event-detail",
    {
      event,
      rsvps: allRsvps,
      userRsvp,
      attendingCount,
      user,
      title: event.name,
    },
    user,
  )
  return c.html(html)
})

// Create event POST
app.post("/events/new", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  try {
    const body = await c.req.parseBody()
    const ctx = await createContext({ context: c })
    const caller = appRouter.createCaller(ctx)

    const capacityValue = body.capacity
      ? Number.parseInt(body.capacity as string, 10)
      : null

    await caller.events.create({
      name: body.name as string,
      location: body.location as string,
      date: body.date as string,
      capacity: capacityValue,
    })

    return c.redirect("/")
  } catch (error) {
    const html = await render(
      "event-form",
      {
        event: null,
        user,
        title: "Create Event",
        error: error instanceof Error ? error.message : "Failed to create event",
      },
      user,
    )
    return c.html(html, 400)
  }
})

// RSVP to event
app.post("/events/:id/rsvp", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const eventId = c.req.param("id")
  const body = await c.req.parseBody()
  const status = body.status as "attending" | "declined"

  try {
    const ctx = await createContext({ context: c })
    const caller = appRouter.createCaller(ctx)

    await caller.rsvp.create({
      eventId,
      data: { status },
    })

    return c.redirect(`/events/${eventId}`)
  } catch (error) {
    return c.html(
      `<h1>${error instanceof Error ? error.message : "Failed to RSVP"}</h1>`,
      400,
    )
  }
})

// Update RSVP
app.post("/events/:eventId/rsvp/:rsvpId", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const rsvpId = c.req.param("rsvpId")
  const eventId = c.req.param("eventId")
  const body = await c.req.parseBody()
  const status = body.status as "attending" | "declined"

  try {
    const ctx = await createContext({ context: c })
    const caller = appRouter.createCaller(ctx)

    await caller.rsvp.update({
      id: rsvpId,
      data: { status },
    })

    return c.redirect(`/events/${eventId}`)
  } catch (error) {
    return c.html(
      `<h1>${error instanceof Error ? error.message : "Failed to update RSVP"}</h1>`,
      400,
    )
  }
})

// Delete RSVP
app.post("/events/:eventId/rsvp/:rsvpId/delete", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const rsvpId = c.req.param("rsvpId")
  const eventId = c.req.param("eventId")

  try {
    const ctx = await createContext({ context: c })
    const caller = appRouter.createCaller(ctx)

    await caller.rsvp.delete({ id: rsvpId })

    return c.redirect(`/events/${eventId}`)
  } catch (error) {
    return c.html(
      `<h1>${error instanceof Error ? error.message : "Failed to delete RSVP"}</h1>`,
      400,
    )
  }
})

// My Events
app.get("/my-events", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const myEvents = await db.query.events.findMany({
    where: eq(events.createdBy, user.id),
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
  })

  const html = await render(
    "my-events",
    { events: myEvents, user, title: "My Events" },
    user,
  )
  return c.html(html)
})

// My RSVPs
app.get("/my-rsvps", async (c) => {
  const user = c.get("user")
  if (!user) {
    return c.redirect("/auth/login")
  }

  const myRsvps = await db.query.rspvs.findMany({
    where: eq(rspvs.userId, user.id),
    with: {
      event: true,
    },
  })

  const html = await render(
    "my-rsvps",
    { rsvps: myRsvps, user, title: "My RSVPs" },
    user,
  )
  return c.html(html)
})

// Auth pages
app.get("/auth/login", async (c) => {
  const html = await render("auth-login", { user: null, title: "Login" })
  return c.html(html)
})

app.get("/auth/signup", async (c) => {
  const html = await render("auth-signup", { user: null, title: "Sign Up" })
  return c.html(html)
})

app.get("/auth/logout", async (c) => {
  // Call Better Auth's sign-out endpoint
  await auth.api.signOut({ headers: c.req.raw.headers })
  return c.redirect("/")
})

export default app
