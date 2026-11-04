import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personaIds } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const userSchema = z.enum(personaIds);
export function requestUser(request: NextRequest) {
  const result = userSchema.safeParse(request.nextUrl.searchParams.get("user") || "student");
  if (!result.success) throw new HttpError(400, "Unknown demo persona.");
  return result.data;
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://localhost:3000").origin;
  if (origin !== expected || request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Please perform this action from the Penny app.");
}
export async function jsonBody<T>(request: NextRequest, schema: z.ZodType<T>) {
  if (Number(request.headers.get("content-length") || 0) > 20000)
    throw new HttpError(413, "Request too large.");
  try {
    return schema.parse(await request.json());
  } catch {
    throw new HttpError(400, "Invalid request. Please check the submitted values.");
  }
}
export async function api(action: () => Promise<unknown>) {
  try {
    return NextResponse.json(await action(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Penny request failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "The request could not be completed. Please try again." },
      { status: 500 },
    );
  }
}
