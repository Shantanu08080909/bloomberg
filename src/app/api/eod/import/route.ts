import { importFiles } from "@/lib/eod/importer";
import { ApiError, route } from "@/lib/server/api";
import { refreshEodFlag } from "@/lib/server/db";
import { requireOwner } from "@/lib/server/owner";

const MAX_FILE = 250 * 1024 * 1024;
const MAX_FILES = 40;

/** Manual import of official CSV/ZIP files or a TejHQ parquet archive (multipart/form-data, field "files"). */
export const POST = route(
  async ({ req, db, user }) => {
    await requireOwner(db, user.id);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected multipart/form-data with one or more files", "bad_form");
    }
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
    if (files.length === 0) throw new ApiError(400, "No files uploaded", "no_files");
    if (files.length > MAX_FILES) throw new ApiError(400, `Upload at most ${MAX_FILES} files at a time`, "too_many");
    for (const f of files) {
      if (f.size > MAX_FILE) throw new ApiError(413, `${f.name} is larger than 250 MB`, "too_large");
      if (!/\.(csv|zip|parquet)$/i.test(f.name)) throw new ApiError(400, `${f.name}: only .csv, .zip and .parquet files are accepted`, "bad_type");
    }
    const force = form.get("force") === "true";
    const raw = await Promise.all(files.map(async (f) => ({ name: f.name.replace(/[^\w.\-]/g, "_"), bytes: new Uint8Array(await f.arrayBuffer()) })));
    const results = await importFiles(db, raw, { mode: "manual", userId: user.id, force });
    await refreshEodFlag(db);
    return { results: results.map(({ instrumentIds, ...r }) => ({ ...r, instruments: instrumentIds.length })) };
  },
  { heavy: true },
);
