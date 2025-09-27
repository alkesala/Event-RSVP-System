import { drizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./auth";
import * as eventsSchema from "./events";

const schema = { ...authSchema, ...eventsSchema };

export const db = drizzle(process.env.DATABASE_URL || "", { schema });
