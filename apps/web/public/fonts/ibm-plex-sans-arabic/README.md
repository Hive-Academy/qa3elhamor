# IBM Plex Sans Arabic

The site's Arabic face, used for every Arabic glyph (the `@font-face` rules in
`apps/web/src/styles.css` limit it to the Arabic Unicode ranges, so Latin text keeps the system
font and a browser downloads a file only when the page shows Arabic).

- Source: the `@ibm/plex-sans-arabic@1.1.0` release
  (https://github.com/IBM/plex/releases), `fonts/complete/woff2/`.
- Files: `IBMPlexSansArabic-Regular.woff2` (weights up to 500) and
  `IBMPlexSansArabic-SemiBold.woff2` (weights from 501), shipped **unmodified**. "Plex" is a
  Reserved Font Name under the licence, so the files must not be subset or otherwise altered
  under this name.
- Licence: SIL Open Font License 1.1, in `LICENSE.txt` next to the fonts.
