/**
 * Tells the public website that published content has changed.
 *
 * The site regenerates on its own within a minute, so this is an
 * optimisation rather than a dependency: it makes a publish appear
 * immediately instead of shortly. It is therefore best-effort and
 * never throws — a website that is down must not stop an
 * administrator from publishing.
 *
 * Without REVALIDATE_SECRET configured it does nothing at all, and
 * says so in the logs rather than failing quietly.
 */

import { env } from "../config/env.js";
import { logger } from "./logger.js";

const TIMEOUT_MS = 3000;

export type RevalidateResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: "not_configured" | "failed"; detail?: string };

/**
 * Asks the website to drop its cache for the given tags.
 *
 * Fire-and-forget by design: callers do not await it, because the
 * administrator's publish has already succeeded by this point.
 */
export async function revalidateSite(tags: string[] = ["site-content"]): Promise<RevalidateResult> {
  if (!env.REVALIDATE_SECRET) {
    return { ok: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${env.WEB_URL.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": env.REVALIDATE_SECRET,
      },
      body: JSON.stringify({ tags }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, tags }, "website revalidation refused");
      return { ok: false, reason: "failed", detail: `HTTP ${res.status}` };
    }

    logger.info({ tags }, "website cache invalidated");
    return { ok: true, tags };
  } catch (err) {
    // The site regenerates on its own, so this is a warning.
    logger.warn(
      { err, tags },
      "could not reach the website to invalidate its cache; it will refresh on its own"
    );
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : undefined };
  } finally {
    clearTimeout(timer);
  }
}

/** Kicks off a revalidation without making the caller wait for it. */
export function revalidateInBackground(tags?: string[]): void {
  void revalidateSite(tags);
}
