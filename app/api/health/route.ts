import { storageMode } from "@/lib/db";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json({ status: "ok", environment: "sandbox", storage: storageMode() });
  } catch {
    return Response.json(
      { status: "not_ready", error: "Configure DATABASE_URL for durable hosted storage." },
      { status: 503 },
    );
  }
}
