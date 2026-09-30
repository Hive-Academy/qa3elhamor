/** The integration database. Never `DATABASE_URL`: the suite truncates what it points at. */
export const INTEGRATION_DATABASE_URL =
  process.env['INTEGRATION_DATABASE_URL'] ??
  'postgresql://qa3elhamor:qa3elhamor@localhost:15432/qa3elhamor_test';
