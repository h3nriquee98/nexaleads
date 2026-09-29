import type { Metadata } from "next";
import LeadsView from "@/components/views/LeadsView";

export const metadata: Metadata = { title: "Meus leads · NexaLeads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ nicho?: string; status?: string }> }) {
  const { nicho, status } = await searchParams;
  return <LeadsView niche={typeof nicho === "string" ? nicho : undefined} status={typeof status === "string" ? status : undefined} />;
}
