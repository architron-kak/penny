"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  Ear,
  LayoutDashboard,
  LogOut,
  Mic,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Wallet,
  Wind,
  X,
} from "lucide-react";
import type {
  AccountView,
  Currency,
  EntryView,
  FinanceOverview,
  PersonalHomeCard,
  PaymentView,
  SubscriptionView,
} from "@/lib/private/types";
import { AnimationProvider, useAnimationPreference } from "./animation-provider";
import {
  WorkspaceFrame,
  WorkspaceBrand,
  WorkspaceNavigation,
  WorkspaceAssistant,
  WorkspaceBars,
} from "./workspace-shell";
import PersonalAdaptiveHome from "./personal-adaptive-home";
import { useCashierListener } from "./use-cashier-listener";
import type { CashierDetection, CashierStatus } from "@/lib/cashier-listener";
import { categoryLabels, formatMoney } from "./personal-money";
import { Reveal } from "./reveal";
import {
  readAutoListening,
  writeAutoListening,
  subscribeAutoListening,
} from "@/lib/auto-listening";
const FinanceGrid = dynamic(() => import("./finance-grid"), {
  ssr: false,
  loading: () => <p>Loading transactions…</p>,
});
const CheckoutAssist = dynamic(() => import("./checkout-assist"), {
  ssr: false,
  loading: () => <p>Opening checkout assist…</p>,
});
export type WorkspaceTab =
  "overview" | "entries" | "subscriptions" | "payments" | "activity" | "accounts" | "bot";
type Props = {
  data: FinanceOverview;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  busy: boolean;
  suspendAutoListening: boolean;
  error: string;
  notice: string;
  clearError: () => void;
  signOut: () => void;
  openPassword: () => void;
  newEntry: () => void;
  newAccount: () => void;
  onCard: (c: PersonalHomeCard) => void;
  onPay: (c?: PersonalHomeCard) => void;
  onCheckoutRecord: (a: { amountMinor: number; currency: Currency }) => void;
  onCheckoutPayment: (a: { amountMinor: number; currency: Currency }) => void;
  onResume: (p: PaymentView) => void;
  onComplete: (p: PaymentView) => void;
  onSubscription: (s: SubscriptionView) => void;
  addSubscription: () => void;
  onRecordAccount: (a: AccountView) => void;
  onVoid: (e: EntryView) => void;
  search: string;
  onSearch: (s: string) => void;
  botPanel: ReactNode;
};
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "entries", label: "Transactions", icon: ArrowDownLeft },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "activity", label: "Agent activity", icon: Activity },
] as const;
const microphoneLabels: Record<CashierStatus, string> = {
  off: "Auto listening off",
  paused: "Auto listening paused · microphone off",
  listening: "Listening for a total · up to 1 min",
  reconnecting: "Reconnecting microphone · up to 1 min",
  detected: "Amount detected · microphone off",
  timeout: "No clear amount in 1 min · microphone off",
  stopped: "Listening stopped · microphone off",
  blocked: "Microphone blocked · tap Try again",
  unavailable: "Speech recognition unavailable · type an amount",
  error: "Speech recognition stopped · tap Try again",
};
export default function AccountWorkspace(props: Props) {
  return (
    <AnimationProvider>
      <WorkspaceContent {...props} />
    </AnimationProvider>
  );
}
function WorkspaceContent(p: Props) {
  const { data, currency, tab, busy } = p,
    { reduced, systemReduced, toggle } = useAnimationPreference();
  const [chatOpen, setChatOpen] = useState(false),
    dialog = useRef<HTMLDialogElement>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false),
    checkoutDialog = useRef<HTMLDialogElement>(null);
  const [detected, setDetected] = useState<CashierDetection | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settingsError, setSettingsError] = useState("");
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const autoListening = useSyncExternalStore(
    subscribeAutoListening,
    useCallback(() => readAutoListening(data.user.id), [data.user.id]),
    () => false,
  );
  const onAmount = useCallback((amount: CashierDetection) => {
    setDetected(amount);
    setCheckoutOpen(true);
  }, []);
  const microphone = useCashierListener({
    userId: data.user.id,
    enabled: autoListening,
    suspended: checkoutOpen || chatOpen || settingsOpen || busy || p.suspendAutoListening,
    currency,
    onAmount,
  });
  const closeCheckout = () => {
    setCheckoutOpen(false);
    setDetected(null);
  };
  const openCheckout = () => {
    microphone.stop();
    setDetected(null);
    setCheckoutOpen(true);
  };
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
    else settingsDialog.current?.close();
  }, [settingsOpen]);
  useEffect(() => {
    if (checkoutOpen) checkoutDialog.current?.showModal();
    else checkoutDialog.current?.close();
  }, [checkoutOpen]);
  useEffect(() => {
    if (chatOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [chatOpen]);
  const current = data.totals[currency],
    analytics = data.analytics[currency],
    home = data.adaptiveHome[currency];
  const subscriptions = data.subscriptions.filter((s) => s.currency === currency),
    recurringMinor = subscriptions.reduce((sum, s) => sum + s.monthMinor, 0);
  const monthlyBudget = home.plan.monthlyBudgetMinor || 0;
  const currencies: Currency[] = data.user.demoProfile
    ? [...new Set<Currency>(["USD", ...data.accounts.map((a) => a.currency)])]
    : ["KZT", "USD", "EUR"];
  const recent = data.entries.filter((e) => !e.voidedAt && e.currency === currency).slice(0, 6);
  const chart = useMemo(
    () =>
      analytics.monthly.map((m) => ({
        key: m.month,
        label: new Date(m.month + "-01T12:00:00Z").toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        value: m.expenseMinor,
        valueLabel: formatMoney(m.expenseMinor, currency),
      })),
    [analytics.monthly, currency],
  );
  const label =
    nav.find((n) => n.id === tab)?.label || (tab === "accounts" ? "Accounts" : "pennybot");
  const openChat = () => setChatOpen(true);
  const heading =
    tab === "overview"
      ? "Your money, at a glance."
      : tab === "entries"
        ? "Every little transaction."
        : tab === "subscriptions"
          ? "Subscriptions, with clarity."
          : tab === "payments"
            ? "Your payments. Your approval."
            : tab === "activity"
              ? "A clear trail of every step."
              : "Your accounts, together.";
  return (
    <WorkspaceFrame kind="personal">
      <div className="reading-progress" aria-hidden="true" />
      <aside className="sidebar">
        <WorkspaceBrand />
        <div className="workspace-label">WORKSPACE</div>
        <WorkspaceNavigation
          items={nav}
          active={tab}
          onNavigate={p.onTab}
          subscriptionCount={subscriptions.filter((s) => s.reviewRequested).length}
        />
        <WorkspaceAssistant onOpen={openChat} />
        <div className="sidebar-bottom">
          <span className="sandbox-dot" />
          <div>
            <strong>{data.user.demoProfile ? "Demo workspace" : "Personal workspace"}</strong>
            <small>
              {data.user.demoProfile
                ? "Fictional data. Your own copy."
                : "Your records. Your control."}
            </small>
          </div>
          <ShieldCheck size={18} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="Accounts"
              title="Accounts"
              onClick={() => p.onTab("accounts")}
            >
              <Wallet size={18} />
            </button>
            <button
              className="icon-button motion-toggle"
              aria-label="Reduce animations"
              aria-pressed={reduced}
              disabled={systemReduced}
              onClick={toggle}
            >
              <Wind size={18} />
              <span>{reduced ? "Calm" : "Motion"}</span>
            </button>
            <span className="demo-label">
              <span />
              {data.user.demoProfile ? "DEMO MODE" : "PRIVATE"}
            </span>
            <div className="persona-control">
              <span className="avatar">{data.user.name.slice(0, 2).toUpperCase()}</span>
              <strong>{data.user.name}</strong>
            </div>
            <button
              className="icon-button"
              aria-label="User settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={18} />
            </button>
            <button
              className="icon-button notification"
              aria-label="View agent activity"
              onClick={() => p.onTab("activity")}
            >
              <Bell size={18} />
              <span />
            </button>
            <button
              className="icon-button"
              aria-label={data.user.demoProfile ? "Switch profile" : "Sign out"}
              disabled={busy}
              onClick={p.signOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "overview"
                  ? `YOUR MONEY, ${data.user.name.toUpperCase()}`
                  : "YOUR WORKSPACE"}
              </div>
              <h1>{heading}</h1>
              <p>
                {tab === "overview"
                  ? "Your money, at a glance. A little more clarity for what’s next."
                  : tab === "subscriptions"
                    ? "Review the charges you keep. Your bank subscriptions stay under your control."
                    : tab === "payments"
                      ? "Prepared by pennybot. Always approved by you."
                      : tab === "activity"
                        ? "What changed, when it changed, and how it was confirmed."
                        : "Your accounts and confirmed records, all in one place."}
              </p>
            </div>
            <button className="outline-button ask-button" onClick={openChat}>
              <Sparkles size={17} />
              Ask pennybot
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div
            className="data-notice"
            aria-label={data.user.demoProfile ? "Demo data" : "Private data"}
          >
            <ShieldCheck size={16} />
            <span>
              <strong>{data.user.demoProfile ? "Demo workspace." : "Private workspace."}</strong>{" "}
              {data.user.demoProfile
                ? "Fictional sample data. PayPal Sandbox payments only."
                : "Your personal ledger. Sandbox checkout uses test funds only."}
            </span>
            <span className="notice-right">
              You confirm every change
              <span className="status-dot" />
            </span>
          </div>
          {p.error && (
            <div className="error-banner" role="alert">
              {p.error}
              <button className="icon-button" onClick={p.clearError} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {p.notice && (
            <div className="ledger-success" role="status">
              <Check size={17} />
              {p.notice}
            </div>
          )}
          <div className="workspace-controls">
            <label className="ledger-currency-picker">
              Currency
              <select
                aria-label="Workspace currency"
                value={currency}
                onChange={(e) => p.onCurrency(e.target.value as Currency)}
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="workspace-control-actions">
              <button className="outline-button" onClick={openCheckout}>
                <Ear size={17} />
                Checkout assist
              </button>
              <button
                className="outline-button"
                onClick={
                  tab === "payments"
                    ? () => p.onPay()
                    : tab === "subscriptions"
                      ? p.addSubscription
                      : p.newEntry
                }
              >
                <Plus size={15} />
                {tab === "payments"
                  ? "New Sandbox payment"
                  : tab === "subscriptions"
                    ? "Add subscription record"
                    : "New transaction"}
              </button>
            </div>
          </div>
          {autoListening && (
            <div
              className="cashier-microphone"
              data-state={microphone.status}
              aria-label="Automatic checkout listening"
            >
              <span role="status">
                <Mic size={15} />
                {microphoneLabels[microphone.status]}
              </span>
              {(["listening", "reconnecting", "paused"] as CashierStatus[]).includes(
                microphone.status,
              ) ? (
                <button type="button" onClick={microphone.stop}>
                  <Square size={12} />
                  Stop listening
                </button>
              ) : (
                microphone.status !== "unavailable" && (
                  <button
                    type="button"
                    onClick={microphone.restart}
                    disabled={busy || checkoutOpen}
                  >
                    Try again
                  </button>
                )
              )}
            </div>
          )}
          {tab === "overview" && (
            <>
              <Reveal className="summary-reveal">
                <section className="summary-strip" aria-label="Monthly overview">
                  <div className="summary-main">
                    <div className="stat-label">
                      Total spent this month
                      <span className="tiny-icon">
                        <ArrowUpRight size={13} />
                      </span>
                    </div>
                    <div className="summary-value">
                      {formatMoney(current.expenseMinor, currency)}
                      {analytics.changePercent !== null && (
                        <span
                          className={`change ${analytics.changePercent <= 0 ? "positive" : ""}`}
                        >
                          {analytics.changePercent > 0 ? "+" : ""}
                          {analytics.changePercent}%
                        </span>
                      )}
                    </div>
                    <small>
                      {analytics.changePercent === null
                        ? "From confirmed transactions"
                        : "vs. previous full month"}
                    </small>
                    <div className="summary-chart">
                      <WorkspaceBars points={chart} />
                    </div>
                  </div>
                  <div className="summary-secondary">
                    <span className="stat-label">
                      {monthlyBudget ? "Monthly budget" : "Account balance"}
                    </span>
                    <strong>{formatMoney(monthlyBudget || current.balanceMinor, currency)}</strong>
                    {monthlyBudget > 0 ? (
                      <>
                        <div className="mini-progress">
                          <span
                            style={{
                              width: `${Math.min(100, (current.expenseMinor / monthlyBudget) * 100)}%`,
                            }}
                          />
                        </div>
                        <small>
                          {formatMoney(Math.abs(monthlyBudget - current.expenseMinor), currency)}{" "}
                          {current.expenseMinor > monthlyBudget ? "over budget" : "left to spend"}
                        </small>
                      </>
                    ) : (
                      <small>
                        {data.accounts.filter((a) => a.currency === currency).length} accounts · no
                        currency conversion
                      </small>
                    )}
                    <button
                      className="text-button workspace-summary-link"
                      onClick={() =>
                        p.onCard(home.cards.find((c) => c.kind === "debts") || home.cards[0])
                      }
                    >
                      {monthlyBudget ? "Edit budget" : "Set your budget"}
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                  <div className="summary-secondary">
                    <span className="stat-label">Subscriptions</span>
                    <strong>
                      {formatMoney(recurringMinor, currency)}
                      <small> this month</small>
                    </strong>
                    <div className="subscriber-icons">
                      {subscriptions.slice(0, 4).map((s, i) => (
                        <span key={s.key} className={`sub-icon sub-${i}`}>
                          {s.name.slice(0, 1)}
                        </span>
                      ))}
                      <span className="subscribed-count">{subscriptions.length} tracked</span>
                    </div>
                    <small>Recorded charges, not a future bill</small>
                  </div>
                </section>
              </Reveal>
              <div className="section-heading">
                <div>
                  <h2>
                    Adaptive Home{" "}
                    <span className="ai-tag">
                      <Sparkles size={11} />
                      FOR YOU
                    </span>
                  </h2>
                  <p>Your usual payments and what matters right now.</p>
                </div>
                <span className="ranking-caption">
                  <SlidersHorizontal size={13} />
                  Next review {home.nextReview}
                </span>
              </div>
              <PersonalAdaptiveHome home={home} busy={busy} onAction={p.onCard} onPay={p.onPay} />
              <div className="section-heading recent-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>Your latest transactions, at a glance.</p>
                </div>
                <button className="text-button" onClick={() => p.onTab("entries")}>
                  View all transactions
                  <ArrowRight size={15} />
                </button>
              </div>
              <section className="recent-table">
                <div className="recent-table-head">
                  <span>Transaction</span>
                  <span>Category</span>
                  <span>Date</span>
                  <span>Amount</span>
                </div>
                {recent.map((e, i) => (
                  <div className="recent-row" key={e.id}>
                    <span className="recent-merchant">
                      <span className={`merchant-avatar merchant-color-${i % 4}`}>
                        {e.description.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{e.description}</strong>
                        <small>
                          {e.source === "pennybot" ? "Reviewed with pennybot" : "Confirmed record"}
                        </small>
                      </span>
                    </span>
                    <span className="category-badge">{categoryLabels[e.category]}</span>
                    <span className="recent-date">{e.date}</span>
                    <strong className={e.kind === "income" ? "income" : "expense"}>
                      {e.kind === "income" ? "+" : "−"}
                      {formatMoney(e.amountMinor, e.currency)}
                    </strong>
                  </div>
                ))}
                {!recent.length && (
                  <div className="empty-state">
                    <Wallet size={28} />
                    <h3>Your first step starts here.</h3>
                    <p>Add an account, then record an expense or income.</p>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "entries" && (
            <>
              <section className="workspace-analytics">
                <div className="panel">
                  <div className="section-heading">
                    <h2>Spending rhythm</h2>
                    <span>Last six months</span>
                  </div>
                  <WorkspaceBars points={chart} large />
                </div>
                <div className="panel">
                  <h2>Spending by category</h2>
                  {analytics.categories.map((c) => (
                    <div className="workspace-category" key={c.category}>
                      <span>{categoryLabels[c.category]}</span>
                      <strong>{formatMoney(c.amountMinor, currency)}</strong>
                    </div>
                  ))}
                  {!analytics.categories.length && <p>No expenses recorded this month.</p>}
                </div>
              </section>
              <section className="ledger-panel ledger-entries-panel">
                <div className="ledger-section-line">
                  <h2>
                    Transaction journal <span className="ledger-count">{data.entries.length}</span>
                  </h2>
                  <label className="ledger-search">
                    <Search size={16} />
                    <input
                      value={p.search}
                      onChange={(e) => p.onSearch(e.target.value)}
                      placeholder="Search transactions"
                      aria-label="Search transactions"
                    />
                  </label>
                </div>
                <FinanceGrid
                  entries={data.entries}
                  accounts={data.accounts}
                  search={p.search}
                  onVoid={p.onVoid}
                />
                <p className="ledger-muted">
                  Voiding preserves history and changes the ledger only. It does not refund a
                  payment.
                </p>
              </section>
            </>
          )}
          {tab === "subscriptions" && (
            <section className="ledger-panel">
              <div className="section-heading">
                <h2>Your recorded subscriptions</h2>
                <span>
                  {subscriptions.length} tracked · {currency}
                </span>
              </div>
              <div className="workspace-table-wrap">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Subscription</th>
                      <th>Latest charge</th>
                      <th>This month</th>
                      <th>Last recorded</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => (
                      <tr key={s.key}>
                        <td>
                          <strong>{s.name}</strong>
                          <small>{s.count} recorded charges</small>
                        </td>
                        <td>{formatMoney(s.amountMinor, s.currency)}</td>
                        <td>{formatMoney(s.monthMinor, s.currency)}</td>
                        <td>{s.lastDate}</td>
                        <td>
                          <button
                            className="outline-button"
                            disabled={busy}
                            onClick={() => p.onSubscription(s)}
                          >
                            {s.reviewRequested ? "Clear review" : "Flag for review"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!subscriptions.length && (
                <div className="empty-state">
                  <CreditCard size={28} />
                  <h3>Only what you actually record.</h3>
                  <p>Add a subscription expense to track it here.</p>
                  <button className="outline-button" onClick={p.addSubscription}>
                    Add subscription record
                  </button>
                </div>
              )}
              <p className="ledger-muted">
                A review flag is a reminder. It does not cancel merchant billing.
              </p>
            </section>
          )}
          {tab === "payments" && (
            <>
              <div className="data-notice">
                <ShieldCheck size={16} />
                <span>
                  PayPal Sandbox · test funds · paid to Penny’s configured Sandbox merchant. Your
                  personal ledger balance stays separate.
                </span>
              </div>
              {!data.paypalConfigured && (
                <div className="error-banner">
                  PayPal Sandbox is currently unavailable. You can still review transactions and
                  manage your accounts.
                </div>
              )}
              <section className="ledger-panel">
                <div className="section-heading">
                  <h2>Payment history</h2>
                  <span>{data.payments.length} orders</span>
                </div>
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Payment</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{payment.description}</strong>
                            <small>{payment.paypalOrderId || "Preparing Sandbox checkout"}</small>
                          </td>
                          <td>{formatMoney(payment.amountMinor, "USD")}</td>
                          <td>
                            <span
                              className={`workspace-status ${payment.status === "COMPLETED" ? "complete" : ""}`}
                            >
                              {payment.status}
                            </span>
                          </td>
                          <td>{new Date(payment.createdAt).toLocaleDateString("en-US")}</td>
                          <td>
                            {payment.status !== "COMPLETED" && payment.approvalUrl && (
                              <div className="workspace-payment-actions">
                                <button className="text-button" onClick={() => p.onResume(payment)}>
                                  Open PayPal
                                </button>
                                <button
                                  className="outline-button"
                                  disabled={busy}
                                  onClick={() => p.onComplete(payment)}
                                >
                                  Complete payment
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.payments.length && (
                  <div className="empty-state">
                    <Wallet size={28} />
                    <h3>A little review before you pay.</h3>
                    <p>
                      Create a Sandbox payment or use a usual-purchase shortcut. You approve in
                      Penny, then in PayPal, then confirm completion.
                    </p>
                    <button className="dark-button" onClick={() => p.onPay()}>
                      Prepare Sandbox payment
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "activity" && (
            <section className="ledger-panel">
              <div className="section-heading">
                <h2>Agent activity</h2>
                <span>Only your workspace</span>
              </div>
              <div className="workspace-timeline">
                {data.activity.map((a) => (
                  <article key={a.id}>
                    <span className="workspace-event-icon">
                      {a.kind === "payment" ? (
                        <Wallet size={18} />
                      ) : a.kind === "assistant" ? (
                        <Sparkles size={18} />
                      ) : (
                        <Check size={18} />
                      )}
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                      <small>{new Date(a.createdAt).toLocaleString("en-US")}</small>
                    </div>
                  </article>
                ))}
              </div>
              {!data.activity.length && (
                <div className="empty-state">
                  <Activity size={28} />
                  <h3>A clear trail, from the first step.</h3>
                  <p>Confirmed records and assistant actions will appear here.</p>
                </div>
              )}
            </section>
          )}
          {tab === "accounts" && (
            <>
              <div className="section-heading">
                <h2>Your accounts</h2>
                <button className="outline-button" onClick={p.newAccount}>
                  <Plus size={15} />
                  New account
                </button>
              </div>
              <div className="ledger-account-grid">
                {data.accounts.map((a) => (
                  <section className="ledger-panel" key={a.id}>
                    <div className="ledger-section-line">
                      <span className="ledger-round-icon">
                        <Wallet size={20} />
                      </span>
                      <span className="ledger-currency-tag">{a.currency}</span>
                    </div>
                    <h2>{a.name}</h2>
                    <strong className="ledger-account-amount">
                      {formatMoney(a.balanceMinor, a.currency)}
                    </strong>
                    <p className="ledger-muted">
                      Opening balance: {formatMoney(a.openingMinor, a.currency)} · {a.kind}
                    </p>
                    <button className="outline-button" onClick={() => p.onRecordAccount(a)}>
                      Record a transaction
                    </button>
                  </section>
                ))}
              </div>
              {!data.accounts.length && (
                <div className="empty-state">
                  <Wallet size={28} />
                  <h3>Your own starting point.</h3>
                  <button className="dark-button" onClick={p.newAccount}>
                    Create account
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "bot" && p.botPanel}
        </main>
        <footer className="footer">
          <span>Penny · a little clarity for your money.</span>
          <span>
            {data.user.demoProfile ? "Fictional sample data" : "Private records"} · {currency}
          </span>
        </footer>
      </div>
      <button className="floating-chat" aria-label="Chat with pennybot" onClick={openChat}>
        <Sparkles size={20} />
        <span>Ask pennybot</span>
      </button>
      <dialog
        ref={settingsDialog}
        className="workspace-checkout-dialog workspace-settings-dialog"
        aria-label="User settings"
        onCancel={() => setSettingsOpen(false)}
      >
        <header>
          <strong>User settings</strong>
          <button
            className="icon-button"
            aria-label="Close user settings"
            onClick={() => setSettingsOpen(false)}
          >
            <X size={20} />
          </button>
        </header>
        <section className="checkout-assist">
          <span className="checkout-assist-badge">
            <Ear size={17} />
            CHECKOUT ASSIST
          </span>
          <h2>Catch the total, automatically.</h2>
          <label className="checkout-auto-setting">
            <input
              type="checkbox"
              aria-label="Auto listening when I open Penny"
              checked={autoListening}
              disabled={busy}
              onChange={(e) => {
                const enabled = e.target.checked;
                if (!enabled) microphone.stop();
                setSettingsError(
                  writeAutoListening(data.user.id, enabled)
                    ? ""
                    : "Your browser could not save this setting. Listening is stopped for this visit; allow site storage to remember changes.",
                );
              }}
            />
            <span>
              <strong>Auto listening when I open Penny</strong>
              <small>
                Remember for this account on this device. Listen in the background of the open Penny
                page for up to one minute. A clear spoken total opens an editable confirmation;
                otherwise the microphone turns off.
              </small>
            </span>
          </label>
          <p>
            The dashboard stays open while listening. You can stop the microphone at any time. It
            turns off when Penny is hidden or another dialog is open.
          </p>
          <p>
            Only you confirm an expense or Sandbox payment. Recognition cannot identify the speaker
            or the merchant.
          </p>
          {settingsError && (
            <p className="checkout-amount-error" role="alert">
              {settingsError}
            </p>
          )}
          <small className="checkout-privacy">
            English speech. Microphone permission is required; your browser may ask for a tap to
            start. Its speech service may process audio. Penny does not record or store microphone
            audio or captions.
          </small>
          <div className="checkout-listening-controls">
            <button className="dark-button" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
            {!data.user.demoProfile && (
              <button
                className="outline-button"
                onClick={() => {
                  setSettingsOpen(false);
                  p.openPassword();
                }}
              >
                Change password
              </button>
            )}
          </div>
        </section>
      </dialog>
      <dialog
        ref={checkoutDialog}
        className="workspace-checkout-dialog"
        aria-label="Checkout assist"
        onCancel={closeCheckout}
      >
        <header>
          <strong>Checkout assist</strong>
          <button
            className="icon-button"
            aria-label="Close checkout assist"
            onClick={closeCheckout}
          >
            <X size={20} />
          </button>
        </header>
        {checkoutOpen && (
          <CheckoutAssist
            detected={detected}
            currency={currency}
            accountCurrencies={data.accounts.map((a) => a.currency)}
            busy={busy}
            onRecord={(a) => {
              closeCheckout();
              p.onCheckoutRecord(a);
            }}
            onPayment={(a) => {
              closeCheckout();
              p.onCheckoutPayment(a);
            }}
          />
        )}
      </dialog>
      <dialog
        ref={dialog}
        className="workspace-assistant-dialog"
        onCancel={() => setChatOpen(false)}
      >
        <header className="chat-header">
          <span className="brand-mark small">
            <Sparkles size={19} />
          </span>
          <div>
            <strong>pennybot, your money companion</strong>
            <small>Answers from your workspace</small>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={() => setChatOpen(false)}
          >
            <X size={20} />
          </button>
        </header>
        {chatOpen && p.botPanel}
      </dialog>
    </WorkspaceFrame>
  );
}
