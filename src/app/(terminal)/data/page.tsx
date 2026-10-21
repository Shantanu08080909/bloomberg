import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getActiveSourceId } from "@/lib/server/context";
import { db } from "@/lib/server/db";
import { EXPORT_POLICY } from "@/lib/server/export-policy";
import { listEconomicSeries } from "@/lib/services/content";
import { datasetCatalog, DATASETS } from "@/lib/services/datasets";
import { DataExplorerClient } from "./DataExplorerClient";

export const metadata: Metadata = { title: "Data Explorer" };

export default async function DataPage() {
  const database = await db();
  const sourceId = getActiveSourceId();
  const [catalog, series] = await Promise.all([datasetCatalog(database, sourceId), listEconomicSeries(database)]);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Data Explorer" subtitle="Browse datasets, inspect schemas and freshness, run bounded queries and export what the source permits." />
      <DataExplorerClient
        datasets={DATASETS}
        catalog={catalog}
        series={series.map((s) => ({ id: s.id, name: s.name, sourceId: s.sourceId }))}
        sourceId={sourceId}
        exportable={Object.fromEntries(Object.entries(EXPORT_POLICY).map(([k, v]) => [k, v.allowed]))}
      />
    </div>
  );
}
