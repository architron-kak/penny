"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { AnimationProvider, useAnimationPreference } from "./animation-provider";
import { ChartBar, Reveal } from "./reveal";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  CreditCard,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  Search,
  Wind,
  Send,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Wallet,
  X,
} from "lucide-react";
import type {
  HomeCard,
  HomeData,
  PersonaId,
  Subscription,
  Suggestion,
  Transaction,
} from "@/lib/types";
import { money } from "@/lib/money";
import type {
  ChatAction,
  ChatContext,
  ChatReply,
  PlanningCommand,
  PlanningView,
} from "@/lib/planning-types";
import VoiceInput from "./voice-input";
const PlanningPanel = dynamic(() => import("./planning-panel"), { ssr: false });
const TransactionGrid = dynamic(() => import("./transaction-grid"), {
  ssr: false,
  loading: () => (
    <div className="loading-table">
      <LoaderCircle className="spin" /> Loading transactions…
    </div>
  ),
});
const SubscriptionGrid = dynamic(() => import("./subscription-grid"), {
  ssr: false,
  loading: () => (
    <div className="loading-table">
      <LoaderCircle className="spin" /> Loading subscriptions…
    </div>
  ),
});
type Tab = "overview" | "transactions" | "subscriptions" | "payments" | "activity";
type Message = { role: "assistant" | "user"; text: string; reply?: ChatReply; actionId?: string };
const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowDownLeft },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "activity", label: "Agent activity", icon: Activity },
] as const;
async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" as const }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <Sprout size={small ? 19 : 25} strokeWidth={2} />
    </span>
  );
}
const titleCase = (text: string) => text.replace(/\b\w/g, (c) => c.toUpperCase());

export default function Dashboard() {
  return (
    <AnimationProvider>
      <DashboardContent />
    </AnimationProvider>
  );
}

function DashboardContent() {
  const [user, setUser] = useState<PersonaId>("student");
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnOrder, setReturnOrder] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatContext, setChatContext] = useState<ChatContext | undefined>();
  const [queuedQuestion, setQueuedQuestion] = useState<{
    text: string;
    context: ChatContext;
  } | null>(null);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hi, I’m pennybot. Ask me about your spending, subscriptions, or how approved payments work.",
    },
  ]);
  const [merchantFilter, setMerchantFilter] = useState("");
  const requestId = useRef(0);
  const initialized = useRef(false);
  const refreshController = useRef<AbortController | null>(null);
  const snapshot = useRef("");
  const chatRequestId = useRef(0);
  const { reduced, systemReduced, toggle: toggleMotion } = useAnimationPreference();
  const chatEnd = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async (active: PersonaId, quiet = false) => {
    const id = ++requestId.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await request<HomeData>(
        `/api/home?user=${active}`,
        undefined,
        controller.signal,
      );
      if (id === requestId.current) {
        const serialized = JSON.stringify(result);
        if (snapshot.current !== serialized) {
          snapshot.current = serialized;
          setData(result);
        }
        setError("");
      }
    } catch (e) {
      if (id === requestId.current && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(
    () => () => {
      refreshController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("user");
    const active: PersonaId =
      selected === "family" || selected === "freelancer" ? selected : "student";
    setUser(active);
    if (params.get("checkout") === "return" && params.get("token"))
      setReturnOrder(params.get("token"));
    if (params.get("checkout") === "cancel")
      setToast("PayPal approval was cancelled. No capture was requested.");
    initialized.current = true;
    void refresh(active);
  }, [refresh]);
  useEffect(() => {
    if (!initialized.current) return;
    const poll = () => {
      if (document.visibilityState === "visible") void refresh(user, true);
    };
    const interval = setInterval(poll, 30000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [user, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (chatOpen)
      chatEnd.current?.scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "nearest",
      });
  }, [messages, chatBusy, chatOpen, reduced]);
  useEffect(() => {
    if (!payment && !returnOrder && !chatOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setPayment(null);
        setChatOpen(false);
        if (returnOrder) {
          setReturnOrder(null);
          window.history.replaceState({}, "", `/?user=${user}`);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payment, returnOrder, chatOpen, busy, user]);
  const dialogSelector =
    payment || returnOrder ? ".payment-modal" : chatOpen ? ".chat-panel" : null;
  useEffect(() => {
    if (!dialogSelector) return;
    const dialog = document.querySelector<HTMLElement>(dialogSelector);
    if (!dialog) return;
    const previous = document.activeElement;
    const focusable = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ];
    focusable()[0]?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [dialogSelector]);
  function switchPersona(next: PersonaId) {
    if (next === user) return;
    setUser(next);
    setPayment(null);
    setSearch("");
    setMerchantFilter("");
    chatRequestId.current++;
    setChatBusy(false);
    setChatContext(undefined);
    setQueuedQuestion(null);
    setMessages([
      {
        role: "assistant",
        text: "A fresh perspective for this persona. What would you like to know?",
      },
    ]);
    window.history.replaceState({}, "", `/?user=${next}`);
    void refresh(next);
  }
  const navigate = useCallback((next: Tab) => {
    setTab(next);
    setSearch("");
    setMerchantFilter("");
  }, []);
  const openCard = useCallback((card: HomeCard) => {
    setChatOpen(true);
    setQueuedQuestion({
      text: card.headline || "Explain this card",
      context: { topic: card.topic || "overview", entityId: card.entityId },
    });
  }, []);
  const trackRefund = useCallback((transaction: Transaction) => {
    setChatOpen(true);
    setQueuedQuestion({
      text: "Track a refund for this purchase",
      context: { topic: "refunds", entityId: transaction.id },
    });
  }, []);
  async function dismiss(suggestion: Suggestion) {
    setBusy(true);
    try {
      await request(`/api/suggestions/${suggestion.id}/dismiss`, { user });
      await refresh(user, true);
      setToast("Suggestion dismissed. No payment was created.");
      setPayment(null);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!payment) return;
    setBusy(true);
    try {
      const result = await request<{ approvalUrl: string }>(
        `/api/suggestions/${payment.id}/approve`,
        { user, approved: true, expectedAmount: payment.amount },
      );
      window.location.assign(result.approvalUrl);
    } catch (e) {
      setToast((e as Error).message);
      setBusy(false);
    }
  }
  async function capture() {
    if (!returnOrder) return;
    setBusy(true);
    try {
      const result = await request<{ status: string }>("/api/paypal/capture", {
        orderId: returnOrder,
        userApproved: true,
      });
      setReturnOrder(null);
      window.history.replaceState({}, "", `/?user=${user}`);
      setTab("payments");
      await refresh(user, true);
      setToast(
        result.status === "COMPLETED"
          ? "Payment complete. Your Sandbox capture is recorded."
          : `Payment status: ${result.status}. We'll check for updates.`,
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelSubscription(sub: Subscription) {
    setBusy(true);
    try {
      await request(`/api/subscriptions/${sub.id}`, {
        user,
        action: sub.status === "active" ? "suggest-cancel" : "undo",
      });
      await refresh(user, true);
      setToast(
        sub.status === "active"
          ? "Cancellation suggestion saved locally. Contact the merchant to actually cancel."
          : "Cancellation suggestion removed.",
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const chat = useCallback(
    async (question = chatInput, nextContext = chatContext) => {
      if (!question.trim()) return;
      setChatInput("");
      setMessages((previous) => [...previous, { role: "user", text: question }]);
      setChatBusy(true);
      const activeChatRequest = ++chatRequestId.current;
      try {
        const result = await request<ChatReply>("/api/chat", {
          user,
          message: question,
          context: nextContext,
        });
        if (activeChatRequest !== chatRequestId.current) return;
        setChatContext(result.context);
        setMessages((previous) => [
          ...previous,
          { role: "assistant", text: result.answer, reply: result, actionId: crypto.randomUUID() },
        ]);
      } catch (e) {
        if (activeChatRequest === chatRequestId.current)
          setMessages((previous) => [
            ...previous,
            { role: "assistant", text: (e as Error).message },
          ]);
      } finally {
        if (activeChatRequest === chatRequestId.current) setChatBusy(false);
      }
    },
    [chatInput, chatContext, user],
  );
  useEffect(() => {
    if (!queuedQuestion) return;
    setQueuedQuestion(null);
    void chat(queuedQuestion.text, queuedQuestion.context);
  }, [queuedQuestion, chat]);
  async function previewPlanning(command: PlanningCommand) {
    setChatBusy(true);
    const active = ++chatRequestId.current;
    try {
      const reply = await request<ChatReply>("/api/planning/preview", { user, command });
      if (active !== chatRequestId.current) return;
      setChatContext(reply.context);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: reply.answer, reply, actionId: crypto.randomUUID() },
      ]);
    } catch (e) {
      if (active === chatRequestId.current)
        setMessages((previous) => [...previous, { role: "assistant", text: (e as Error).message }]);
    } finally {
      if (active === chatRequestId.current) setChatBusy(false);
    }
  }
  async function confirmChatAction(action: ChatAction, actionId: string) {
    if (action.paymentId) {
      const suggestion = data?.suggestions.find((s) => s.id === action.paymentId);
      if (suggestion) setPayment(suggestion);
      return;
    }
    if (!action.command || completedActions.includes(actionId)) return;
    setBusy(true);
    const activeUser = user;
    try {
      const result = await request<{ planning: PlanningView }>("/api/planning", {
        user: activeUser,
        command: action.command,
        confirmed: true,
        requestId: actionId,
      });
      setCompletedActions((previous) => [...previous, actionId]);
      await refresh(activeUser, true);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text:
            action.command?.type === "savings-save"
              ? `Savings goal saved after your confirmation. No money was moved.`
              : `Saved after your confirmation. Available balance ${money(result.planning.profile.balance || 0)}; headphones up to ${money(result.planning.purchase.limit)}. No PayPal transfer was initiated.`,
          reply: {
            mode: "rules",
            answer: "Saved planning calculation",
            planning: result.planning,
            context: chatContext,
          },
          actionId: crypto.randomUUID(),
        },
      ]);
      setToast("Planning record saved.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const latestReply = [...messages].reverse().find((message) => message.reply)?.reply;
  const heading = tab === "overview" ? "Overview" : navItems.find((n) => n.id === tab)?.label;
  const displayRows = useMemo(
    () =>
      (data?.transactions || []).filter((t) => !merchantFilter || t.merchant === merchantFilter),
    [data?.transactions, merchantFilter],
  );
  const recentTransactions = useMemo(
    () => data?.transactions.slice(0, 5) || [],
    [data?.transactions],
  );
  const cardLayout = data
    ? `${data.persona.id}:${data.cards.map((card) => card.id).join("|")}`
    : "";
  const returned = data?.orders.find((o) => o.id === returnOrder);
  return (
    <div className="app-shell modern-shell">
      <div className="reading-progress" aria-hidden="true" />
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Penny home">
          <Mark />
          <span>
            penny<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-current={tab === item.id ? "page" : undefined}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              {tab === item.id && (
                <m.span
                  className="nav-indicator"
                  layoutId={reduced ? undefined : "active-navigation"}
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  aria-hidden="true"
                />
              )}
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "overview" && <span className="nav-active-dot" />}
              {item.id === "subscriptions" && !!data?.insights.unusedSubscriptions.length && (
                <span className="nav-count">{data.insights.unusedSubscriptions.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-assistant">
          <span className="assistant-orbit">
            <Sparkles size={22} />
          </span>
          <h3>A clearer next step.</h3>
          <p>Plan a purchase, check your budget, or just ask pennybot.</p>
          <button onClick={() => setChatOpen(true)}>
            Talk to pennybot <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="sandbox-dot" />
          <div>
            <strong>Sandbox workspace</strong>
            <small>Good habits. No real money.</small>
          </div>
          <ShieldCheck size={18} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{navItems.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button motion-toggle"
              aria-label="Reduce animations"
              aria-pressed={reduced}
              disabled={systemReduced}
              onClick={toggleMotion}
              title={
                systemReduced
                  ? "Reduced motion follows your device setting"
                  : reduced
                    ? "Enable animations"
                    : "Reduce animations"
              }
            >
              <Wind size={18} />
              <span>{reduced ? "Calm" : "Motion"}</span>
            </button>
            <span className="demo-label">
              <span />
              DEMO MODE
            </span>
            <div className="persona-control">
              <span className="avatar">{data?.persona.initials || "AL"}</span>
              <label className="sr-only" htmlFor="persona">
                Demo persona
              </label>
              <select
                id="persona"
                value={user}
                disabled={busy || !!returnOrder}
                onChange={(e) => switchPersona(e.target.value as PersonaId)}
              >
                <option value="student">Student</option>
                <option value="family">Family</option>
                <option value="freelancer">Freelancer</option>
              </select>
              <ChevronDown size={14} />
            </div>
            <button
              className="icon-button notification"
              aria-label="View agent activity"
              onClick={() => navigate("activity")}
            >
              <Bell size={19} />
              <span />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "overview"
                  ? `YOUR MONEY, ${data?.persona.firstName?.toUpperCase() || "ALEX"}`
                  : "YOUR WORKSPACE"}
              </div>
              <h1>{heading}</h1>
              <p>
                {tab === "overview"
                  ? "Your money, at a glance. A little more clarity for what’s next."
                  : tab === "transactions"
                    ? "Every little transaction, all in one place."
                    : tab === "subscriptions"
                      ? "Keep what you love. Reconsider what you don’t use."
                      : tab === "payments"
                        ? "Prepared by pennybot. Always approved by you."
                        : "A clear trail of what pennybot did, and why."}
              </p>
            </div>
            <button className="outline-button ask-button" onClick={() => setChatOpen(true)}>
              <Sparkles size={17} /> Ask pennybot <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="data-notice">
            <ShieldCheck size={16} />
            <span>
              <strong>Demo workspace.</strong> Sample spending data. PayPal Sandbox payments only.
            </span>
            <span className="notice-right">
              {data?.aiMode === "llm" ? "AI connected" : "Built-in intelligence"}
              <span className="status-dot" />
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => void refresh(user)}>
                Try again <ArrowRight size={14} />
              </button>
            </div>
          )}
          {!data && loading ? (
            <div className="initial-loading">
              <Mark />
              <h2>Finding your money’s rhythm…</h2>
              <p>Preparing your adaptive workspace.</p>
              <LoaderCircle className="spin" />
            </div>
          ) : (
            data && (
              <div className={`content-wrap ${loading ? "is-loading" : ""}`} aria-busy={loading}>
                {tab === "overview" && (
                  <>
                    <Reveal key={data.persona.id} className="summary-reveal">
                      <section className="summary-strip" aria-label="Monthly overview">
                        <div className="summary-main">
                          <div className="stat-label">
                            Total spent this month{" "}
                            <span className="tiny-icon">
                              <ArrowUpRight size={13} />
                            </span>
                          </div>
                          <div className="summary-value">
                            {money(data.insights.currentSpend)}
                            <span
                              className={`change ${data.insights.changePercent <= 0 ? "positive" : ""}`}
                            >
                              {data.insights.changePercent <= 0 ? (
                                <ArrowDownRight size={13} />
                              ) : (
                                <ArrowUpRight size={13} />
                              )}{" "}
                              {Math.abs(data.insights.changePercent)}%
                            </span>
                          </div>
                          <small>vs. previous full month</small>
                          <div className="summary-chart">
                            <MiniChart monthly={data.insights.monthly} />
                          </div>
                        </div>
                        <div className="summary-secondary">
                          <span className="stat-label">Monthly budget</span>
                          <strong>{money(data.persona.monthlyBudget)}</strong>
                          <div className="mini-progress">
                            <span
                              style={{
                                width: `${Math.min(100, (data.insights.currentSpend / data.persona.monthlyBudget) * 100)}%`,
                              }}
                            />
                          </div>
                          <small>
                            {money(Math.abs(data.insights.budgetRemaining))}{" "}
                            {data.insights.budgetRemaining < 0 ? "over budget" : "left to spend"}
                          </small>
                        </div>
                        <div className="summary-secondary">
                          <span className="stat-label">Subscriptions</span>
                          <strong>
                            {money(data.insights.subscriptionTotal)}
                            <small>/ mo</small>
                          </strong>
                          <div className="subscriber-icons">
                            {data.subscriptions.slice(0, 4).map((s, i) => (
                              <span key={s.id} className={`sub-icon sub-${i}`}>
                                {s.merchant.slice(0, 1)}
                              </span>
                            ))}
                            <span className="subscribed-count">
                              {data.subscriptions.length} active
                            </span>
                          </div>
                        </div>
                      </section>
                    </Reveal>
                    <Reveal>
                      <div className="section-heading">
                        <div>
                          <h2>
                            Adaptive Home{" "}
                            <span className="ai-tag">
                              <Sparkles size={11} /> FOR YOU
                            </span>
                          </h2>
                          <p>Your usual payments and what matters right now.</p>
                        </div>
                        <span className="ranking-caption">
                          <SlidersHorizontal size={13} /> Next review{" "}
                          {data.adaptive?.nextReview
                            ? new Date(`${data.adaptive.nextReview}T12:00:00Z`).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric", timeZone: "UTC" },
                              )
                            : "Monday"}
                        </span>
                      </div>
                    </Reveal>
                    <m.section
                      layout={false}
                      className="adaptive-grid"
                      aria-label="Adaptive home: usual purchases and essential information"
                    >
                      {data.cards.map((card, index) => (
                        <m.article
                          layout={reduced ? false : "position"}
                          layoutDependency={cardLayout}
                          transition={{ layout: { type: "spring", stiffness: 260, damping: 28 } }}
                          key={card.id}
                          className={`focus-card card-${card.kind} ${card.payment ? "habit-card" : ""} ${index === 0 ? "top-card" : ""}`}
                        >
                          <Reveal className="card-content" delay={index * 45}>
                            <Card card={card} data={data} onOpen={openCard} onPay={setPayment} />
                          </Reveal>
                        </m.article>
                      ))}
                    </m.section>
                    <Reveal>
                      <div className="section-heading recent-heading">
                        <div>
                          <h2>Recent activity</h2>
                          <p>Your latest transactions, at a glance.</p>
                        </div>
                        <button className="text-button" onClick={() => navigate("transactions")}>
                          View all transactions <ArrowRight size={15} />
                        </button>
                      </div>
                      <RecentTransactions transactions={recentTransactions} />
                    </Reveal>
                    <div className="bottom-note">
                      <Leaf size={14} />
                      <span>Mindful money starts with a little awareness.</span>
                      <span className="bottom-date">
                        Data as of{" "}
                        {new Date(data.seedDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                    </div>
                  </>
                )}
                {tab === "transactions" && (
                  <Reveal key="transactions">
                    <section className="table-section">
                      <div className="table-toolbar">
                        <div>
                          <h2>
                            {merchantFilter || "All transactions"}{" "}
                            <span className="count-badge">{displayRows.length}</span>
                          </h2>
                          <p>Six months of synthetic history + any completed Sandbox payments.</p>
                        </div>
                        <div className="search-input">
                          <Search size={16} />
                          <input
                            aria-label="Search transactions"
                            placeholder="Search transactions…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                      </div>
                      {merchantFilter && (
                        <button className="filter-chip" onClick={() => setMerchantFilter("")}>
                          {merchantFilter}
                          <X size={13} />
                        </button>
                      )}
                      <TransactionGrid
                        transactions={displayRows}
                        search={search}
                        onRefund={trackRefund}
                      />
                      <p className="table-note">
                        Click a column heading to sort. Use its menu to filter. Green amounts are
                        synthetic income.
                      </p>
                    </section>
                  </Reveal>
                )}
                {tab === "subscriptions" && (
                  <Reveal key="subscriptions">
                    <div className="subscription-summary">
                      <div>
                        <span className="stat-label">Monthly recurring cost</span>
                        <h2>
                          {money(data.insights.subscriptionTotal)}
                          <small> / month</small>
                        </h2>
                      </div>
                      <div>
                        <span className="stat-label">
                          Potential savings from unused subscriptions
                        </span>
                        <h2>
                          {money(
                            data.insights.unusedSubscriptions.reduce(
                              (sum, s) => sum + s.monthlyPrice,
                              0,
                            ),
                          )}
                          <small> / month</small>
                        </h2>
                      </div>
                      <ShieldCheck size={33} />
                    </div>
                    <SubscriptionGrid
                      subscriptions={data.subscriptions}
                      asOf={data.seedDate}
                      busy={busy}
                      onAction={cancelSubscription}
                    />
                    <div className="inline-note">
                      <CircleHelp size={17} />
                      Cancellation suggestions are saved locally. Your subscription stays active and
                      billed until you cancel directly with the merchant.
                    </div>
                  </Reveal>
                )}
                {tab === "payments" && (
                  <Reveal key="payments">
                    <div className="section-heading">
                      <div>
                        <h2>Prepared for your review</h2>
                        <p>
                          These payments go to your configured Sandbox merchant, not the retailer.
                        </p>
                      </div>
                      <span className={`pill ${data.paypalReady ? "pill-green" : "pill-amber"}`}>
                        {data.paypalReady ? "Sandbox connected" : "Sandbox credentials needed"}
                      </span>
                    </div>
                    <div className="payment-list">
                      {data.suggestions.map((suggestion) => (
                        <article className="payment-row" key={suggestion.id}>
                          <div className="payment-icon">
                            <Wallet size={22} />
                          </div>
                          <div>
                            <h3>{suggestion.title}</h3>
                            <p>{suggestion.description}</p>
                            <span
                              className={`pill ${suggestion.status === "paid" ? "pill-green" : "pill-neutral"}`}
                            >
                              {suggestion.status}
                            </span>
                          </div>
                          <strong>{money(suggestion.amount)}</strong>
                          {suggestion.status === "proposed" || suggestion.status === "approved" ? (
                            <button
                              className="dark-button"
                              disabled={busy}
                              onClick={() => setPayment(suggestion)}
                            >
                              {suggestion.status === "approved"
                                ? "Continue approval"
                                : "Review payment"}
                              <ArrowUpRight size={15} />
                            </button>
                          ) : (
                            <CheckCheck size={22} />
                          )}
                        </article>
                      ))}
                    </div>
                    <div className="section-heading">
                      <div>
                        <h2>Payment history</h2>
                        <p>Actual PayPal Sandbox orders and their latest recorded status.</p>
                      </div>
                      <Clock3 size={19} />
                    </div>
                    {data.orders.length ? (
                      <div className="order-list">
                        {data.orders.map((order) => (
                          <article key={order.id}>
                            <div>
                              <strong>{money(order.amount)}</strong>
                              <p>Order {order.id}</p>
                              <small>{new Date(order.createdAt).toLocaleString()}</small>
                            </div>
                            <span
                              className={`pill ${order.status === "COMPLETED" ? "pill-green" : "pill-amber"}`}
                            >
                              {order.status}
                            </span>
                            {order.captureId && <code>Capture: {order.captureId}</code>}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={<Wallet size={27} />}
                        title="Your first payment starts with you"
                        text="Review a suggestion above. pennybot never moves money on its own."
                      />
                    )}
                  </Reveal>
                )}
                {tab === "activity" && (
                  <Reveal key="activity">
                    <section className="activity-panel">
                      <div className="table-toolbar">
                        <div>
                          <h2>A transparent little assistant</h2>
                          <p>
                            Classification, suggestions, and your decisions — recorded as they
                            happen.
                          </p>
                        </div>
                        <span className="pill pill-green">
                          <span className="status-dot" /> Updates every 30s
                        </span>
                      </div>
                      {data.activities.map((item) => (
                        <article className="activity-row" key={item.id}>
                          <span className={`activity-icon ${item.kind}`}>
                            {item.kind === "payment" ? (
                              <Wallet size={17} />
                            ) : item.kind === "user" ? (
                              <Check size={17} />
                            ) : (
                              <Sparkles size={17} />
                            )}
                          </span>
                          <div>
                            <h3>{item.message}</h3>
                            <p>
                              {new Date(item.createdAt).toLocaleString()} · {item.kind}
                            </p>
                          </div>
                        </article>
                      ))}
                      <div className="inline-note">
                        <ShieldCheck size={17} />
                        History is synthetic. This log records real actions performed by this demo.
                      </div>
                    </section>
                  </Reveal>
                )}
              </div>
            )
          )}
        </main>
        <footer>
          <span>
            penny<span className="brand-dot">.</span>{" "}
            <span className="footer-tagline">A little clarity for your money.</span>
          </span>
          <span>
            Built with intention. <Leaf size={12} />
          </span>
        </footer>
      </div>
      <button
        className="floating-chat"
        onClick={() => setChatOpen(true)}
        aria-label="Chat with pennybot"
      >
        <Sparkles size={20} />
        <span>Ask pennybot</span>
      </button>
      <AnimatePresence>
        {toast && (
          <m.div
            key="toast"
            style={{ x: "-50%" }}
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 10 }}
            className="toast"
            role="status"
          >
            <CircleHelp size={19} />
            <span>{toast}</span>
            <button
              className="icon-button"
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={17} />
            </button>
          </m.div>
        )}
      </AnimatePresence>
      {(payment || returnOrder) && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy && !returnOrder) setPayment(null);
          }}
        >
          <section
            className="payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <button
              className="modal-close icon-button"
              disabled={busy}
              onClick={() => {
                setPayment(null);
                setReturnOrder(null);
                window.history.replaceState({}, "", `/?user=${user}`);
              }}
              aria-label="Close payment dialog"
            >
              <X size={21} />
            </button>
            <span className="modal-icon">
              <ShieldCheck size={30} />
            </span>
            <span className="eyebrow">YOU’RE ALWAYS IN CONTROL</span>
            <h2 id="payment-title">
              {returnOrder ? "One last check." : "A little review before you pay."}
            </h2>
            <p>
              {returnOrder
                ? "You’re back from PayPal Sandbox. Click below to explicitly request capture of your approved payment."
                : payment?.description}
            </p>
            <div className="payment-review">
              <span>
                {returnOrder
                  ? returned
                    ? data?.suggestions.find((s) => s.id === returned.suggestionId)?.title
                    : "Checking returned order…"
                  : payment?.title}
              </span>
              <strong>{money(returnOrder ? returned?.amount || 0 : payment?.amount || 0)}</strong>
              <small>USD · PayPal Sandbox · No real money</small>
            </div>
            <div className="payment-steps">
              <span>
                <Check size={15} /> You approve this suggestion
              </span>
              <span>
                <Check size={15} /> You confirm in PayPal Sandbox
              </span>
              <span>
                <Check size={15} /> You complete payment on return
              </span>
            </div>
            {!data?.paypalReady && (
              <div className="setup-note">
                Add your Sandbox client ID and secret to <code>.env.local</code>, then restart the
                app to enable payments.
              </div>
            )}
            {returnOrder ? (
              <button
                className="dark-button wide"
                disabled={busy || !returned || returned.status === "COMPLETED"}
                onClick={() => void capture()}
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{" "}
                {returned?.status === "COMPLETED"
                  ? "Already completed"
                  : "Complete Sandbox payment"}
              </button>
            ) : (
              <>
                <button
                  className="dark-button wide"
                  disabled={busy || !data?.paypalReady}
                  onClick={() => void approve()}
                >
                  {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{" "}
                  Approve & continue to PayPal <ArrowUpRight size={16} />
                </button>
                {payment?.status === "proposed" && !payment.habitMerchant && (
                  <button
                    className="text-button wide"
                    disabled={busy}
                    onClick={() => payment && void dismiss(payment)}
                  >
                    Dismiss suggestion
                  </button>
                )}
              </>
            )}
            <small className="modal-fineprint">
              pennybot never captures a payment automatically.
            </small>
          </section>
        </div>
      )}
      <AnimatePresence>
        {chatOpen && (
          <m.aside
            initial={reduced ? false : { opacity: 0, x: 35 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : 35 }}
            className={`chat-panel ${chatContext ? "planning-chat" : ""}`}
            role="dialog"
            aria-label="Chat with pennybot"
          >
            <div className="chat-header">
              <Mark small />
              <div>
                <strong>pennybot, your money companion</strong>
                <small>
                  <span className="status-dot" />
                  {data?.aiMode === "llm"
                    ? "AI with computed facts"
                    : "Built-in rules · computed facts"}
                </small>
              </div>
              <button
                className="icon-button"
                onClick={() => setChatOpen(false)}
                aria-label="Close assistant"
              >
                <X size={20} />
              </button>
            </div>
            <div className="chat-messages">
              {messages.map((m, index) => (
                <div className={`chat-message ${m.role}`} key={`${user}-${index}`}>
                  {m.role === "assistant" && (
                    <span className="message-spark">
                      <Sparkles size={15} />
                    </span>
                  )}
                  <div className="chat-reply-body">
                    <p>{m.text}</p>
                    {m.reply?.actions?.map((action, actionIndex) => (
                      <button
                        key={actionIndex}
                        className="outline-button chat-confirm-action"
                        disabled={
                          busy ||
                          chatBusy ||
                          (!!m.actionId && completedActions.includes(m.actionId))
                        }
                        onClick={() => void confirmChatAction(action, m.actionId!)}
                      >
                        {m.actionId && completedActions.includes(m.actionId)
                          ? "Saved"
                          : action.label}
                      </button>
                    ))}
                    {m.reply?.preview && (
                      <div className="preview-warning">
                        Trial schedule only — not saved.{" "}
                        {m.reply.preview.firstShortfall
                          ? `First shortfall ${money(m.reply.preview.firstShortfall.amount)} on ${m.reply.preview.firstShortfall.date} (${m.reply.preview.firstShortfall.payment}).`
                          : "All scheduled payments fit."}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatBusy && (
                <div className="chat-message assistant">
                  <LoaderCircle size={16} className="spin" />
                  <p>Taking a look at your numbers…</p>
                </div>
              )}
              {latestReply?.planning && chatContext && (
                <PlanningPanel
                  key={`${user}:${chatContext.topic}:${chatContext.entityId || ""}:${latestReply.answer}`}
                  view={latestReply.planning}
                  context={chatContext}
                  transactions={data?.transactions || []}
                  busy={busy || chatBusy}
                  onPreview={(command) => void previewPlanning(command)}
                  onQuestion={(text, context) => void chat(text, context)}
                />
              )}
              <div ref={chatEnd} />
            </div>
            <div className="chat-suggestions">
              {[
                "Can I afford headphones?",
                "Show my debts",
                "What if my client pays 7 days late?",
              ].map((q) => (
                <button key={q} disabled={chatBusy} onClick={() => void chat(q)}>
                  {q}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
            <VoiceInput
              key={user}
              disabled={busy || chatBusy}
              onTranscript={(text) => setChatInput(text.slice(0, 500))}
            />
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void chat();
              }}
            >
              <input
                aria-label="Message pennybot"
                maxLength={500}
                placeholder="Ask a little money question…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button aria-label="Send message" disabled={chatBusy || !chatInput.trim()}>
                <Send size={17} />
              </button>
            </form>
            <p className="chat-disclaimer">Answers use your persona’s computed demo data.</p>
          </m.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function Why({ card }: { card: HomeCard }) {
  return (
    <span className="why-container" tabIndex={0}>
      <CircleHelp size={13} />
      <span>Why this?</span>
      <span role="tooltip" className="why-tooltip">
        <strong>Priority score: {card.priority}/100</strong>
        {card.reason}
      </span>
    </span>
  );
}
const Card = memo(function Card({
  card,
  onOpen,
  onPay,
}: {
  card: HomeCard;
  data: HomeData;
  onOpen: (card: HomeCard) => void;
  onPay: (payment: Suggestion) => void;
}) {
  const Icon =
    card.kind === "DebtReminder" || card.kind === "IncomeDelay"
      ? Clock3
      : card.kind === "PriceAlert" || card.kind === "SubscriptionAlert"
        ? CreditCard
        : card.kind === "RefundAlert"
          ? ArrowDownLeft
          : card.kind === "PurchaseBudget"
            ? ShoppingBag
            : card.kind === "SuggestedPayment"
              ? Wallet
              : card.kind === "MerchantShortcut"
                ? Coffee
                : Leaf;
  return (
    <>
      <button
        className="insight-card-trigger"
        onClick={() => onOpen(card)}
        aria-label={`Discuss: ${card.headline || card.kind}`}
      >
        <span className="card-icon green">
          <Icon size={19} />
        </span>
        <span className="card-kicker">
          {card.payment
            ? "USUAL PAYMENT"
            : card.topic === "savings"
              ? "SAVINGS GOAL"
              : {
                  DebtReminder: "DEBTS",
                  IncomeDelay: "INCOME FORECAST",
                  PriceAlert: "PRICE CHANGE",
                  SubscriptionAlert: "SUBSCRIPTIONS",
                  RefundAlert: "EXPECTED REFUND",
                  PurchaseBudget: "PURCHASE PLAN",
                  SpendingSummary: "CASH FLOW",
                  CategoryBudget: "BUDGET",
                  SuggestedPayment: "PAYMENT",
                  MerchantShortcut: "SPENDING HABIT",
                }[card.kind]}
        </span>
        <h3>{card.headline}</h3>
        {card.supportingText && <p className="card-supporting">{card.supportingText}</p>}
        <span className="insight-card-footer">
          View details <ArrowUpRight size={16} />
        </span>
      </button>
      {card.payment && (
        <div className="habit-payment">
          <button
            className="dark-button wide"
            disabled={card.payment.status === "paid" || card.payment.status === "dismissed"}
            onClick={() => onPay(card.payment!)}
          >
            <Wallet size={16} />{" "}
            {card.payment.status === "paid"
              ? "Paid today"
              : card.payment.status === "dismissed"
                ? "Skipped today"
                : `Pay ${money(card.payment.amount)}`}
          </button>
          <small>Review first · PayPal Sandbox · no real money</small>
        </div>
      )}
      <Why card={card} />
    </>
  );
});
const MiniChart = memo(function MiniChart({
  monthly,
  large = false,
}: {
  monthly: HomeData["insights"]["monthly"];
  large?: boolean;
}) {
  const max = Math.max(...monthly.map((m) => m.amount), 1);
  return (
    <div
      className={`bar-chart ${large ? "large" : ""}`}
      role="img"
      aria-label={monthly.map((m) => `${m.label}: ${money(m.amount)}`).join(", ")}
    >
      {monthly.map((month, index) => (
        <div className="bar-column" key={month.month}>
          <div className="bar-space">
            <ChartBar
              key={`${month.month}-${month.amount}`}
              height={Math.max((month.amount / max) * 100, 3)}
              current={index === 5}
              label={`${month.label}: ${money(month.amount)}`}
              index={index}
            />
          </div>
          <span className="bar-label">{month.label}</span>
        </div>
      ))}
    </div>
  );
});
const RecentTransactions = memo(function RecentTransactions({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <div className="recent-table">
      <div className="recent-table-head">
        <span>MERCHANT</span>
        <span>CATEGORY</span>
        <span>DATE</span>
        <span>AMOUNT</span>
      </div>
      {transactions.map((t, index) => (
        <div className="recent-row" key={t.id}>
          <span className="recent-merchant">
            <span className={`merchant-avatar merchant-color-${index % 4}`}>
              {/coffee/i.test(t.merchant) ? <Coffee size={18} /> : t.merchant.slice(0, 1)}
            </span>
            <span>
              <strong>{t.merchant}</strong>
              <small>
                {t.source === "synthetic" ? "Synthetic transaction" : "PayPal Sandbox capture"}
              </small>
            </span>
          </span>
          <span>
            <span
              className={`category-badge category-${(t.category || "other").replaceAll(" ", "-")}`}
            >
              {titleCase(t.category || "other")}
            </span>
          </span>
          <span className="recent-date">
            {new Date(`${t.date}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
          <strong className={t.amount < 0 ? "income" : "expense"}>
            {t.amount < 0 ? "+" : "−"}
            {money(Math.abs(t.amount))}
          </strong>
        </div>
      ))}
    </div>
  );
});
function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
