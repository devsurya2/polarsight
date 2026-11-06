import { Router, type CookieOptions, type Request, type Response } from "express";
import { env, isProd } from "../../config/env.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth, ACCESS_COOKIE, REFRESH_COOKIE } from "../../middleware/auth.js";
import { loginLimiter } from "../../middleware/rateLimit.js";
import { ttlToMs } from "../../lib/tokens.js";
import { writeAudit } from "../../lib/audit.js";
import { UnauthorizedError } from "../../lib/errors.js";
import { changePasswordSchema, loginSchema } from "./validators.js";
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
}

const ctxOf = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

authRouter.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await service.login(email, password, ctxOf(req));
      setSessionCookies(res, result.accessToken, result.refreshToken);
      req.user = {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        permissions: result.user.permissions,
      };
      await writeAudit(req, { action: "auth.login", entity: "AdminUser", entityId: result.user.id });
      res.json({ user: result.user, accessToken: result.accessToken });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const presented = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
    if (!presented) throw new UnauthorizedError("No session to refresh");
    const result = await service.refresh(presented, ctxOf(req));
    setSessionCookies(res, result.accessToken, result.refreshToken);
    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    clearSessionCookies(res);
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    clearSessionCookies(res);
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

authRouter.post(
  "/change-password",
  requireAuth,
  validate({ body: changePasswordSchema }),
  async (req, res, next) => {
    try {
      await service.changeOwnPassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword
      );
      await writeAudit(req, {
        action: "auth.change_password",
        entity: "AdminUser",
        entityId: req.user!.id,
      });
      clearSessionCookies(res);
      res.json({ message: "Password changed. Please sign in again." });
    } catch (err) {
      next(err);
    }
  }
);
