import { Router, type CookieOptions, type Request, type Response } from "express";
import { env, isProd } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { optionalAuth, requireAuth, ACCESS_COOKIE, REFRESH_COOKIE } from "../../middleware/auth.js";
import { loginIpLimiter, loginLimiter } from "../../middleware/rateLimit.js";
import { ELEVATED_COOKIE, ELEVATION_TTL_MS, signElevation } from "../../middleware/reauth.js";
import { ttlToMs } from "../../lib/tokens.js";
import { writeAudit } from "../../lib/audit.js";
import { UnauthorizedError } from "../../lib/errors.js";
import {
  changePasswordSchema,
  loginSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  reauthSchema,
} from "./validators.js";
import * as service from "./service.js";

export const authRouter = Router();

function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    // "lax" lets the admin portal work on a sibling port in dev while
    // still blocking cross-site form posts.
    sameSite: isProd ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN,
    path: "/",
    maxAge: maxAgeMs,
  };
}

/**
 * The session lives only in httpOnly cookies. The access token is
 * never placed in a response body: a token readable by JavaScript is
 * a token readable by any script that gets onto the page.
 */
function setSessionCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ttlToMs(env.JWT_ACCESS_TTL)));
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions(ttlToMs(env.JWT_REFRESH_TTL)),
    path: "/api/auth",
  });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...cookieOptions(0), maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(0), maxAge: undefined, path: "/api/auth" });
  res.clearCookie(ELEVATED_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

const ctxOf = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

/** Nothing authenticated is cacheable. */
authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

authRouter.post(
  "/login",
  loginIpLimiter,
  loginLimiter,
  validate({ body: loginSchema }),
  async (req, res, next) => {
    const { email, password } = req.body;
    try {
      const result = await service.login(email, password, ctxOf(req));

      if (result.kind === "mfa") {
        // The password was right; the session waits for the code.
        res.json({ mfaRequired: true, challenge: result.challenge });
        return;
      }

      const { accessToken, refreshToken, user, sid } = result.session;
      setSessionCookies(res, accessToken, refreshToken);
      req.user = { id: user.id, email: user.email, role: user.role, permissions: user.permissions, sid, scope: "full" };
      await writeAudit(req, { action: "auth.login", entity: "AdminUser", entityId: user.id });
      res.json({ user });
    } catch (err) {
      // A failed sign-in is recorded against the address that was
      // typed, not against an account: at this point there may be no
      // account, and attributing it to one would assert it exists.
      // The password is never part of the record.
      await writeAudit(req, {
        action: "auth.login_failed",
        entity: "AdminUser",
        actorLabel: email,
        after: { reason: err instanceof Error ? err.message : "unknown" },
      });
      next(err);
    }
  }
);

/** Second step of sign-in for accounts with a second factor. */
authRouter.post(
  "/mfa/verify",
  loginIpLimiter,
  validate({ body: mfaVerifySchema }),
  async (req, res, next) => {
    try {
      const { challenge, code } = req.body as { challenge: string; code: string };
      const { accessToken, refreshToken, user, sid } = await service.completeMfaLogin(challenge, code, ctxOf(req));
      setSessionCookies(res, accessToken, refreshToken);
      req.user = { id: user.id, email: user.email, role: user.role, permissions: user.permissions, sid, scope: "full" };
      await writeAudit(req, { action: "auth.login", entity: "AdminUser", entityId: user.id, after: { mfa: true } });
      res.json({ user });
    } catch (err) {
      await writeAudit(req, {
        action: "auth.mfa_failed",
        entity: "AdminUser",
        after: { reason: err instanceof Error ? err.message : "unknown" },
      });
      next(err);
    }
  }
);

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedError("No session to refresh");
    const result = await service.refresh(presented, ctxOf(req));
    setSessionCookies(res, result.accessToken, result.refreshToken);
    res.json({ user: result.user });
  } catch (err) {
    clearSessionCookies(res);
    next(err);
  }
});

authRouter.post("/logout", optionalAuth, async (req, res, next) => {
  try {
    await service.logout(req.cookies?.[REFRESH_COOKIE], req.user?.sid);
    clearSessionCookies(res);
    if (req.user) {
      await writeAudit(req, { action: "auth.logout", entity: "AdminUser", entityId: req.user.id });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    res.json({ user: await service.currentUser(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Re-authentication for sensitive actions. On success a short-lived
 * elevation cookie is set; routes guarded by requireRecentAuth accept
 * it for ten minutes.
 */
authRouter.post(
  "/reauth",
  requireAuth,
  loginIpLimiter,
  validate({ body: reauthSchema }),
  async (req, res, next) => {
    try {
      const { password, code } = req.body as { password: string; code?: string };
      await service.reauthenticate(req.user!.id, password, code);
      res.cookie(ELEVATED_COOKIE, signElevation(req.user!.id, req.user!.sid), cookieOptions(ELEVATION_TTL_MS));
      await writeAudit(req, { action: "auth.reauth", entity: "AdminUser", entityId: req.user!.id });
      res.json({ elevatedUntil: new Date(Date.now() + ELEVATION_TTL_MS).toISOString() });
    } catch (err) {
      await writeAudit(req, { action: "auth.reauth_failed", entity: "AdminUser", entityId: req.user!.id });
      next(err);
    }
  }
);

authRouter.post(
  "/change-password",
  requireAuth,
  validate({ body: changePasswordSchema }),
  async (req, res, next) => {
    try {
      await service.changeOwnPassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
      await writeAudit(req, { action: "auth.change_password", entity: "AdminUser", entityId: req.user!.id });
      clearSessionCookies(res);
      res.json({ message: "Password changed. Please sign in again." });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Two-factor enrolment ─────────────────────────────────── */

authRouter.post("/mfa/setup", requireAuth, async (req, res, next) => {
  try {
    const { secret, otpauth } = await service.beginMfaEnrolment(req.user!.id);
    // Shown once. Not audited: the secret must never reach a log.
    res.json({ secret, otpauth });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/mfa/confirm", requireAuth, validate({ body: mfaConfirmSchema }), async (req, res, next) => {
  try {
    const { recoveryCodes } = await service.confirmMfaEnrolment(req.user!.id, (req.body as { code: string }).code);
    await writeAudit(req, { action: "auth.mfa_enabled", entity: "AdminUser", entityId: req.user!.id });
    // A restricted session becomes a full one by signing in again.
    const restricted = req.user!.scope === "mfa_setup";
    if (restricted) clearSessionCookies(res);
    res.json({
      recoveryCodes,
      message: restricted
        ? "Two-factor authentication is on. Sign in again to continue."
        : "Two-factor authentication is on.",
      signInAgain: restricted,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/mfa/disable", requireAuth, validate({ body: mfaDisableSchema }), async (req, res, next) => {
  try {
    const { password, code } = req.body as { password: string; code: string };
    await service.disableMfa(req.user!.id, password, code);
    await writeAudit(req, { action: "auth.mfa_disabled", entity: "AdminUser", entityId: req.user!.id });
    res.json({ message: "Two-factor authentication is off." });
  } catch (err) {
    next(err);
  }
});

authRouter.post(
  "/mfa/recovery-codes",
  requireAuth,
  validate({ body: mfaConfirmSchema }),
  async (req, res, next) => {
    try {
      const { recoveryCodes } = await service.regenerateRecoveryCodes(req.user!.id, (req.body as { code: string }).code);
      await writeAudit(req, { action: "auth.mfa_recovery_regenerated", entity: "AdminUser", entityId: req.user!.id });
      res.json({ recoveryCodes });
    } catch (err) {
      next(err);
    }
  }
);
