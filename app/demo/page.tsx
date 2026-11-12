import Dashboard from "@/components/dashboard";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Penny — PayPal Sandbox playground" };
export default function DemoPage() {
  return <Dashboard />;
}
