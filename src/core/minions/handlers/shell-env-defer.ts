/**
 * Deferred-env support for `shell` jobs (secrets-at-rest fix).
 *
 * Problem this closes: callers historically passed a full environment
 * snapshot in `job.data.env`. That snapshot — live credential values
 * included — was persisted verbatim into `minion_jobs.data` (rows are kept
 * after completion) and echoed into managed-Postgres query logs by
 * auto_explain parameter logging. Secrets by design, at rest, twice.
 *
 * Fix, in two halves:
 *
 *   ENQUEUE (both submit surfaces — `src/commands/jobs.ts` and
 *   `src/core/ops/jobs.ts`): `splitDeferredEnv` strips entries whose KEY
 *   matches a credential-shaped pattern (or whose VALUE matches a known
 *   secret shape, as a backstop) out of `data.env`, and records only the
 *   stripped KEY NAMES in `data.env_deferred_keys`. Values never reach the
 *   database.
 *
 *   EXECUTE (`shell.ts` handler): each name in `env_deferred_keys` is
 *   resolved from the WORKER's local process environment
 *   (launchd/profile-provided) when the child env is built. Secrets live
 *   only on machines. A deferred key absent from the worker env is logged
 *   loudly (key NAME only) and the job proceeds — the failure, if any,
 *   stays attributable.
 *
 * Backward compatibility: rows enqueued before this change carry a full
 * `env` and no `env_deferred_keys`; they execute exactly as before.
 * Rows enqueued by a NEW submitter but executed by an OLD worker lose the
 * deferred values — deploy the execute side first (or together).
 */

/**
 * Key-name patterns that mark an env entry as credential-shaped.
 * Case-insensitive. Deliberately NOT a bare /KEY/ — structural keys like
 * GIT_CONFIG_KEY_0 (a git config KEY NAME, not a credential) must survive
 * in the stored env or the child's git credential wiring breaks.
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /API_?KEY/i,
  /DATABASE_URL/i,
  /CONNECTION_STRING/i,
  /PRIVATE_KEY/i,
  /CREDENTIAL/i,
  /ACCESS_KEY/i,
  /^ACCESS_/i,
  /_KEY$/i, // LINEAR_API_KEY, SUPABASE_SERVICE_KEY, … (GIT_CONFIG_KEY_0 ends in _KEY_0 and does not match)
];

/**
 * Value-shape backstop: even when the key name looks innocent, a value that
 * matches a well-known credential shape is treated as sensitive. These are
 * PREFIX tests against the raw value.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^xox[abprs]-/, // Slack bot/app/user/refresh tokens (xoxb-, xoxa-, xoxp-, xoxr-, xoxs-)
  /^xapp-/, // Slack app-level tokens
  /^gh[pousr]_[A-Za-z0-9]{16,}/, // GitHub fine/classic PATs + OAuth (ghp_, gho_, ghu_, ghs_, ghr_)
  /^github_pat_/,
  /^lin_api_/, // Linear API keys
  /^lin_oauth_/,
  /^sk-[A-Za-z0-9_-]{16,}/, // OpenAI/Anthropic-style secret keys
  /^AKIA[0-9A-Z]{16}$/, // AWS access key id
  /^eyJ[A-Za-z0-9_-]{10,}\.eyJ/, // JWTs (Supabase anon/service keys)
  /^postgres(ql)?:\/\/[^/\s:@]+:[^/\s@]+@/, // connection URL with embedded password
];

/** True when this env entry must not be persisted to the job row. */
export function isSensitiveEnvEntry(key: string, value: string): boolean {
  if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))) return true;
  if (value !== '' && SECRET_VALUE_PATTERNS.some((re) => re.test(value))) return true;
  return false;
}

export interface DeferredEnvSplit {
  /** Storable env: every entry that is safe to persist in the job row. */
  env: Record<string, string> | undefined;
  /** Sorted key NAMES stripped from `env`; resolved from the worker's local
   *  environment at execution time. Empty array when nothing was stripped. */
  deferredKeys: string[];
}

/**
 * Split a caller-supplied env map into a storable env and the list of
 * deferred key names. Sensitive keys are deferred even when their value is
 * an empty string — the worker-local value (if any) is the better source.
 * Non-string values are dropped (matches prior behavior: env must be
 * string→string, enforced by validation upstream).
 */
export function splitDeferredEnv(
  env: Record<string, string> | undefined,
): DeferredEnvSplit {
  if (!env) return { env: undefined, deferredKeys: [] };
  const kept: Record<string, string> = {};
  const deferred: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue;
    if (isSensitiveEnvEntry(key, value)) deferred.push(key);
    else kept[key] = value;
  }
  deferred.sort();
  return { env: kept, deferredKeys: deferred };
}

/**
 * Merge deferred keys from `localEnv` (the worker's own process env) into
 * `childEnv`, in place. Missing keys are reported through `warnMissing`
 * (key NAME only — never a value) and skipped; the job proceeds so the
 * eventual failure, if any, is attributable to the named key.
 *
 * Precedence note: callers apply this BEFORE the stored `env` overlay, so
 * an explicitly stored plaintext value for the same key (legacy rows, or a
 * caller that insists) still wins — stored env merges OVER the local
 * baseline.
 */
export function applyDeferredEnv(
  childEnv: Record<string, string>,
  deferredKeys: string[] | undefined,
  localEnv: Record<string, string | undefined>,
  warnMissing: (key: string) => void,
): void {
  if (!deferredKeys || deferredKeys.length === 0) return;
  for (const key of deferredKeys) {
    const value = localEnv[key];
    if (typeof value === 'string') childEnv[key] = value;
    else warnMissing(key);
  }
}
