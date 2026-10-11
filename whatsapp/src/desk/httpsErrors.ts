import { HttpsError } from "firebase-functions/v2/https";
import { DeskError, type DeskErrorCode } from "./errors";

const CALLABLE_CODE: Record<DeskErrorCode, "invalid-argument" | "permission-denied" | "not-found" | "failed-precondition" | "internal"> = {
  invalid_argument: "invalid-argument",
  permission_denied: "permission-denied",
  not_found: "not-found",
  failed_precondition: "failed-precondition",
  internal: "internal",
};

/** Convert anything thrown inside a callable into an HttpsError with a user-readable message. */
export function toHttpsError(err: unknown, fallback: string): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof DeskError) return new HttpsError(CALLABLE_CODE[err.code], err.message);
  console.error(fallback, err);
  return new HttpsError("internal", fallback);
}
