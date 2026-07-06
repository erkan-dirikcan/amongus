import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Invalid input",
      details: err.issues.map((i) => ({ path: i.path, message: i.message })),
    });
    return;
  }

  const status = err.status ?? 500;
  const code = err.code ?? "internal_error";

  if (status >= 500) {
    console.error("[server] Unhandled error:", err);
  }

  res.status(status).json({
    error: code,
    message: status >= 500 ? "Internal server error" : err.message,
  });
}
