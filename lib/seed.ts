import { ensurePlanning } from "./planning-seed";
import type { Category, Database, Persona, PersonaId, Subscription, Transaction } from "./types";

export const personas: Persona[] = [
  {
    id: "student",
    name: "Student",
    firstName: "Alex",
    initials: "AL",
    description: "Campus life & little everyday things",
    monthlyBudget: 850,
    budgets: {
      groceries: 150,
      "food & coffee": 180,
      transport: 80,
      subscriptions: 65,
      shopping: 150,
      utilities: 100,
      other: 125,
    },
  },
  {
    id: "family",
    name: "Family",
    firstName: "Jordan",
    initials: "JO",
    description: "A busy household, thoughtfully managed",
    monthlyBudget: 3200,
    budgets: {
      groceries: 650,
      "food & coffee": 250,
      transport: 300,
      subscriptions: 60,
      shopping: 400,
      utilities: 650,
      other: 890,
    },
  },
  {
    id: "freelancer",
    name: "Freelancer",
    firstName: "Sam",
    initials: "SA",
    description: "Independent work, a little more freedom",
    monthlyBudget: 2400,
    budgets: {
      groceries: 300,
      "food & coffee": 200,
      transport: 450,
      subscriptions: 160,
      shopping: 400,
      utilities: 250,
      other: 640,
    },
  },
];

function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Merchant = [string, string, number, number];
const merchants: Record<PersonaId, Merchant[]> = {
  student: [
    ["Campus Coffee", "Coffee and breakfast", 4, 13],
    ["Campus Coffee", "Afternoon latte", 4, 8],
    ["Noodle House", "Lunch and takeaway", 10, 20],
    ["Fresh Market", "Groceries and produce", 18, 40],
    ["Metro Transit", "Bus fare and transport", 2, 9],
    ["Book Nook", "Shopping for books", 12, 45],
    ["Campus Coffee", "Coffee and snack", 4, 10],
  ],
  family: [
    ["Fresh Market", "Weekly groceries", 90, 180],
    ["Fresh Market", "Groceries and household produce", 65, 140],
    ["Bright Energy", "Utilities electricity bill", 110, 190],
    ["City Water", "Utilities water bill", 45, 80],
    ["Little League", "Kids activities", 35, 100],
    ["Family Kitchen", "Dinner and food", 30, 65],
    ["Metro Transit", "Transport passes", 20, 55],
  ],
  freelancer: [
    ["Runway Air", "Travel transport flight", 90, 290],
    ["Studio Supply", "Shopping for office equipment", 40, 150],
    ["Fresh Market", "Groceries", 20, 60],
    ["Desk Coffee", "Coffee and client lunch", 8, 30],
    ["Fiber Internet", "Utilities internet", 65, 90],
    ["City Cab", "Transport taxi", 15, 45],
    ["Desk Coffee", "Coffee and workspace snack", 6, 18],
  ],
};
const daysAgo = (date: Date, days: number) =>
  new Date(date.getTime() - days * 86400000).toISOString().slice(0, 10);
export function generateSeed(asOf = new Date()): Database {
  const anchor = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate(), 12),
  );
  const transactions: Transaction[] = [];
  const subscriptions: Subscription[] = [];
  const subDefinitions: Record<PersonaId, [string, number, number][]> = {
    student: [
      ["Soundwave Music", 10.99, 2],
      ["Streambox", 15.99, 67],
      ["Study Cloud", 9.99, 4],
      ["Fit Club", 24.99, 81],
    ],
    family: [
      ["Streambox", 18.99, 1],
      ["Family Cloud", 12.99, 8],
    ],
    freelancer: [
      ["Design Studio", 54.99, 1],
      ["Code Cloud", 19, 2],
      ["Task Space", 12, 61],
      ["Stock Library", 29, 74],
    ],
  };
  for (const [index, persona] of personas.entries()) {
    const rng = random(411 + index * 101);
    for (const [i, [merchant, monthlyPrice, idleDays]] of subDefinitions[persona.id].entries()) {
      subscriptions.push({
        id: `${persona.id}-sub-${i}`,
        userId: persona.id,
        merchant,
        monthlyPrice,
        lastUsedDate: daysAgo(anchor, idleDays),
        status: "active",
      });
    }
    let serial = 0;
    const add = (
      date: string,
      merchant: string,
      description: string,
      amount: number,
      category?: Category,
    ) =>
      transactions.push({
        id: `${persona.id}-tx-${serial++}`,
        userId: persona.id,
        date,
        merchant,
        description,
        amount: Math.round(amount * 100) / 100,
        currency: "USD",
        source: "synthetic",
        ...(category ? { category } : {}),
      });
    for (let offset = 5; offset >= 0; offset--) {
      const year = anchor.getUTCFullYear();
      const month = anchor.getUTCMonth() - offset;
      const maxDay =
        offset === 0 ? anchor.getUTCDate() : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const count = 28 + Math.floor(rng() * 5);
      for (let i = 0; i < count; i++) {
        const day = 1 + Math.floor(rng() * maxDay);
        const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
        const [merchant, description, min, max] =
          merchants[persona.id][Math.floor(rng() * merchants[persona.id].length)];
        const multiplier =
          offset === 0 && persona.id === "family" && merchant === "Fresh Market" ? 1.3 : 1;
        add(date, merchant, description, (min + rng() * (max - min)) * multiplier);
      }
      for (const [merchant, price] of subDefinitions[persona.id])
        add(
          new Date(Date.UTC(year, month, Math.min(5, maxDay))).toISOString().slice(0, 10),
          merchant,
          "Monthly subscription renewal",
          price,
        );
      if (persona.id === "freelancer") {
        add(
          new Date(Date.UTC(year, month, Math.min(8, maxDay))).toISOString().slice(0, 10),
          "Client Project",
          "Freelance project income",
          -(900 + rng() * 2100),
          "other",
        );
        add(
          new Date(Date.UTC(year, month, Math.min(21, maxDay))).toISOString().slice(0, 10),
          "Client Retainer",
          "Freelance retainer income",
          -(400 + rng() * 1200),
          "other",
        );
      }
    }
  }
  const now = anchor.toISOString();
  const db: Database = {
    version: 1,
    seedDate: now,
    personas,
    transactions: transactions.sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    ),
    subscriptions,
    suggestions: personas.map((persona) => ({
      id: `${persona.id}-topup`,
      userId: persona.id,
      title:
        persona.id === "student"
          ? "Your weekly grocery top-up"
          : persona.id === "family"
            ? "Your household grocery top-up"
            : "Your workspace essentials",
      description:
        "A suggested payment to this demo's Sandbox merchant. Review it before approving; it does not pay an actual retailer.",
      amount: persona.id === "student" ? 45 : 120,
      status: "proposed",
      createdAt: now,
    })),
    orders: [],
    activities: personas.map((persona) => ({
      id: `${persona.id}-initial-suggestion`,
      userId: persona.id,
      kind: "analysis" as const,
      message: `Prepared a $${persona.id === "student" ? "45.00" : "120.00"} Sandbox payment suggestion for your review. No order created.`,
      createdAt: now,
    })),
    classification: {},
    reasons: {},
    webhookIds: [],
  };
  ensurePlanning(db);
  return db;
}
