import { pgTable, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { relations } from "drizzle-orm";

export const rsvpStatusEnum = pgEnum("rsvp_status", ["attending", "declined"]);

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rspvs = pgTable(
  "rspvs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    status: rsvpStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("unique_user_event").on(table.userId, table.eventId)],
);

export const userRelations = relations(user, ({ many }) => ({
  rspvs: many(rspvs),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  rspvs: many(rspvs),
}));

export const rspvsRelations = relations(rspvs, ({ one }) => ({
  user: one(user, {
    fields: [rspvs.userId],
    references: [user.id],
  }),
  event: one(events, {
    fields: [rspvs.eventId],
    references: [events.id],
  }),
}));
