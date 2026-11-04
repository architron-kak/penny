export const categories = [
  "groceries",
  "food & coffee",
  "transport",
  "subscriptions",
  "shopping",
  "utilities",
  "other",
] as const;
export type Category = (typeof categories)[number];
export const personaIds = ["student", "family", "freelancer"] as const;
export type PersonaId = (typeof personaIds)[number];
export type Transaction = {
  billingPeriod?: "monthly" | "annual";
  id: string;
  userId: PersonaId;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  currency: "USD";
  category?: Category;
  source: "synthetic" | "paypal-sandbox";
};
export type Subscription = {
  id: string;
  userId: PersonaId;
  merchant: string;
  monthlyPrice: number;
  lastUsedDate: string;
  status: "active" | "cancel-suggested";
};
export type Persona = {
  id: PersonaId;
  name: string;
  firstName: string;
  initials: string;
  description: string;
  monthlyBudget: number;
  budgets: Record<Category, number>;
};
export type Suggestion = {
  id: string;
  userId: PersonaId;
  title: string;
  description: string;
  amount: number;
  status: "proposed" | "approved" | "paid" | "dismissed";
  createdAt: string;
  approvedAt?: string;
};
export type Order = {
  id: string;
  suggestionId: string;
  userId: PersonaId;
  amount: number;
  currency: "USD";
  status: string;
  approvalUrl: string;
  createdAt: string;
  updatedAt: string;
  captureId?: string;
  capturedAt?: string;
  sessionHash?: string;
};
export type Activity = {
  id: string;
  userId: PersonaId;
  message: string;
  createdAt: string;
  kind: "analysis" | "payment" | "user";
};
export type Database = {
  planning?: import("./planning-types").PlanningStore;
  version: 1;
  seedDate: string;
  personas: Persona[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  suggestions: Suggestion[];
  orders: Order[];
  activities: Activity[];
  classification: Record<string, { category: Category; mode: "llm" | "rules" }>;
  reasons: Record<string, { reasons: Record<string, string>; mode: "llm" | "rules" }>;
  webhookIds: string[];
};
export type Insight = {
  month: string;
  asOf: string;
  currentSpend: number;
  previousSpend: number;
  averageSpend: number;
  income: number;
  budgetRemaining: number;
  changePercent: number;
  categorySpend: Record<Category, number>;
  categoryRemaining: Record<Category, number>;
  monthly: { month: string; label: string; amount: number }[];
  unusedSubscriptions: Subscription[];
  recurringMerchants: {
    merchant: string;
    count: number;
    total: number;
    lastDate: string;
  }[];
  subscriptionTotal: number;
  transactionCount: number;
};
export type HomeCard = {
  id: string;
  kind:
    | "PurchaseBudget"
    | "DebtReminder"
    | "RefundAlert"
    | "PriceAlert"
    | "IncomeDelay"
    | "SpendingSummary"
    | "CategoryBudget"
    | "SubscriptionAlert"
    | "SuggestedPayment"
    | "MerchantShortcut";
  headline?: string;
  topic?: import("./planning-types").ChatContext["topic"];
  entityId?: string;
  priority: number;
  reason: string;
  category?: Category;
  merchant?: string;
  suggestionId?: string;
};
export type HomeData = {
  planning?: import("./planning-types").PlanningView;
  persona: Persona;
  personas: Persona[];
  insights: Insight;
  cards: HomeCard[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  suggestions: Suggestion[];
  orders: Order[];
  activities: Activity[];
  aiMode: "llm" | "rules";
  paypalReady: boolean;
  seedDate: string;
};
