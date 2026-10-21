import "server-only";
import { getConfig } from "@/lib/config";

export function emailConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.SMTP_HOST && c.SMTP_FROM);
}

/** Send a plain-text email via the configured SMTP server. Returns false if not configured. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const c = getConfig();
  if (!c.SMTP_HOST || !c.SMTP_FROM) return false;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_PORT === 465,
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASSWORD ?? "" } : undefined,
  });
  await transport.sendMail({ from: c.SMTP_FROM, to, subject, text });
  return true;
}
