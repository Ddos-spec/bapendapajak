import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { runDailySync } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = env.CRON_SECRET;

  if (!secret) {
    return env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  return authHeader === `Bearer ${secret}` || querySecret === secret;
}

async function handleSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const snapshot = await runDailySync();
  return Response.json(snapshot);
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}
