import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

import { ensureDashboardSchema, getDbPool } from "@/lib/db";
import { env } from "@/lib/env";
import { getCachedLiveSnapshot } from "@/lib/live-snapshot";
import type { DailySnapshot } from "@/lib/types";

const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_HISTORY_DIR = path.join(LOCAL_DATA_DIR, "history");
const LOCAL_LATEST_PATH = path.join(LOCAL_DATA_DIR, "latest.json");
const BLOB_LATEST_PATH = "snapshots/latest.json";

async function readLocalSnapshot() {
  try {
    const raw = await readFile(LOCAL_LATEST_PATH, "utf8");
    return JSON.parse(raw) as DailySnapshot;
  } catch {
    return null;
  }
}

async function writeLocalSnapshot(snapshot: DailySnapshot) {
  const historyPath = path.join(
    LOCAL_HISTORY_DIR,
    `${snapshot.generatedAt.slice(0, 10)}.json`,
  );

  await mkdir(LOCAL_HISTORY_DIR, { recursive: true });
  await writeFile(LOCAL_LATEST_PATH, JSON.stringify(snapshot, null, 2), "utf8");
  await writeFile(historyPath, JSON.stringify(snapshot, null, 2), "utf8");
}

async function readBlobSnapshot() {
  const result = await get(BLOB_LATEST_PATH, { access: "public" });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  const raw = await new Response(result.stream).text();
  return JSON.parse(raw) as DailySnapshot;
}

async function writeBlobSnapshot(snapshot: DailySnapshot) {
  const body = JSON.stringify(snapshot, null, 2);
  const historyPath = `snapshots/history/${snapshot.generatedAt.slice(0, 10)}.json`;

  await put(BLOB_LATEST_PATH, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  await put(historyPath, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readDatabaseSnapshot(pool: Pool) {
  const result = await pool.query<{ payload: DailySnapshot }>(
    `
      select payload
      from dashboard_snapshots
      order by generated_at desc
      limit 1
    `,
  );

  return result.rows[0]?.payload ?? null;
}

async function writeDatabaseSnapshot(pool: Pool, snapshot: DailySnapshot) {
  await ensureDashboardSchema(pool);
  await pool.query(
    `
      insert into dashboard_snapshots (generated_at, mode, payload)
      values ($1, $2, $3::jsonb)
    `,
    [snapshot.generatedAt, snapshot.mode, JSON.stringify(snapshot)],
  );
}

export async function readLatestSnapshot() {
  const pool = getDbPool();

  if (pool) {
    const snapshot = await readDatabaseSnapshot(pool);
    if (snapshot) {
      return snapshot;
    }
  }

  if (env.BLOB_READ_WRITE_TOKEN) {
    const snapshot = await readBlobSnapshot();
    if (snapshot) {
      return snapshot;
    }
  }

  if (!pool && !env.BLOB_READ_WRITE_TOKEN && env.GOOGLE_MAPS_API_KEY && env.VERCEL === "1") {
    return getCachedLiveSnapshot();
  }

  const localSnapshot = await readLocalSnapshot();
  if (localSnapshot) {
    return localSnapshot;
  }

  if (env.GOOGLE_MAPS_API_KEY) {
    return getCachedLiveSnapshot();
  }

  throw new Error("No snapshot source is available");
}

export async function writeSnapshot(snapshot: DailySnapshot) {
  const pool = getDbPool();

  if (pool) {
    await writeDatabaseSnapshot(pool, snapshot);
  }

  if (env.BLOB_READ_WRITE_TOKEN) {
    await writeBlobSnapshot(snapshot);
  }

  if (env.VERCEL !== "1") {
    await writeLocalSnapshot(snapshot);
  }
}
