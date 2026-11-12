import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "../http";
export async function privateBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Заполните форму.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 16000) {
        await reader.cancel();
        throw new HttpError(413, "Сообщение слишком длинное.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new HttpError(400, "Проверьте поля формы.");
  }
}
export async function privateApi(action: () => Promise<unknown>) {
  let response: NextResponse;
  try {
    const result = await action();
    response = result instanceof NextResponse ? result : NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError)
      response = NextResponse.json({ error: e.message }, { status: e.status });
    else {
      console.error("Private request failed:", e instanceof Error ? e.name : "UnknownError");
      response = NextResponse.json(
        { error: "Не удалось выполнить запрос. Повторите позже." },
        { status: 500 },
      );
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
