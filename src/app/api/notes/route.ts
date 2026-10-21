import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/server/api";
import { createNote, listNotes, NoteInputSchema } from "@/lib/services/user-data";

export const GET = route(async ({ req, db, user }) => {
  const q = parseQuery(req, z.object({ q: z.string().max(100).optional(), instrumentId: z.coerce.number().int().positive().optional() }));
  return { notes: await listNotes(db, user.id, q) };
});

export const POST = route(async ({ req, db, user }) => ({ note: await createNote(db, user.id, await parseJson(req, NoteInputSchema)) }));
