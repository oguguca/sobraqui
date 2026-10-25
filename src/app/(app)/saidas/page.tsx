import type { Metadata } from "next";

import { FlowPage } from "@/components/flow/flow-page";

export const metadata: Metadata = { title: "Saídas" };

export default async function ExpensesPage({ searchParams }: PageProps<"/saidas">) {
  return <FlowPage kind="expense" basePath="/saidas" searchParams={await searchParams} />;
}
