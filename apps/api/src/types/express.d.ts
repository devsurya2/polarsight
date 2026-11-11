import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        /** Loaded from the role on every request, never trusted from the token. */
        permissions: string[];
        /** The session family this request's token belongs to. */
        sid: string;
        /** "mfa_setup" is a restricted session that may only enrol MFA. */
        scope: "full" | "mfa_setup";
      };
    }
  }
}

export {};
