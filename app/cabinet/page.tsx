import type { Metadata } from "next";
import FinanceCabinet from "@/components/finance-cabinet";
import "./cabinet.css";
export const metadata: Metadata = { title: "Penny — Your adaptive money workspace" };
export default function CabinetPage() {
  return <FinanceCabinet />;
}
