import { z } from "zod";

const envSchema = z.object({
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: z.enum(["disable", "require"]).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ")}`,
  );
}

export const env = parsed.data;

export function requireGoogleMapsApiKey() {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY is missing");
  }

  return env.GOOGLE_MAPS_API_KEY;
}

export function shouldUseDatabaseSsl() {
  if (!env.DATABASE_URL) {
    return false;
  }

  if (env.DATABASE_SSL === "require") {
    return true;
  }

  return env.DATABASE_URL.includes("sslmode=require");
}
