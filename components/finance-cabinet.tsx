"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CirclePlus,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Wallet,
  X,
} from "lucide-react";
import type {
  AccountView,
  Currency,
  DraftView,
  EntryView,
  FinanceOverview,
  PersonalHomeCard,
} from "@/lib/private/types";
import type { Category } from "@/lib/types";
import { amountInput, categoryLabels, formatMoney } from "./personal-money";
import { demoProfiles, type DemoProfile } from "@/lib/private/demo-profiles";
import PersonalAdaptiveHome from "./personal-adaptive-home";
import VoiceInput from "./voice-input";
const FinanceGrid = dynamic(() => import("./finance-grid"), {
  ssr: false,
  loading: () => <p className="ledger-muted">Loading table…</p>,
});
type Tab = "overview" | "entries" | "accounts" | "bot";
type EditValues = {
  accountId: string;
  kind: "income" | "expense";
  amount: string;
  description: string;
  category: Category;
  date: string;
};
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function call<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The service is temporarily unavailable." }));
  if (!response.ok) throw new RequestError(data.error || "Please try again.", response.status);
  return data;
}
function Logo() {
  return (
    <span className="ledger-logo">
      <span>
        <Sprout size={21} />
      </span>
      penny<span className="ledger-logo-dot">.</span>
    </span>
  );
}
function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="ledger-modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="ledger-modal-title"
    >
      <header>
        <h2 id="ledger-modal-title">{title}</h2>
        <button
          type="button"
          className="ledger-icon-button"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const tabs = [
  { id: "overview", label: "Adaptive Home", icon: LayoutDashboard },
  { id: "entries", label: "Transactions", icon: ArrowDownLeft },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "bot", label: "pennybot", icon: Sparkles },
] as const;
export default function FinanceCabinet() {
  const [data, setData] = useState<FinanceOverview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [register, setRegister] = useState(false),
    [tab, setTab] = useState<Tab>("overview"),
    [currency, setCurrency] = useState<Currency>("KZT"),
    [accountId, setAccountId] = useState(""),
    [search, setSearch] = useState("");
  const [accountModal, setAccountModal] = useState(false),
    [edit, setEdit] = useState<EditValues | null>(null),
    [draft, setDraft] = useState<DraftView | null>(null),
    [voiding, setVoiding] = useState<EntryView | null>(null),
    [passwordModal, setPasswordModal] = useState(false);
  const [homePlan, setHomePlan] = useState<{
    currency: Currency;
    debtAmount: string;
    goalName: string;
    goalTarget: string;
    reviewed: boolean;
  } | null>(null);
  const [botInput, setBotInput] = useState(""),
    [useAI, setUseAI] = useState(false),
    [botReply, setBotReply] = useState("");
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const fresh = await call<FinanceOverview>("/api/finance/overview");
    if (!alive.current) return;
    setData(fresh);
    setAccountId((v) => (fresh.accounts.some((a) => a.id === v) ? v : fresh.accounts[0]?.id || ""));
    setCurrency((v) =>
      fresh.accounts.some((a) => a.currency === v) ? v : fresh.accounts[0]?.currency || "KZT",
    );
    return fresh;
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    call<FinanceOverview>("/api/finance/overview", undefined, controller.signal)
      .then((fresh) => {
        if (!alive.current) return;
        setData(fresh);
        setAccountId(fresh.accounts[0]?.id || "");
        setCurrency(fresh.accounts[0]?.currency || "KZT");
      })
      .catch((e) => {
        if (e.name !== "AbortError" && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (e instanceof RequestError && e.status === 401 && data) {
        window.location.replace("/cabinet");
        return;
      }
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function signOut() {
    void work(async () => {
      await call("/api/account/logout", {});
      window.location.replace("/cabinet");
    });
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await work(async () => {
      await call(register ? "/api/account/register" : "/api/account/login", {
        email: f.get("email"),
        password: f.get("password"),
        ...(register
          ? { name: f.get("name"), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
          : {}),
      });
      window.location.replace("/cabinet");
    });
  }
  function openJudgeDemo(profile: DemoProfile) {
    void work(async () => {
      await call("/api/account/demo", { profile });
      window.location.replace("/cabinet");
    });
  }
  const newEntry = () => {
    if (!data?.accounts.length) {
      setAccountModal(true);
      return;
    }
    setEdit({
      accountId: accountId || data.accounts[0].id,
      kind: "expense",
      amount: "",
      description: "",
      category: "other",
      date: data.today,
    });
  };
  function editDraft() {
    if (!draft) return;
    setEdit({
      accountId: draft.accountId,
      kind: draft.kind,
      amount: amountInput(draft.amountMinor),
      description: draft.description,
      category: draft.category,
      date: draft.date,
    });
    setDraft(null);
  }
  const repeat = useCallback(
    (entry: EntryView) => {
      if (!data) return;
      setEdit({
        accountId: entry.accountId,
        kind: entry.kind,
        amount: amountInput(entry.amountMinor),
        description: entry.description,
        category: entry.category,
        date: data.today,
      });
    },
    [data],
  );
  const requestVoid = useCallback((entry: EntryView) => setVoiding(entry), []);
  const homeAction = useCallback(
    (card: PersonalHomeCard) => {
      if (!data) return;
      if (card.action === "repeat" && card.entry) repeat(card.entry);
      else if (card.action === "new-account") setAccountModal(true);
      else if (card.action === "plan") {
        const p = data.adaptiveHome[currency].plan;
        setHomePlan({
          currency,
          debtAmount: amountInput(p.debtMinor),
          goalName: p.goalName,
          goalTarget: amountInput(p.goalTargetMinor),
          reviewed: false,
        });
      } else if (card.action === "accounts") setTab("accounts");
      else {
        setSearch(card.action === "subscriptions" ? "Subscriptions" : "");
        setTab("entries");
      }
    },
    [data, currency, repeat],
  );
  if (loading)
    return (
      <div className="ledger-loading">
        <Logo />
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!data)
    return (
      <div className="ledger-auth" lang="en">
        <section className="ledger-auth-story">
          <Link href="/">
            <Logo />
          </Link>
          <span className="ledger-eyebrow">PERSONAL FINANCE</span>
          <h1>
            Your money.
            <br />
            Your space.
          </h1>
          <p>
            Accounts, income and expenses in one place. Turn an everyday message into a reviewed
            transaction with pennybot.
          </p>
          <div className="ledger-currency-tags">
            <span>₸ KZT</span>
            <span>$ USD</span>
            <span>€ EUR</span>
          </div>
          <div className="ledger-auth-points">
            <span>
              <ShieldCheck size={18} />
              Private access to your records
            </span>
            <span>
              <Wallet size={18} />
              Multiple accounts, separate currencies
            </span>
            <span>
              <Check size={18} />
              Save only after confirmation
            </span>
          </div>
          <Link className="ledger-demo-link" href="/demo">
            Explore PayPal Sandbox <ArrowUpRight size={15} />
          </Link>
        </section>
        <section className="ledger-auth-form">
          {error && (
            <div className="ledger-error" role="alert">
              {error}
            </div>
          )}
          <section className="ledger-judge-access" aria-labelledby="judge-access-title">
            <span className="ledger-eyebrow">QUICK DEMO</span>
            <h2 id="judge-access-title">Try Penny in one click</h2>
            <p>Choose a ready-made profile with accounts and transactions included.</p>
            <div className="ledger-judge-profiles">
              {demoProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  disabled={busy}
                  onClick={() => openJudgeDemo(profile.id)}
                  aria-label={`Open demo ${profile.name}`}
                >
                  <span>
                    <strong>
                      {profile.name} <small>{profile.title}</small>
                    </strong>
                    <span>{profile.description}</span>
                    <small>{profile.currencies}</small>
                  </span>
                  {busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUpRight size={18} />}
                </button>
              ))}
            </div>
            <p className="ledger-judge-note">
              No registration. Fictional data in your own independent workspace.
            </p>
          </section>
          <div className="ledger-auth-divider">or use your personal account</div>
          <div className="ledger-auth-switch">
            <button
              type="button"
              aria-pressed={!register}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={register}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              Create account
            </button>
          </div>
          <h2>{register ? "Create your own workspace" : "Welcome back"}</h2>
          <p>Your personal records stay separate from demo data.</p>
          <form onSubmit={authenticate}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="name"
                  placeholder="What should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={register ? "At least 12 characters" : "Your password"}
              />
            </label>
            <button className="ledger-primary" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}{" "}
              {register ? "Create personal account" : "Sign in to Penny"}
            </button>
          </form>
          <p className="ledger-auth-note">
            {register
              ? "Save your password: email recovery is not available yet."
              : "Passwords are securely hashed. Sessions use HttpOnly cookies."}
          </p>
          <p className="ledger-muted">
            Track the transactions you enter. Bank synchronization is not connected.
          </p>
        </section>
      </div>
    );
  const totals = data.totals[currency],
    selectedAccount = data.accounts.find((a) => a.id === accountId);
  const activeEntries = data.entries.filter((e) => !e.voidedAt && e.currency === currency),
    monthName = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(data.today + "T12:00:00Z"));
  const currencyAccounts = data.accounts.filter((a) => a.currency === currency);
  const displayCurrencies: Currency[] = data.user.demoProfile
    ? [...new Set<Currency>(["USD", ...data.accounts.map((a) => a.currency)])]
    : ["KZT", "USD", "EUR"];
  const botPanel = (
    <section className="ledger-bot ledger-panel">
      <div className="ledger-panel-title">
        <span className="ledger-bot-icon">
          <Sparkles size={21} />
        </span>
        <div>
          <h2>pennybot</h2>
          <p>From a message to a record</p>
        </div>
      </div>
      <p className="ledger-bot-intro">
        Ask about your Adaptive Home, savings or subscriptions. Or describe a transaction to review
        and save.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId) {
            setAccountModal(true);
            return;
          }
          void work(async () => {
            const result = await call<{
              kind: "draft" | "answer";
              draft?: DraftView;
              answer?: string;
            }>("/api/finance/pennybot", { accountId, message: botInput, useAI });
            if (result.draft) {
              setDraft(result.draft);
              setBotReply("Review the amount, account and category. Nothing has been saved yet.");
            } else setBotReply(result.answer || "");
          });
        }}
      >
        <label>
          Account
          <select
            aria-label="Account for pennybot"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={!data.accounts.length}
          >
            {!data.accounts.length && <option value="">Create an account first</option>}
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your message
          <textarea
            aria-label="Your message"
            required
            maxLength={1000}
            value={botInput}
            onChange={(e) => setBotInput(e.target.value)}
            placeholder={
              selectedAccount?.currency === "USD"
                ? "Bought groceries for 24.50 USD"
                : selectedAccount?.currency === "EUR"
                  ? "Bought groceries for 25 EUR"
                  : "Bought groceries for 4500 KZT"
            }
            rows={4}
          />
        </label>
        <VoiceInput disabled={busy || !data.accounts.length} onTranscript={setBotInput} />
        <label className="ledger-consent">
          <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
          <span>
            Use Gemini for categorization
            <small>
              If enabled, your message is sent to Google. Account lists, balances and transaction
              history are excluded.
            </small>
          </span>
        </label>
        <button className="ledger-primary" disabled={busy || !data.accounts.length}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}Ask pennybot
        </button>
      </form>
      {botReply && (
        <p className="ledger-bot-reply" role="status">
          {botReply}
        </p>
      )}
      <div className="ledger-bot-examples">
        <button
          disabled={busy}
          onClick={() =>
            setBotInput(
              selectedAccount?.currency === "USD"
                ? "Bought coffee for 5 USD"
                : selectedAccount?.currency === "EUR"
                  ? "Bought groceries for 25 EUR"
                  : "Bought groceries for 4500 KZT",
            )
          }
        >
          Try an expense <ChevronRight size={14} />
        </button>
        <button disabled={busy} onClick={() => setBotInput("My balance")}>
          Show balance <ChevronRight size={14} />
        </button>
      </div>
      <small className="ledger-muted">A message creates a draft. It does not transfer money.</small>
    </section>
  );
  return (
    <div className="cabinet" lang="en">
      <aside className="ledger-sidebar">
        <Link href="/cabinet">
          <Logo />
        </Link>
        <span className="ledger-sidebar-label">YOUR WORKSPACE</span>
        <nav aria-label="Workspace navigation">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              className={tab === t.id ? "is-active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="ledger-sidebar-foot">
          <span className="ledger-user-avatar">{data.user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{data.user.name}</strong>
            <small>{data.user.demoProfile ? "Demo workspace" : "Personal account"}</small>
          </div>
          <button
            className="ledger-icon-button"
            aria-label="Sign out"
            disabled={busy}
            onClick={signOut}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="ledger-main">
        <header className="ledger-topbar">
          <span>
            <LockKeyhole size={14} />{" "}
            {data.user.demoProfile ? "Demo account" : "Your private workspace"}
          </span>
          <div>
            <Link href="/demo">
              PayPal Sandbox <ArrowUpRight size={13} />
            </Link>
            {!data.user.demoProfile && (
              <button
                className="ledger-icon-button"
                aria-label="Change password"
                onClick={() => setPasswordModal(true)}
              >
                <Settings2 size={18} />
              </button>
            )}
            <button
              className="ledger-icon-button ledger-compact-logout"
              aria-label="Sign out"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="ledger-content">
          {data.user.demoProfile && (
            <section className="ledger-judge-banner" aria-label="Demo data">
              <Sparkles size={20} />
              <div>
                <strong>
                  Demo account · {demoProfiles.find((p) => p.id === data.user.demoProfile)?.name}
                </strong>
                <p>
                  This workspace uses fictional data. Try pennybot, add expenses and accounts. Your
                  changes are separate from other visitors. The demo lasts 24 hours; use sample
                  data.
                </p>
              </div>
              <button disabled={busy} onClick={signOut}>
                Switch profile <ArrowUpRight size={14} />
              </button>
            </section>
          )}
          <div className="ledger-heading">
            <div>
              <span className="ledger-eyebrow">{monthName.toUpperCase()}</span>
              <h1>
                {tab === "overview"
                  ? `Your Adaptive Home, ${data.user.name}`
                  : tab === "entries"
                    ? "Income and expenses"
                    : tab === "accounts"
                      ? "Your accounts"
                      : "Your assistant"}
              </h1>
              <p>
                {tab === "overview"
                  ? "Your financial picture, shaped around your habits."
                  : tab === "entries"
                    ? "Confirmed transactions and a history of corrections."
                    : tab === "accounts"
                      ? "Bank, cash and savings accounts with separate balances."
                      : "Record expenses in your own words."}
              </p>
            </div>
            <button className="ledger-primary" onClick={newEntry} disabled={busy}>
              <Plus size={17} />
              New transaction
            </button>
          </div>
          {error && (
            <div className="ledger-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="ledger-success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {!data.accounts.length && tab !== "overview" && (
            <section className="ledger-onboarding ledger-panel">
              <span className="ledger-round-icon">
                <Wallet size={26} />
              </span>
              <div>
                <h2>Start with your first account</h2>
                <p>
                  Choose a currency and enter your current balance. Your workspace starts empty.
                </p>
              </div>
              <button className="ledger-primary" onClick={() => setAccountModal(true)}>
                <Plus size={16} />
                Create account
              </button>
            </section>
          )}
          {tab === "overview" && (
            <>
              <div className="ledger-section-line">
                <h2>Adaptive Home</h2>
                <label className="ledger-currency-picker">
                  <span>Currency</span>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                  >
                    {displayCurrencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <PersonalAdaptiveHome
                home={data.adaptiveHome[currency]}
                busy={busy}
                onAction={homeAction}
              />
              <div className="ledger-section-line">
                <h2>Financial overview</h2>
              </div>
              <div className="ledger-summary">
                <section className="ledger-balance">
                  <span>Total balance · {currency}</span>
                  <strong>{formatMoney(totals.balanceMinor, currency)}</strong>
                  <small>
                    {currencyAccounts.length}{" "}
                    {currencyAccounts.length === 1 ? "account" : "accounts"} in this currency
                  </small>
                </section>
                <section className="ledger-panel">
                  <span>
                    <ArrowDownLeft size={16} />
                    Income this month
                  </span>
                  <strong className="ledger-positive">
                    {formatMoney(totals.incomeMinor, currency)}
                  </strong>
                  <small>From confirmed records</small>
                </section>
                <section className="ledger-panel">
                  <span>
                    <ArrowUpRight size={16} />
                    Expenses this month
                  </span>
                  <strong>{formatMoney(totals.expenseMinor, currency)}</strong>
                  <small>Opening balances are excluded from income</small>
                </section>
              </div>
              <div className="ledger-columns">
                <div>
                  <section className="ledger-panel">
                    <div className="ledger-section-line">
                      <h2>Accounts</h2>
                      <button className="ledger-text-button" onClick={() => setAccountModal(true)}>
                        <Plus size={14} />
                        Add
                      </button>
                    </div>
                    {data.accounts.map((a) => (
                      <div className="ledger-account-row" key={a.id}>
                        <span className="ledger-round-icon">
                          <CreditCard size={19} />
                        </span>
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {a.kind === "bank"
                              ? "Bank account"
                              : a.kind === "cash"
                                ? "Cash"
                                : "Savings"}{" "}
                            · {a.currency}
                          </small>
                        </div>
                        <b>{formatMoney(a.balanceMinor, a.currency)}</b>
                      </div>
                    ))}
                    {!data.accounts.length && (
                      <p className="ledger-muted">Create an account to get started.</p>
                    )}
                  </section>
                  <section className="ledger-panel">
                    <div className="ledger-section-line">
                      <h2>Recent transactions</h2>
                      <button className="ledger-text-button" onClick={() => setTab("entries")}>
                        View all <ArrowUpRight size={14} />
                      </button>
                    </div>
                    {activeEntries.slice(0, 6).map((e) => (
                      <div className="ledger-entry-row" key={e.id}>
                        <span className="ledger-round-icon">
                          {e.kind === "income" ? (
                            <ArrowDownLeft size={18} />
                          ) : (
                            <ArrowUpRight size={18} />
                          )}
                        </span>
                        <div>
                          <strong>{e.description}</strong>
                          <small>
                            {categoryLabels[e.category]} · {e.date}
                          </small>
                        </div>
                        <b className={e.kind === "income" ? "ledger-positive" : ""}>
                          {e.kind === "income" ? "+" : "−"}
                          {formatMoney(e.amountMinor, e.currency)}
                        </b>
                      </div>
                    ))}
                    {!activeEntries.length && (
                      <div className="ledger-empty">
                        <CirclePlus size={25} />
                        <p>Record your first income or expense in {currency}.</p>
                        <button className="ledger-text-button" onClick={newEntry}>
                          Add transaction
                        </button>
                      </div>
                    )}
                  </section>
                </div>
                {botPanel}
              </div>
            </>
          )}
          {tab === "entries" && (
            <section className="ledger-panel ledger-entries-panel">
              <div className="ledger-section-line">
                <h2>
                  Transaction journal <span className="ledger-count">{data.entries.length}</span>
                </h2>
                <label className="ledger-search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search transactions"
                    aria-label="Search transactions"
                  />
                </label>
              </div>
              <FinanceGrid
                entries={data.entries}
                accounts={data.accounts}
                search={search}
                onVoid={requestVoid}
              />
              <p className="ledger-muted">
                Voiding excludes the record from balances and preserves its history. It does not
                refund money or reverse a bank payment.
              </p>
            </section>
          )}
          {tab === "accounts" && (
            <>
              <div className="ledger-section-line">
                <h2>Balances by currency</h2>
                <button className="ledger-secondary" onClick={() => setAccountModal(true)}>
                  <Plus size={16} />
                  New account
                </button>
              </div>
              <div className="ledger-summary">
                {displayCurrencies.map((c) => (
                  <section className="ledger-panel" key={c}>
                    <span>{c}</span>
                    <strong>{formatMoney(data.totals[c].balanceMinor, c)}</strong>
                    <small>No currency conversion</small>
                  </section>
                ))}
              </div>
              <div className="ledger-account-grid">
                {data.accounts.map((a) => (
                  <section key={a.id} className="ledger-panel">
                    <div className="ledger-section-line">
                      <span className="ledger-round-icon">
                        <Wallet size={21} />
                      </span>
                      <span className="ledger-currency-tag">{a.currency}</span>
                    </div>
                    <h2>{a.name}</h2>
                    <strong className="ledger-account-amount">
                      {formatMoney(a.balanceMinor, a.currency)}
                    </strong>
                    <p className="ledger-muted">
                      Opening balance: {formatMoney(a.openingMinor, a.currency)}
                    </p>
                    <button
                      className="ledger-secondary"
                      onClick={() => {
                        setAccountId(a.id);
                        setEdit({
                          accountId: a.id,
                          kind: "expense",
                          amount: "",
                          description: "",
                          category: "other",
                          date: data.today,
                        });
                      }}
                    >
                      <Plus size={15} />
                      Record a transaction
                    </button>
                  </section>
                ))}
              </div>
            </>
          )}
          {tab === "bot" && (
            <div className="ledger-bot-page">
              {botPanel}
              <section className="ledger-panel">
                <h2>How it works</h2>
                <ol>
                  <li>Select an account and enter one amount in your message.</li>
                  <li>Review the proposed amount, date, category and account.</li>
                  <li>Confirm to save. Only then does your recorded balance change.</li>
                </ol>
                <p>
                  {data.user.demoProfile
                    ? "For example: “Bought groceries for 24.50 USD” or “Received payment of 800 USD”."
                    : "For example: “Bought groceries for 4500 KZT” or “Received salary of 300000 KZT”."}
                </p>
                <p className="ledger-muted">
                  You can omit the currency to use the selected account’s currency. Enter separate
                  messages for multiple amounts.
                </p>
              </section>
            </div>
          )}
          <footer className="ledger-footer">
            <span>
              <ShieldCheck size={14} />
              Personal records stay separate from demo data
            </span>
            <span>{displayCurrencies.join(" · ")}</span>
          </footer>
        </main>
      </div>
      {homePlan && (
        <Modal
          title={homePlan.reviewed ? "Confirm your settings" : "Savings goal and obligations"}
          busy={busy}
          onClose={() => setHomePlan(null)}
        >
          {homePlan.reviewed ? (
            <>
              <p>
                Currency: <strong>{homePlan.currency}</strong>
              </p>
              <p>
                Outstanding debt:{" "}
                <strong>
                  {homePlan.debtAmount} {homePlan.currency}
                </strong>
              </p>
              <p>
                Goal: <strong>{homePlan.goalName || "Not set"}</strong> · {homePlan.goalTarget}{" "}
                {homePlan.currency}
              </p>
              <p className="ledger-muted">
                These settings shape your cards. They do not change account balances or transfer
                money. Your savings jar uses savings-account balances.
              </p>
              {error && (
                <p className="ledger-error" role="alert">
                  {error}
                </p>
              )}
              <div className="ledger-modal-actions">
                <button
                  className="ledger-secondary"
                  disabled={busy}
                  onClick={() => setHomePlan({ ...homePlan, reviewed: false })}
                >
                  Edit
                </button>
                <button
                  className="ledger-primary"
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      const { reviewed: _reviewed, ...fields } = homePlan;
                      void _reviewed;
                      await call("/api/finance/home-plan", { ...fields, confirmed: true });
                      await refresh();
                      setHomePlan(null);
                      setNotice("Savings goal and obligations updated.");
                    })
                  }
                >
                  Confirm settings
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                setHomePlan({ ...homePlan, reviewed: true });
              }}
            >
              <p className="ledger-muted">
                Settings for {homePlan.currency}. Other currencies are calculated separately.
              </p>
              <label>
                Outstanding debt
                <input
                  inputMode="decimal"
                  required
                  maxLength={32}
                  value={homePlan.debtAmount}
                  onChange={(e) => setHomePlan({ ...homePlan, debtAmount: e.target.value })}
                />
              </label>
              <label>
                What are you saving for?
                <input
                  maxLength={80}
                  value={homePlan.goalName}
                  onChange={(e) => setHomePlan({ ...homePlan, goalName: e.target.value })}
                  placeholder="For example, a holiday"
                />
              </label>
              <label>
                Goal amount
                <input
                  inputMode="decimal"
                  required
                  maxLength={32}
                  value={homePlan.goalTarget}
                  onChange={(e) => setHomePlan({ ...homePlan, goalTarget: e.target.value })}
                />
              </label>
              <p className="ledger-muted">
                Enter 0 if you have no debt or goal. Savings are calculated from accounts of type
                “Savings”.
              </p>
              <button className="ledger-primary" disabled={busy}>
                Review settings
              </button>
            </form>
          )}
        </Modal>
      )}
      {accountModal && (
        <Modal title="New account" busy={busy} onClose={() => setAccountModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void work(async () => {
                const result = await call<{ account: AccountView }>("/api/finance/accounts", {
                  name: f.get("name"),
                  kind: f.get("kind"),
                  currency: f.get("currency"),
                  openingBalance: f.get("openingBalance"),
                });
                await refresh();
                setAccountId(result.account.id);
                setAccountModal(false);
                setNotice("Account created.");
              });
            }}
          >
            <label>
              Name
              <input
                name="name"
                required
                maxLength={60}
                placeholder="For example, main account"
                autoFocus
              />
            </label>
            <div className="ledger-form-row">
              <label>
                Type
                <select name="kind" aria-label="Account type">
                  <option value="bank">Bank account</option>
                  <option value="cash">Cash</option>
                  <option value="savings">Savings</option>
                </select>
              </label>
              <label>
                Currency
                <select name="currency" aria-label="Currency" defaultValue={currency}>
                  <option>KZT</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </label>
            </div>
            <label>
              Opening balance
              <input
                name="openingBalance"
                required
                inputMode="decimal"
                defaultValue="0"
                maxLength={32}
              />
            </label>
            <p className="ledger-muted">
              Enter money already available. The opening balance is excluded from income.
            </p>
            {error && (
              <p role="alert" className="ledger-error">
                {error}
              </p>
            )}
            <button className="ledger-primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}Create
              account
            </button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="New transaction" busy={busy} onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                const result = await call<{ draft: DraftView }>("/api/finance/drafts", edit);
                setEdit(null);
                setDraft(result.draft);
              });
            }}
          >
            <div className="ledger-form-row">
              <label>
                Type
                <select
                  aria-label="Type"
                  value={edit.kind}
                  onChange={(e) => setEdit({ ...edit, kind: e.target.value as EditValues["kind"] })}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label>
                Account
                <select
                  aria-label="Account"
                  value={edit.accountId}
                  onChange={(e) => setEdit({ ...edit, accountId: e.target.value })}
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Amount · {data.accounts.find((a) => a.id === edit.accountId)?.currency}
              <input
                required
                inputMode="decimal"
                maxLength={32}
                value={edit.amount}
                onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
                placeholder="4500"
                autoFocus
              />
            </label>
            <label>
              Description
              <input
                required
                maxLength={240}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                placeholder="Groceries"
              />
            </label>
            <div className="ledger-form-row">
              <label>
                Category
                <select
                  aria-label="Category"
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value as Category })}
                >
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  required
                  type="date"
                  min="1900-01-01"
                  max={data.today}
                  value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                />
              </label>
            </div>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <button className="ledger-primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}Review
              transaction
            </button>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal title="Review before saving" busy={busy} onClose={() => setDraft(null)}>
          <div className="ledger-review">
            <span>
              {draft.kind === "income" ? "Income" : "Expense"} ·{" "}
              {draft.source === "pennybot"
                ? `pennybot · ${draft.mode === "llm" ? "Gemini" : "categorization"}`
                : "Manual entry"}
            </span>
            <strong>
              {draft.kind === "income" ? "+" : "−"}
              {formatMoney(draft.amountMinor, draft.currency)}
            </strong>
            <h3>{draft.description}</h3>
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{data.accounts.find((a) => a.id === draft.accountId)?.name}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{categoryLabels[draft.category]}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{draft.date}</dd>
              </div>
            </dl>
          </div>
          <p className="ledger-muted">
            Nothing has been saved yet. This is a ledger entry, not a money transfer.
          </p>
          {error && (
            <p className="ledger-error" role="alert">
              {error}
            </p>
          )}
          <div className="ledger-modal-actions">
            <button className="ledger-secondary" disabled={busy} onClick={editDraft}>
              Edit
            </button>
            <button
              className="ledger-primary"
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  const result = await call<{ duplicate: boolean }>(
                    `/api/finance/drafts/${draft.id}/confirm`,
                    { confirmed: true },
                  );
                  await refresh();
                  setDraft(null);
                  setBotInput("");
                  setBotReply("Transaction saved. Balance updated.");
                  setNotice(
                    result.duplicate
                      ? "This transaction was already saved. No duplicate was created."
                      : "Transaction saved after confirmation.",
                  );
                })
              }
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}Confirm and
              save
            </button>
          </div>
        </Modal>
      )}
      {voiding && (
        <Modal title="Void this entry?" busy={busy} onClose={() => setVoiding(null)}>
          <p>
            «{voiding.description}», {formatMoney(voiding.amountMinor, voiding.currency)}. The
            record stays in history but no longer affects the balance.
          </p>
          <p className="ledger-muted">This does not refund money or reverse a bank payment.</p>
          {error && (
            <p className="ledger-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="ledger-primary"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                await call(`/api/finance/entries/${voiding.id}/void`, { confirmed: true });
                await refresh();
                setVoiding(null);
                setNotice("Entry voided. History preserved.");
              })
            }
          >
            Confirm void
          </button>
        </Modal>
      )}
      {passwordModal && (
        <Modal title="Change password" busy={busy} onClose={() => setPasswordModal(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void work(async () => {
                await call("/api/account/password", {
                  currentPassword: f.get("currentPassword"),
                  newPassword: f.get("newPassword"),
                });
                setPasswordModal(false);
                setNotice("Password changed. Other sessions have ended.");
              });
            }}
          >
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
            </label>
            <p className="ledger-muted">Changing your password signs out your other devices.</p>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <button className="ledger-primary" disabled={busy}>
              Save new password
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
