// The CMS-owned content files, typed as `unknown` on purpose: their inferred JSON shape is
// never trusted, only the validated `Content` leaves this library. Declaring them here (rather
// than enabling `resolveJsonModule`) also keeps the JSON out of this project's TypeScript
// program, so the library's `rootDir` stays `src`.
declare module '@qa3elhamor/content-files/site.json' {
  const file: unknown;
  export default file;
}
declare module '@qa3elhamor/content-files/resume.json' {
  const file: unknown;
  export default file;
}
declare module '@qa3elhamor/content-files/services.json' {
  const file: unknown;
  export default file;
}
declare module '@qa3elhamor/content-files/projects.json' {
  const file: unknown;
  export default file;
}
declare module '@qa3elhamor/content-files/credits.json' {
  const file: unknown;
  export default file;
}
