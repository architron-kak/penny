// Safe to import in the client: labels only, no credentials or private records.
export const demoProfiles = [
  {
    id: "student",
    name: "Student",
    title: "Student",
    description: "Everyday spending, coffee and savings",
    currencies: "USD · $",
  },
  {
    id: "family",
    name: "Family",
    title: "Family",
    description: "Household budget, groceries and bills",
    currencies: "USD · $",
  },
  {
    id: "freelancer",
    name: "Freelancer",
    title: "Freelancer",
    description: "Project income and business expenses",
    currencies: "USD · $",
  },
] as const;
export type DemoProfile = (typeof demoProfiles)[number]["id"];
