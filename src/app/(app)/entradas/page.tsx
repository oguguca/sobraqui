import type { Metadata } from "next";

import { FlowPage } from "@/components/flow/flow-page";

export const metadata: Metadata = { title: "Entradas" };

export default async function IncomePage({ searchParams }: PageProps<"/entradas">) {
  return <FlowPage kind="income" basePath="/entradas" searchParams={await searchParams} />;
}
