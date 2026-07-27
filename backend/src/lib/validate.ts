import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "./http";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ApiError(400, result.error.issues.map((i) => i.message).join("; ")));
      return;
    }
    req.body = result.data;
    next();
  };
}
