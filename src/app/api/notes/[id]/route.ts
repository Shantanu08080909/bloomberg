import { intParam, parseJson, route } from "@/lib/server/api";
import { deleteNote, NoteInputSchema, updateNote } from "@/lib/services/user-data";

export const PATCH = route<{ id: string }>(async ({ req, db, user, params }) => ({
  note: await updateNote(db, user.id, intParam(params.id), await parseJson(req, NoteInputSchema)),
}));

export const DELETE = route<{ id: string }>(async ({ db, user, params }) => {
  await deleteNote(db, user.id, intParam(params.id));
  return { ok: true };
});
