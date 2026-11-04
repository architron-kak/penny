import type { PersonaId } from "./types";
export type Income = { date: string; amount: number; label: string };
export type MoneyProfile = {
  userId: PersonaId;
  asOf: string;
  balance: number | null;
  nextIncome: Income | null;
  reserve: number | null;
  lunchPrice?: number;
  lunchMerchant: string;
  lunchConfirmed: boolean;
  lunchSchedule: "daily" | "weekdays";
  dailyOther: number;
  delayDays: number;
  obligations: { id: string; title: string; amount: number; date: string }[];
};
export type Debt = {
  id: string;
  userId: PersonaId;
  person: string;
  direction: "payable" | "receivable";
  amount: number;
  installments: { date: string; amount: number }[];
  repayments: { id: string; amount: number; date: string }[];
};
export type Refund = {
  id: string;
  userId: PersonaId;
  transactionId: string;
  amount: number;
  dueDate: string;
  receivedAt?: string;
};
export type PlanningStore = {
  version: 1;
  profiles: Record<PersonaId, MoneyProfile>;
  debts: Debt[];
  refunds: Refund[];
  acknowledgedPrices: string[];
  appliedActions: string[];
};
export type PurchaseOptions = {
  balance?: number;
  incomeDate?: string;
  incomeAmount?: number;
  reserve?: number;
  schedule?: "daily" | "weekdays";
  lunchPrice?: number;
  confirmLunch?: boolean;
};
export type PurchasePlan = {
  missing: string[];
  balance: number;
  days: number;
  lunchDates: string[];
  lunchPrice: number;
  lunchCost: number;
  otherCost: number;
  mandatoryCost: number;
  debtCost: number;
  reserve: number;
  limit: number;
  incomeDate: string;
  evidence: { id: string; merchant: string; date: string; amount: number; description: string }[];
  candidates: { id: string; name: string; price: number; features: string; remaining: number }[];
};
export type CashDay = {
  date: string;
  income: number;
  ordinary: number;
  payments: { title: string; amount: number }[];
  balance: number;
};
export type CashForecast = {
  days: CashDay[];
  firstShortfall?: { date: string; amount: number; payment: string };
  endBalance: number;
};
export type PriceChange = {
  id: string;
  subscriptionId: string;
  merchant: string;
  previous: { date: string; amount: number };
  current: { date: string; amount: number };
  annualDifference: number;
  period: "monthly" | "annual";
};
export type PlanningView = {
  profile: MoneyProfile;
  purchase: PurchasePlan;
  debts: (Debt & { remaining: number })[];
  refunds: (Refund & {
    purchase?: { merchant: string; date: string; amount: number };
    overdue: boolean;
  })[];
  prices: PriceChange[];
  debtForecast: CashForecast;
  delay: { days: number; baseline: CashForecast; delayed: CashForecast };
};
export type ChatContext = {
  debtDraft?: {
    person: string;
    direction: "payable" | "receivable";
    amount: number;
    firstAmount: number;
  };
  topic:
    | "purchase"
    | "debts"
    | "refunds"
    | "price"
    | "delay"
    | "payment"
    | "overview"
    | "coffee"
    | "subscriptions"
    | "merchant";
  entityId?: string;
  options?: PurchaseOptions;
};
export type PlanningCommand =
  | { type: "profile"; options: PurchaseOptions }
  | {
      type: "debt-create";
      person: string;
      direction: "payable" | "receivable";
      amount: number;
      installments: { date: string; amount: number }[];
    }
  | { type: "debt-payment"; debtId: string; amount: number; date: string }
  | { type: "debt-schedule"; debtId: string; installments: { date: string; amount: number }[] }
  | { type: "refund-create"; transactionId: string; amount: number; dueDate: string }
  | { type: "refund-received"; refundId: string }
  | { type: "price-acknowledge"; priceId: string }
  | { type: "delay-save"; days: number };
export type ChatAction = { label: string; command?: PlanningCommand; paymentId?: string };
export type ChatReply = {
  answer: string;
  mode: "rules" | "llm";
  context?: ChatContext;
  actions?: ChatAction[];
  planning?: PlanningView;
  preview?: CashForecast;
};
