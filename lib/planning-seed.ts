import type { Database, PersonaId } from "./types";
import type { MoneyProfile, PlanningStore } from "./planning-types";
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function ensurePlanning(db: Database): PlanningStore {
  if (db.planning) return db.planning;
  const day = db.seedDate.slice(0, 10);
  const make = (
    userId: PersonaId,
    balance: number,
    incomeDays: number,
    incomeAmount: number,
  ): MoneyProfile => ({
    userId,
    asOf: day,
    balance,
    nextIncome: {
      date: addDays(day, incomeDays),
      amount: incomeAmount,
      label:
        userId === "student" ? "Scholarship" : userId === "family" ? "Salary" : "Client invoice",
    },
    reserve: userId === "student" ? 20 : 50,
    lunchMerchant: userId === "student" ? "Campus Lunch" : "",
    lunchConfirmed: true,
    lunchSchedule: "daily",
    dailyOther: userId === "student" ? 0 : 5,
    delayDays: 7,
    obligations: [
      {
        id: `${userId}-bill`,
        title:
          userId === "freelancer"
            ? "Rent"
            : userId === "family"
              ? "Utilities"
              : "Other essential bills",
        amount: userId === "freelancer" ? 400 : userId === "family" ? 240 : 30,
        date: addDays(day, userId === "freelancer" ? 8 : 5),
      },
    ],
  });
  const profiles = {
    student: make("student", 200, 10, 500),
    family: make("family", 900, 14, 2500),
    freelancer: make("freelancer", 400, 5, 1200),
  };
  // Migration only appends stable synthetic examples. Existing orders/captures are untouched.
  for (let i = 1; i <= 7; i++)
    if (!db.transactions.some((t) => t.id === `planning-lunch-${i}`))
      db.transactions.push({
        id: `planning-lunch-${i}`,
        userId: "student",
        date: addDays(day, -i),
        merchant: "Campus Lunch",
        description: "Usual student lunch meal",
        amount: 5,
        currency: "USD",
        category: "food & coffee",
        source: "synthetic",
      });
  for (const userId of ["student", "family"] as const) {
    const merchant = userId === "student" ? "Monthly Notes" : "Home Cinema";
    const subId = `${userId}-planning-sub`;
    if (!db.subscriptions.some((s) => s.id === subId))
      db.subscriptions.push({
        id: subId,
        userId,
        merchant,
        monthlyPrice: 11,
        lastUsedDate: addDays(day, -1),
        status: "active",
      });
    for (const [suffix, offset, amount] of [
      ["old", -32, 8],
      ["new", -2, 11],
    ] as const)
      if (!db.transactions.some((t) => t.id === `${subId}-${suffix}`))
        db.transactions.push({
          id: `${subId}-${suffix}`,
          userId,
          date: addDays(day, offset),
          merchant,
          description: "Monthly subscription renewal",
          billingPeriod: "monthly",
          amount,
          currency: "USD",
          category: "subscriptions",
          source: "synthetic",
        });
  }
  const purchaseId = "family-return-purchase";
  if (!db.transactions.some((t) => t.id === purchaseId))
    db.transactions.push({
      id: purchaseId,
      userId: "family",
      date: addDays(day, -15),
      merchant: "Home Supply",
      description: "Returned household item",
      amount: 55,
      currency: "USD",
      category: "shopping",
      source: "synthetic",
    });
  db.planning = {
    version: 1,
    profiles,
    debts: [
      {
        id: "family-debt-demo",
        userId: "family",
        person: "Ali",
        direction: "payable",
        amount: 60,
        installments: [
          { date: addDays(day, 3), amount: 40 },
          { date: addDays(day, 15), amount: 20 },
        ],
        repayments: [],
      },
      {
        id: "family-receivable-demo",
        userId: "family",
        person: "Mina",
        direction: "receivable",
        amount: 25,
        installments: [{ date: addDays(day, 4), amount: 25 }],
        repayments: [],
      },
    ],
    refunds: [
      {
        id: "family-refund-demo",
        userId: "family",
        transactionId: purchaseId,
        amount: 35,
        dueDate: addDays(day, -2),
      },
    ],
    acknowledgedPrices: [],
    appliedActions: [],
  };
  db.transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return db.planning;
}
