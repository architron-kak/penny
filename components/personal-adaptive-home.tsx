"use client";
import { memo } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  HandCoins,
  PiggyBank,
  Receipt,
  Repeat2,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { PersonalHome, PersonalHomeCard } from "@/lib/private/types";
const icons = {
  habit: Repeat2,
  debts: HandCoins,
  subscriptions: Receipt,
  savings: PiggyBank,
  cashflow: TrendingUp,
  insight: Sparkles,
  onboarding: Wallet,
};
export default memo(function PersonalAdaptiveHome({
  home,
  busy,
  onAction,
}: {
  home: PersonalHome;
  busy: boolean;
  onAction: (card: PersonalHomeCard) => void;
}) {
  return (
    <section className="ledger-adaptive" aria-label="Adaptive Home">
      <div className="ledger-adaptive-meta">
        <span>
          <CalendarDays size={14} /> Reviewed {home.reviewedWeek} · next review {home.nextReview}
        </span>
        <span>{home.cards.length} / 7 cards</span>
      </div>
      <div className="ledger-adaptive-grid" role="list">
        {home.cards.map((card) => {
          const Icon = icons[card.kind];
          return (
            <article
              key={card.id}
              role="listitem"
              className={`ledger-adaptive-card${card.urgent ? " is-urgent" : ""}${card.kind === "onboarding" ? " ledger-onboarding" : ""}`}
              data-kind={card.kind}
              data-card-id={card.id}
            >
              <div className="ledger-adaptive-card-head">
                <span className="ledger-round-icon">
                  <Icon size={19} />
                </span>
                <span>
                  {card.kind === "habit"
                    ? "FREQUENT EXPENSE"
                    : card.kind === "insight"
                      ? "YOUR NEXT STEP"
                      : "YOUR FINANCES"}
                </span>
              </div>
              <h3>{card.title}</h3>
              <strong className="ledger-adaptive-value">{card.value}</strong>
              <p>{card.description}</p>
              {card.progress !== undefined && (
                <progress aria-label="Savings progress" max={100} value={card.progress} />
              )}
              <button
                disabled={busy}
                onClick={() => onAction(card)}
                className={card.kind === "habit" ? "ledger-primary" : "ledger-text-button"}
              >
                {card.actionLabel}
                <ArrowUpRight size={15} />
              </button>
            </article>
          );
        })}
      </div>
      <p className="ledger-adaptive-note">
        Cards update after confirmed records. Repeating an expense opens a review; no money is
        transferred.
      </p>
    </section>
  );
});
