/**
 * Contracts shared across the static/serverless boundary.
 *
 * This library is the ONLY type channel between `apps/web` and `apps/api`. Neither app may
 * import the other's source; both import these contracts. Keep it free of runtime logic and
 * of any dependency other than `shared/domain`.
 */
export interface HealthResponse {
  readonly status: 'ok';
  /** ISO-8601 timestamp of the response. */
  readonly checkedAt: string;
}
