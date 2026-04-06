import { readLatestSnapshot } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await readLatestSnapshot();
  return Response.json(snapshot);
}
