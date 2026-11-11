import { revalidateTag } from "next/cache";
import crypto from "node:crypto";

/**
 * On-demand cache invalidation.
 *
 * Pages are regenerated at most once a minute on their own, which is
 * enough for correctness but feels slow to an editor who has just
 * pressed Publish. The API calls this endpoint after a publish so the
 * change appears straight away.
 *
 * Authentication is a shared secret compared in constant time. Without
 * REVALIDATE_SECRET set the route refuses every request rather than
 * defaulting to open: an unauthenticated cache-buster is a cheap way
 * to force a site to regenerate every page on demand.
 */

export const dynamic = "force-dynamic";

const SECRET = process.env.REVALIDATE_SECRET ?? "";

/** Timing-safe comparison that does not leak the secret's length. */
function matches(presented) {
  if (!SECRET || !presented) return false;
  const a = crypto.createHash("sha256").update(SECRET).digest();
  const b = crypto.createHash("sha256").update(presented).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!SECRET) {
    // Deliberately not 401: nothing is misconfigured on the caller's
    // side, and saying so helps whoever is setting this up.
    return Response.json(
      {
        revalidated: false,
        reason:
          "REVALIDATE_SECRET is not set on the website. Pages still refresh on their own within a minute.",
      },
      { status: 503 }
    );
  }

  const presented =
    request.headers.get("x-revalidate-secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!matches(presented)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }

  let tags = ["site-content"];
  try {
    const body = await request.json();
    if (Array.isArray(body?.tags) && body.tags.length > 0) {
      // Bounded and shape-checked: a tag list is caller input.
      tags = body.tags
        .filter((t) => typeof t === "string" && t.length > 0 && t.length <= 120)
        .slice(0, 20);
    }
  } catch {
    // No body, or not JSON. The default tag covers everything.
  }

  for (const tag of tags) revalidateTag(tag);

  return Response.json({ revalidated: true, tags, at: new Date().toISOString() });
}
