import type { NextRequest } from "next/server";
import { api, requestUser } from "@/lib/http";
import { getHome } from "@/lib/home";
import { ensureSession } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return api(async () => {
    await ensureSession();
    return getHome(requestUser(request));
  });
}
