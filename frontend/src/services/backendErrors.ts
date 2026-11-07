export const QUOTA_MESSAGE = "JPfaral is temporarily unavailable because the database service's data-transfer quota has been exceeded. Ask the administrator to restore service in Supabase Billing.";

export class BackendRestrictionError extends Error {
  constructor(message = "Supabase has restricted this project's service. Ask the administrator to review Supabase Billing and Usage.") {
    super(message); this.name = "BackendRestrictionError";
  }
}

export class BackendQuotaError extends BackendRestrictionError {
  constructor() { super(QUOTA_MESSAGE); this.name = "BackendQuotaError"; }
}

type ServiceError = { status?: number; message?: string; code?: string; name?: string };
export function backendError(error: ServiceError | null | undefined, fallback: string): Error {
  if (/exceed_egress_quota|egress.{0,30}quota/i.test(error?.message ?? ""))
    return new BackendQuotaError();
  if (error?.status === 402) return new BackendRestrictionError();
  return new Error(fallback);
}

export function signInError(error: ServiceError | null | undefined): Error {
  const fallback = error?.status === 429 ? "Too many sign-in attempts. Wait a few minutes and try again."
    : !error?.status || error.status >= 500 || error.name === "AuthRetryableFetchError"
      ? "The sign-in service is temporarily unavailable. Check your connection and try again."
      : "Unable to sign in. Check your credentials and try again.";
  return backendError(error, fallback);
}
