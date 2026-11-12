"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
} from "@/lib/private/types";
import type { Category } from "@/lib/types";
import { amountInput, categoryLabels, formatMoney } from "./personal-money";
import { demoProfiles, type DemoProfile } from "@/lib/private/demo-profiles";
const FinanceGrid = dynamic(() => import("./finance-grid"), {
  ssr: false,
  loading: () => <p className="ledger-muted">Загружаем таблицу…</p>,
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
  const data = await response.json().catch(() => ({ error: "Сервис временно недоступен." }));
  if (!response.ok) throw new RequestError(data.error || "Повторите запрос.", response.status);
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
          aria-label="Закрыть"
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
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "entries", label: "Операции", icon: ArrowDownLeft },
  { id: "accounts", label: "Счета", icon: Wallet },
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
  const habits = useMemo(() => {
    if (!data) return [];
    const since = new Date(Date.parse(data.today + "T12:00:00Z") - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    const groups = new Map<string, EntryView[]>();
    for (const e of data.entries.filter(
      (e) => !e.voidedAt && e.kind === "expense" && e.currency === currency && e.date >= since,
    )) {
      const key = e.description.toLocaleLowerCase();
      const rows = groups.get(key) || [];
      rows.push(e);
      groups.set(key, rows);
    }
    return [...groups.values()]
      .filter((rows) => new Set(rows.map((r) => r.date)).size >= 3)
      .sort((a, b) => b.length - a.length)
      .slice(0, 2)
      .map((rows) => ({ entry: rows[0], days: new Set(rows.map((r) => r.date)).size }));
  }, [data, currency]);
  if (loading)
    return (
      <div className="ledger-loading">
        <Logo />
        <LoaderCircle className="spin" />
        <p>Открываем личный кабинет…</p>
      </div>
    );
  if (!data)
    return (
      <div className="ledger-auth" lang="ru">
        <section className="ledger-auth-story">
          <Link href="/">
            <Logo />
          </Link>
          <span className="ledger-eyebrow">ЛИЧНЫЕ ФИНАНСЫ</span>
          <h1>
            Ваши деньги.
            <br />
            Ваше пространство.
          </h1>
          <p>
            Счета, доходы и расходы — в одном месте. pennybot поможет превратить обычное сообщение в
            понятную операцию.
          </p>
          <div className="ledger-currency-tags">
            <span>₸ KZT</span>
            <span>$ USD</span>
            <span>€ EUR</span>
          </div>
          <div className="ledger-auth-points">
            <span>
              <ShieldCheck size={18} />
              Отдельный доступ к вашим записям
            </span>
            <span>
              <Wallet size={18} />
              Несколько счетов без смешения валют
            </span>
            <span>
              <Check size={18} />
              Сохранение после подтверждения
            </span>
          </div>
          <Link className="ledger-demo-link" href="/">
            Посмотреть демоверсию <ArrowUpRight size={15} />
          </Link>
        </section>
        <section className="ledger-auth-form">
          {error && (
            <div className="ledger-error" role="alert">
              {error}
            </div>
          )}
          <section className="ledger-judge-access" aria-labelledby="judge-access-title">
            <span className="ledger-eyebrow">ДЛЯ СУДЕЙ · QUICK DEMO</span>
            <h2 id="judge-access-title">Проверить без регистрации</h2>
            <p>Выберите готовый аккаунт — счета и операции уже заполнены.</p>
            <div className="ledger-judge-profiles">
              {demoProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  disabled={busy}
                  onClick={() => openJudgeDemo(profile.id)}
                  aria-label={`Открыть демо ${profile.name}`}
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
              Вход в один клик. Тестовые данные, отдельная копия для каждого посетителя.
            </p>
          </section>
          <div className="ledger-auth-divider">или войдите в свой аккаунт</div>
          <div className="ledger-auth-switch">
            <button
              type="button"
              aria-pressed={!register}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              Войти
            </button>
            <button
              type="button"
              aria-pressed={register}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              Создать аккаунт
            </button>
          </div>
          <h2>{register ? "Начнём с вашего аккаунта" : "С возвращением"}</h2>
          <p>Личный учёт без общих демоданных.</p>
          <form onSubmit={authenticate}>
            {register && (
              <label>
                Ваше имя
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="name"
                  placeholder="Как к вам обращаться"
                />
              </label>
            )}
            <label>
              Электронная почта
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
              Пароль
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={register ? "Не менее 12 символов" : "Ваш пароль"}
              />
            </label>
            <button className="ledger-primary" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}{" "}
              {register ? "Создать личный кабинет" : "Войти в кабинет"}
            </button>
          </form>
          <p className="ledger-auth-note">
            {register
              ? "Сохраните пароль: восстановление по email пока не подключено."
              : "Пароль хранится в виде стойкого хеша. Сессия защищена HttpOnly cookie."}
          </p>
          <p className="ledger-muted">
            Это учёт внесённых вами операций. Синхронизация с банками не подключена.
          </p>
        </section>
      </div>
    );
  const totals = data.totals[currency],
    selectedAccount = data.accounts.find((a) => a.id === accountId);
  const activeEntries = data.entries.filter((e) => !e.voidedAt && e.currency === currency),
    monthName = new Intl.DateTimeFormat("ru-KZ", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(data.today + "T12:00:00Z"));
  const currencyAccounts = data.accounts.filter((a) => a.currency === currency);
  const botPanel = (
    <section className="ledger-bot ledger-panel">
      <div className="ledger-panel-title">
        <span className="ledger-bot-icon">
          <Sparkles size={21} />
        </span>
        <div>
          <h2>pennybot</h2>
          <p>Из сообщения — в запись</p>
        </div>
      </div>
      <p className="ledger-bot-intro">
        Напишите, на что потратили деньги или какой доход получили. Я предложу операцию для
        проверки.
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
              setBotReply("Проверьте сумму, счёт и категорию. Пока ничего не сохранено.");
            } else setBotReply(result.answer || "");
          });
        }}
      >
        <label>
          Счёт
          <select
            aria-label="Счёт для pennybot"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={!data.accounts.length}
          >
            {!data.accounts.length && <option value="">Сначала создайте счёт</option>}
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ваше сообщение
          <textarea
            required
            maxLength={1000}
            value={botInput}
            onChange={(e) => setBotInput(e.target.value)}
            placeholder="Купил продукты на 4500 ₸"
            rows={4}
          />
        </label>
        <label className="ledger-consent">
          <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
          <span>
            Gemini для категории
            <small>
              Если включить, текст сообщения будет отправлен Google. Счета, остатки и история не
              отправляются.
            </small>
          </span>
        </label>
        <button className="ledger-primary" disabled={busy || !data.accounts.length}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}Предложить
          операцию
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
                ? "Купил кофе за 5 USD"
                : selectedAccount?.currency === "EUR"
                  ? "Купил продукты на 25 EUR"
                  : "Купил продукты на 4500 ₸",
            )
          }
        >
          Пример расхода <ChevronRight size={14} />
        </button>
        <button disabled={busy} onClick={() => setBotInput("Мой баланс")}>
          Показать баланс <ChevronRight size={14} />
        </button>
      </div>
      <small className="ledger-muted">
        Распознавание создаёт только черновик. Деньги не переводятся.
      </small>
    </section>
  );
  return (
    <div className="cabinet" lang="ru">
      <aside className="ledger-sidebar">
        <Link href="/cabinet">
          <Logo />
        </Link>
        <span className="ledger-sidebar-label">ЛИЧНЫЙ КАБИНЕТ</span>
        <nav aria-label="Навигация личного кабинета">
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
            <small>{data.user.demoProfile ? "Демо для судей" : "Личный учёт"}</small>
          </div>
          <button
            className="ledger-icon-button"
            aria-label="Выйти"
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
            {data.user.demoProfile ? "Демонстрационный аккаунт" : "Только ваши данные"}
          </span>
          <div>
            <Link href="/">
              Демо Penny <ArrowUpRight size={13} />
            </Link>
            {!data.user.demoProfile && (
              <button
                className="ledger-icon-button"
                aria-label="Сменить пароль"
                onClick={() => setPasswordModal(true)}
              >
                <Settings2 size={18} />
              </button>
            )}
            <button
              className="ledger-icon-button ledger-compact-logout"
              aria-label="Выйти"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="ledger-content">
          {data.user.demoProfile && (
            <section className="ledger-judge-banner" aria-label="Демонстрационные данные">
              <Sparkles size={20} />
              <div>
                <strong>
                  Демоаккаунт · {demoProfiles.find((p) => p.id === data.user.demoProfile)?.name}
                </strong>
                <p>
                  Это пример с вымышленными данными. Проверяйте pennybot, добавляйте расходы и счета
                  — изменения видны только в вашем браузере. Демо действует 24 часа; не вносите
                  личные данные.
                </p>
              </div>
              <button disabled={busy} onClick={signOut}>
                Сменить профиль <ArrowUpRight size={14} />
              </button>
            </section>
          )}
          <div className="ledger-heading">
            <div>
              <span className="ledger-eyebrow">{monthName.toUpperCase()}</span>
              <h1>
                {tab === "overview"
                  ? `Ваш обзор, ${data.user.name}`
                  : tab === "entries"
                    ? "Доходы и расходы"
                    : tab === "accounts"
                      ? "Ваши счета"
                      : "Ваш помощник"}
              </h1>
              <p>
                {tab === "overview"
                  ? "Всё, что вы записали. Без смешения валют."
                  : tab === "entries"
                    ? "Подтверждённые операции и история исправлений."
                    : tab === "accounts"
                      ? "Банк, наличные или накопления — с отдельными остатками."
                      : "Запишите расход обычными словами."}
              </p>
            </div>
            <button className="ledger-primary" onClick={newEntry} disabled={busy}>
              <Plus size={17} />
              Новая операция
            </button>
          </div>
          {error && (
            <div className="ledger-error" role="alert">
              {error}
              <button aria-label="Скрыть ошибку" onClick={() => setError("")}>
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
          {!data.accounts.length && (
            <section className="ledger-onboarding ledger-panel">
              <span className="ledger-round-icon">
                <Wallet size={26} />
              </span>
              <div>
                <h2>Начните с первого счёта</h2>
                <p>Выберите валюту и укажите текущий остаток. В кабинете пока нет операций.</p>
              </div>
              <button className="ledger-primary" onClick={() => setAccountModal(true)}>
                <Plus size={16} />
                Создать счёт
              </button>
            </section>
          )}
          {tab === "overview" && (
            <>
              <div className="ledger-section-line">
                <h2>Финансовая сводка</h2>
                <label className="ledger-currency-picker">
                  <span>Валюта</span>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                  >
                    {["KZT", "USD", "EUR"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ledger-summary">
                <section className="ledger-balance">
                  <span>Общий остаток · {currency}</span>
                  <strong>{formatMoney(totals.balanceMinor, currency)}</strong>
                  <small>{currencyAccounts.length} счетов в этой валюте</small>
                </section>
                <section className="ledger-panel">
                  <span>
                    <ArrowDownLeft size={16} />
                    Доходы за месяц
                  </span>
                  <strong className="ledger-positive">
                    {formatMoney(totals.incomeMinor, currency)}
                  </strong>
                  <small>По подтверждённым записям</small>
                </section>
                <section className="ledger-panel">
                  <span>
                    <ArrowUpRight size={16} />
                    Расходы за месяц
                  </span>
                  <strong>{formatMoney(totals.expenseMinor, currency)}</strong>
                  <small>Начальный остаток не считается доходом</small>
                </section>
              </div>
              <div className="ledger-columns">
                <div>
                  <section className="ledger-panel">
                    <div className="ledger-section-line">
                      <h2>Счета</h2>
                      <button className="ledger-text-button" onClick={() => setAccountModal(true)}>
                        <Plus size={14} />
                        Добавить
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
                              ? "Банковский счёт"
                              : a.kind === "cash"
                                ? "Наличные"
                                : "Накопления"}{" "}
                            · {a.currency}
                          </small>
                        </div>
                        <b>{formatMoney(a.balanceMinor, a.currency)}</b>
                      </div>
                    ))}
                    {!data.accounts.length && (
                      <p className="ledger-muted">Создайте счёт, чтобы начать.</p>
                    )}
                  </section>
                  {habits.length > 0 && (
                    <section className="ledger-panel ledger-habits">
                      <h2>Привычные расходы</h2>
                      {habits.map(({ entry, days }) => (
                        <div key={entry.id}>
                          <div>
                            <strong>{entry.description}</strong>
                            <p>
                              {days} разных дней за неделю ·{" "}
                              {formatMoney(entry.amountMinor, entry.currency)}
                            </p>
                          </div>
                          <button className="ledger-text-button" onClick={() => repeat(entry)}>
                            Повторить запись
                          </button>
                        </div>
                      ))}
                      <small className="ledger-muted">
                        Каждая повторная запись также требует подтверждения.
                      </small>
                    </section>
                  )}
                  <section className="ledger-panel">
                    <div className="ledger-section-line">
                      <h2>Последние операции</h2>
                      <button className="ledger-text-button" onClick={() => setTab("entries")}>
                        Все <ArrowUpRight size={14} />
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
                        <p>Запишите первый доход или расход в {currency}.</p>
                        <button className="ledger-text-button" onClick={newEntry}>
                          Добавить операцию
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
                  Журнал операций <span className="ledger-count">{data.entries.length}</span>
                </h2>
                <label className="ledger-search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск по операциям"
                    aria-label="Поиск по операциям"
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
                Отмена записи исключает её из учёта, но сохраняет историю. Она не возвращает деньги
                и не отменяет банковский платёж.
              </p>
            </section>
          )}
          {tab === "accounts" && (
            <>
              <div className="ledger-section-line">
                <h2>Остатки по валютам</h2>
                <button className="ledger-secondary" onClick={() => setAccountModal(true)}>
                  <Plus size={16} />
                  Новый счёт
                </button>
              </div>
              <div className="ledger-summary">
                {(["KZT", "USD", "EUR"] as const).map((c) => (
                  <section className="ledger-panel" key={c}>
                    <span>{c}</span>
                    <strong>{formatMoney(data.totals[c].balanceMinor, c)}</strong>
                    <small>Без пересчёта в другие валюты</small>
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
                      Начальный остаток: {formatMoney(a.openingMinor, a.currency)}
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
                      Записать операцию
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
                <h2>Как это работает</h2>
                <ol>
                  <li>Выберите счёт и напишите сообщение с одной суммой.</li>
                  <li>Проверьте предложенные сумму, дату, категорию и счёт.</li>
                  <li>Подтвердите сохранение. Только тогда изменится учётный остаток.</li>
                </ol>
                <p>Например: «Купил продукты на 4500 ₸» или «Получил зарплату 300000 KZT».</p>
                <p className="ledger-muted">
                  Валюту можно не писать — будет использована валюта выбранного счёта. Сообщения с
                  несколькими суммами нужно разделить.
                </p>
              </section>
            </div>
          )}
          <footer className="ledger-footer">
            <span>
              <ShieldCheck size={14} />
              Личные записи отделены от демоданных
            </span>
            <span>KZT · USD · EUR</span>
          </footer>
        </main>
      </div>
      {accountModal && (
        <Modal title="Новый счёт" busy={busy} onClose={() => setAccountModal(false)}>
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
                setNotice("Счёт создан.");
              });
            }}
          >
            <label>
              Название
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Например, основная карта"
                autoFocus
              />
            </label>
            <div className="ledger-form-row">
              <label>
                Тип
                <select name="kind" aria-label="Тип счёта">
                  <option value="bank">Банковский счёт</option>
                  <option value="cash">Наличные</option>
                  <option value="savings">Накопления</option>
                </select>
              </label>
              <label>
                Валюта
                <select name="currency" aria-label="Валюта" defaultValue={currency}>
                  <option>KZT</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </label>
            </div>
            <label>
              Начальный остаток
              <input
                name="openingBalance"
                required
                inputMode="decimal"
                defaultValue="0"
                maxLength={32}
              />
            </label>
            <p className="ledger-muted">
              Укажите уже доступные деньги. Начальный остаток не будет записан как доход.
            </p>
            {error && (
              <p role="alert" className="ledger-error">
                {error}
              </p>
            )}
            <button className="ledger-primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}Создать счёт
            </button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal title="Новая операция" busy={busy} onClose={() => setEdit(null)}>
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
                Тип
                <select
                  aria-label="Тип"
                  value={edit.kind}
                  onChange={(e) => setEdit({ ...edit, kind: e.target.value as EditValues["kind"] })}
                >
                  <option value="expense">Расход</option>
                  <option value="income">Доход</option>
                </select>
              </label>
              <label>
                Счёт
                <select
                  aria-label="Счёт"
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
              Сумма · {data.accounts.find((a) => a.id === edit.accountId)?.currency}
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
              Описание
              <input
                required
                maxLength={240}
                value={edit.description}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                placeholder="Продукты"
              />
            </label>
            <div className="ledger-form-row">
              <label>
                Категория
                <select
                  aria-label="Категория"
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
                Дата
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
              {busy ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}Проверить
              операцию
            </button>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal title="Проверьте перед сохранением" busy={busy} onClose={() => setDraft(null)}>
          <div className="ledger-review">
            <span>
              {draft.kind === "income" ? "Доход" : "Расход"} ·{" "}
              {draft.source === "pennybot"
                ? `pennybot · ${draft.mode === "llm" ? "Gemini" : "распознавание"}`
                : "Ручная запись"}
            </span>
            <strong>
              {draft.kind === "income" ? "+" : "−"}
              {formatMoney(draft.amountMinor, draft.currency)}
            </strong>
            <h3>{draft.description}</h3>
            <dl>
              <div>
                <dt>Счёт</dt>
                <dd>{data.accounts.find((a) => a.id === draft.accountId)?.name}</dd>
              </div>
              <div>
                <dt>Категория</dt>
                <dd>{categoryLabels[draft.category]}</dd>
              </div>
              <div>
                <dt>Дата</dt>
                <dd>{draft.date}</dd>
              </div>
            </dl>
          </div>
          <p className="ledger-muted">
            Пока ничего не сохранено. Это запись в учёте, а не перевод денег.
          </p>
          {error && (
            <p className="ledger-error" role="alert">
              {error}
            </p>
          )}
          <div className="ledger-modal-actions">
            <button className="ledger-secondary" disabled={busy} onClick={editDraft}>
              Изменить
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
                  setBotReply("Операция сохранена. Остаток обновлён.");
                  setNotice(
                    result.duplicate
                      ? "Эта операция уже была сохранена. Повторной записи нет."
                      : "Операция сохранена после подтверждения.",
                  );
                })
              }
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}Подтвердить
              и сохранить
            </button>
          </div>
        </Modal>
      )}
      {voiding && (
        <Modal title="Отменить запись?" busy={busy} onClose={() => setVoiding(null)}>
          <p>
            «{voiding.description}», {formatMoney(voiding.amountMinor, voiding.currency)}. Запись
            останется в истории, но перестанет влиять на остаток.
          </p>
          <p className="ledger-muted">Это не возврат денег и не отмена банковского платежа.</p>
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
                setNotice("Запись отменена. История сохранена.");
              })
            }
          >
            Подтвердить отмену записи
          </button>
        </Modal>
      )}
      {passwordModal && (
        <Modal title="Сменить пароль" busy={busy} onClose={() => setPasswordModal(false)}>
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
                setNotice("Пароль изменён. Другие сессии завершены.");
              });
            }}
          >
            <label>
              Текущий пароль
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              Новый пароль
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Не менее 12 символов"
              />
            </label>
            <p className="ledger-muted">
              После смены пароля остальные устройства будут отключены от аккаунта.
            </p>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <button className="ledger-primary" disabled={busy}>
              Сохранить новый пароль
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
