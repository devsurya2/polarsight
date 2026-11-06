import "express";

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: string;
      permissions: string[];
    }
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
