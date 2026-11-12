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
  onPay,
}: {
  home: PersonalHome;
  busy: boolean;
  onAction: (card: PersonalHomeCard) => void;
  onPay?: (card: PersonalHomeCard) => void;
}) {
  return (
    <section className="ledger-adaptive" aria-label="Adaptive Home">
      <div className="ledger-adaptive-meta">
        <span>
          <CalendarDays size={14} /> Reviewed {home.reviewedWeek} · next review {home.nextReview}
        </span>
        <span>{home.cards.length} / 7 cards</span>
      </div>
      <div className="adaptive-grid workspace-personal-grid" role="list">
        {home.cards.map((card) => {
          const Icon = icons[card.kind];
          return (
            <article
              key={card.id}
              role="listitem"
              className={`focus-card personal-home-card${card.kind === "habit" ? " habit-card" : ""}${card.urgent ? " is-urgent" : ""}${card.kind === "onboarding" ? " ledger-onboarding" : ""}`}
              data-kind={card.kind}
              data-card-id={card.id}
            >
              <button
                className="insight-card-trigger"
                disabled={busy}
                onClick={() => onAction(card)}
              >
                <span className="card-icon green">
                  <Icon size={19} />
                </span>
                <span className="card-kicker">
                  {card.kind === "habit"
                    ? "FREQUENT EXPENSE"
                    : card.kind === "insight"
                      ? "YOUR NEXT STEP"
                      : "YOUR FINANCES"}
                </span>
                <h3>
                  {card.title} · {card.value}
                </h3>
                <p className="card-supporting">{card.description}</p>
                {card.progress !== undefined && (
                  <progress aria-label="Savings progress" max={100} value={card.progress} />
                )}
                <span className="insight-card-footer">
                  {card.actionLabel}
                  <ArrowUpRight size={15} />
                </span>
              </button>
              {card.kind === "habit" && card.entry?.currency === "USD" && onPay && (
                <div className="habit-payment">
                  <button
                    className="dark-button wide"
                    disabled={busy || card.paidToday}
                    onClick={() => onPay(card)}
                  >
                    {card.paidToday ? "Paid today" : `Pay ${card.value}`}
                  </button>
                  <small>Review first · PayPal Sandbox</small>
                </div>
              )}
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
