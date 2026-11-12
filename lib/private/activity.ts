import { randomUUID } from "node:crypto";
import type { PrivateState, WorkspaceActivity } from "./types";
export function recordActivity(
  s: PrivateState,
  ownerId: string,
  title: string,
  detail: string,
  kind: WorkspaceActivity["kind"],
  id: string = randomUUID(),
) {
  s.activity ||= [];
  if (s.activity.some((a) => a.id === id && a.ownerId === ownerId)) return;
  s.activity.unshift({ id, ownerId, title, detail, kind, createdAt: new Date().toISOString() });
  let count = 0;
  s.activity = s.activity.filter((a) => a.ownerId !== ownerId || ++count <= 150);
}
