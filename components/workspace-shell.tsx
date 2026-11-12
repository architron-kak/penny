"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles, Sprout, type LucideIcon } from "lucide-react";
import { memo } from "react";
import { ChartBar } from "./reveal";
export function WorkspaceFrame({
  children,
  kind = "sandbox",
}: {
  children: ReactNode;
  kind?: "sandbox" | "personal";
}) {
  return (
    <div className="app-shell modern-shell" data-workspace={kind}>
      {children}
    </div>
  );
}
export function WorkspaceBrand() {
  return (
    <Link className="brand" href="/" aria-label="Penny home">
      <span className="brand-mark" aria-hidden="true">
        <Sprout size={25} strokeWidth={2} />
      </span>
      <span>
        penny<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function WorkspaceNavigation<T extends string>({
  items,
  active,
  onNavigate,
  subscriptionCount = 0,
}: {
  items: readonly { id: T; label: string; icon: LucideIcon }[];
  active: string;
  onNavigate: (id: T) => void;
  subscriptionCount?: number;
}) {
  return (
    <nav aria-label="Main navigation">
      {items.map((item) => (
        <button
          key={item.id}
          aria-label={item.label}
          aria-current={active === item.id ? "page" : undefined}
          className={`nav-item ${active === item.id ? "active" : ""}`}
          onClick={() => onNavigate(item.id)}
        >
          <item.icon size={19} />
          <span>{item.label}</span>
          {item.id === "subscriptions" && subscriptionCount > 0 && (
            <span className="nav-count">{subscriptionCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
export function WorkspaceAssistant({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="sidebar-assistant">
      <span className="assistant-orbit">
        <Sparkles size={22} />
      </span>
      <h3>A clearer next step.</h3>
      <p>Plan a purchase, check your budget, or just ask pennybot.</p>
      <button onClick={onOpen}>
        Talk to pennybot <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
export const WorkspaceBars = memo(function WorkspaceBars({
  points,
  large = false,
}: {
  points: { key: string; label: string; value: number; valueLabel: string }[];
  large?: boolean;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div
      className={`bar-chart ${large ? "large" : ""}`}
      role="img"
      aria-label={points.map((p) => `${p.label}: ${p.valueLabel}`).join(", ")}
    >
      {points.map((p, i) => (
        <div className="bar-column" key={p.key}>
          <div className="bar-space">
            <ChartBar
              key={`${p.key}-${p.value}`}
              height={Math.max((p.value / max) * 100, p.value > 0 ? 3 : 0)}
              current={i === points.length - 1}
              label={`${p.label}: ${p.valueLabel}`}
              index={i}
            />
          </div>
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
});
