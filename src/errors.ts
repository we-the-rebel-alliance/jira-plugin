import { refusal, RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"
import { ProviderError } from "./provider/atlassian.ts"
import { safeReason } from "./redact.ts"

/**
 * A handler's failure as the contract's refusal. The provider's own code passes through (a sign-in, a rate limit, an
 * option), and anything else is `UNAVAILABLE` with one redacted line.
 */
export function refusalFor(error: unknown, method: string, next: string): RegisterError {
  if (error instanceof RegisterError) return error
  if (error instanceof ProviderError) return new RegisterError(refusal(error.code, error.message, error.next))
  return new RegisterError(refusal("UNAVAILABLE", `${method} failed: ${safeReason(error)}`, next))
}
