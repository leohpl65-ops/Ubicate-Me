import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireUser: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Debes iniciar sesión para continuar." });
    return;
  }

  req.userId = userId;
  next();
};

export function signedInUserId(req: Request): string {
  if (!req.userId) {
    throw new Error("Authenticated request is missing its user ID.");
  }
  return req.userId;
}
