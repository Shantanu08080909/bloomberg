import { describeConfig } from "@/lib/config";
import { downloadConfig, tejConfig } from "@/lib/eod/download";
import { eodSummary, lastOfficialDate, listImports } from "@/lib/eod/importer";
import { route } from "@/lib/server/api";
import { getActiveSourceId } from "@/lib/server/context";
import { isOwner } from "@/lib/server/owner";

export const GET = route(async ({ db, user }) => {
  const cfg = downloadConfig();
  return {
    activeSource: getActiveSourceId(),
    owner: await isOwner(db, user.id),
    summary: await eodSummary(db),
    lastOfficial: { NSE: await lastOfficialDate(db, "NSE"), BSE: await lastOfficialDate(db, "BSE") },
    imports: await listImports(db, 50),
    download: { enabled: cfg.enabled, exchanges: describeConfig().eodExchanges, maxDaysPerRun: cfg.maxDaysPerRun, publishAfterIst: cfg.publishAfterIst },
    tej: { enabled: tejConfig().enabled },
  };
});
