import type { Metadata } from "next";
import FinanceCabinet from "@/components/finance-cabinet";
import "./cabinet.css";
export const metadata: Metadata = { title: "Penny — Личный финансовый кабинет" };
export default function CabinetPage() {
  return <FinanceCabinet />;
}
