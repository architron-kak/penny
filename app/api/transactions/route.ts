import type { NextRequest } from "next/server";
import { api, requestUser } from "@/lib/http";
import { getHome } from "@/lib/home";
export async function GET(request: NextRequest) {
  return api(async () => ({
    transactions: (await getHome(requestUser(request))).transactions,
  }));
}
