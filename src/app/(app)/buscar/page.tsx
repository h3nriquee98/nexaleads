import type { Metadata } from "next";
import SearchView from "@/components/views/SearchView";

export const metadata: Metadata = { title: "Buscar leads · NexaLeads" };

export default function BuscarPage() {
  return <SearchView />;
}
