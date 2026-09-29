import type { Metadata } from "next";
import FinanceView from "@/components/views/FinanceView";

export const metadata: Metadata = { title: "Financeiro · NexaLeads" };

export default function FinanceiroPage() {
  return <FinanceView />;
}
