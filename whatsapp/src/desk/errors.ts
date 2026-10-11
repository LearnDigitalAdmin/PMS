export type DeskErrorCode = "invalid_argument" | "permission_denied" | "not_found" | "failed_precondition" | "internal";

/** One error type for every desk module. Delegate maps it to the contract's DelegateError, callables map it to HttpsError. */
export class DeskError extends Error {
  constructor(public readonly code: DeskErrorCode, message: string) {
    super(message);
    this.name = "DeskError";
  }
}
