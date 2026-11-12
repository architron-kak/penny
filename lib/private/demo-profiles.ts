// Safe to import in the client: labels only, no credentials or private records.
export const demoProfiles = [
  {
    id: "student",
    name: "Student",
    title: "Студент",
    description: "Повседневные траты, кофе и накопления",
    currencies: "KZT · USD · EUR",
  },
  {
    id: "family",
    name: "Family",
    title: "Семья",
    description: "Семейный бюджет, продукты и счета",
    currencies: "KZT · USD · EUR",
  },
  {
    id: "freelancer",
    name: "Freelancer",
    title: "Фрилансер",
    description: "Доходы от проектов и расходы в разных валютах",
    currencies: "USD · KZT · EUR",
  },
] as const;
export type DemoProfile = (typeof demoProfiles)[number]["id"];
