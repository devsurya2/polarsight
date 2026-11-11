/**
 * Outbound email.
 *
 * Email is optional. When SMTP is not configured the API does not
 * pretend: `send` returns `{ sent: false, reason: "not_configured" }`,
 * the attempt is recorded in the audit trail as skipped, and the
 * caller reports that honestly to the administrator. Nothing in the
 * admin portal ever claims a message was delivered unless a transport
 * actually accepted it.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text body. Always provided; HTML is derived from it. */
  text: string;
  replyTo?: string | undefined;
}

export type MailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: "not_configured" | "failed"; detail?: string };

/** True when there is enough configuration to attempt delivery. */
export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.MAIL_FROM);
}

/**
 * Describes the email integration for the settings screen. Deliberately
 * omits the password: no secret leaves the server.
 */
export function emailStatus() {
  return {
    configured: isEmailConfigured(),
    host: env.SMTP_HOST ?? null,
    port: env.SMTP_HOST ? env.SMTP_PORT : null,
    secure: env.SMTP_HOST ? env.SMTP_SECURE : null,
    from: env.MAIL_FROM ?? null,
    // Reported so an operator can see whether auth is in use, never
    // the credential itself.
    authUser: env.SMTP_USER ? maskAddress(env.SMTP_USER) : null,
  };
}

/** a***@example.com — enough to recognise, not enough to reuse. */
function maskAddress(value: string): string {
  const [local, domain] = value.split("@");
  if (!domain || !local) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
  });
  return transporter;
}

/** Minimal, safe HTML: the text is escaped, never interpolated raw. */
function toHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#15181f;max-width:560px">`,
    paragraphs,
    `<hr style="border:none;border-top:1px solid #e3e6eb;margin:24px 0">`,
    `<p style="margin:0;font-size:12px;color:#6b7280">POLARSIGHT</p>`,
    `</div>`,
  ].join("");
}

/**
 * Attempts delivery. Never throws: a mail failure must not roll back
 * the action the administrator asked for, but it is reported back so
 * the interface can say what actually happened.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!isEmailConfigured()) {
    logger.info(
      { to: maskAddress(message.to), subject: message.subject },
      "email not configured; message not sent"
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    const info = await getTransport().sendMail({
      from: env.MAIL_FROM!,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: toHtml(message.text),
      ...(message.replyTo || env.MAIL_REPLY_TO
        ? { replyTo: message.replyTo ?? env.MAIL_REPLY_TO }
        : {}),
    });
    logger.info(
      { to: maskAddress(message.to), subject: message.subject, messageId: info.messageId },
      "email sent"
    );
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ err, to: maskAddress(message.to) }, "email delivery failed");
    return {
      sent: false,
      reason: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ── Recruitment templates ────────────────────────────────────
 *
 * Deliberately plain. None of these state a salary, a start date, a
 * guarantee of employment, or any term the business has not agreed.
 * Anything specific to one candidate goes in `extra`, written by the
 * administrator.
 */

export interface TemplateContext {
  name: string;
  position: string;
  /** Free text the administrator adds, e.g. interview details. */
  extra?: string | undefined;
}

const sign = (body: string, extra?: string) =>
  [body.trim(), extra?.trim(), "— The PolarSight team"].filter(Boolean).join("\n\n");

export const applicationTemplates = {
  received: (c: TemplateContext): Omit<MailMessage, "to"> => ({
    subject: `We have received your application — ${c.position}`,
    text: sign(
      `Hello ${c.name},\n\nThank you for applying for the ${c.position} position at PolarSight. ` +
        `Your application has been received and is now with our team for review.\n\n` +
        `We will be in touch about the next step. You do not need to do anything further for now.`,
      c.extra
    ),
  }),

  shortlisted: (c: TemplateContext): Omit<MailMessage, "to"> => ({
    subject: `Your application has been shortlisted — ${c.position}`,
    text: sign(
      `Hello ${c.name},\n\nYour application for the ${c.position} position has been shortlisted. ` +
        `We would like to take it to the next stage of our process.`,
      c.extra
    ),
  }),

  interview: (c: TemplateContext): Omit<MailMessage, "to"> => ({
    subject: `Interview invitation — ${c.position}`,
    text: sign(
      `Hello ${c.name},\n\nWe would like to invite you to a technical interview for the ` +
        `${c.position} position.`,
      c.extra
    ),
  }),

  selected: (c: TemplateContext): Omit<MailMessage, "to"> => ({
    subject: `Outcome of your application — ${c.position}`,
    text: sign(
      `Hello ${c.name},\n\nFollowing our process for the ${c.position} position, we would like ` +
        `to take things forward with you. A member of our team will contact you to discuss the ` +
        `details of the arrangement.`,
      c.extra
    ),
  }),

  rejected: (c: TemplateContext): Omit<MailMessage, "to"> => ({
    subject: `Outcome of your application — ${c.position}`,
    text: sign(
      `Hello ${c.name},\n\nThank you for your interest in the ${c.position} position and for the ` +
        `time you gave to our process. On this occasion we will not be taking your application ` +
        `further.\n\nWe appreciate you applying, and you are welcome to apply again for future openings.`,
      c.extra
    ),
  }),
} satisfies Record<string, (c: TemplateContext) => Omit<MailMessage, "to">>;

export type ApplicationTemplateKey = keyof typeof applicationTemplates;

export const enquiryTemplates = {
  received: (c: { name: string }): Omit<MailMessage, "to"> => ({
    subject: "We have received your enquiry",
    text: sign(
      `Hello ${c.name},\n\nThank you for contacting PolarSight. Your enquiry has reached our ` +
        `team and we will respond as soon as we can.`
    ),
  }),
};
