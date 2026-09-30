/**
 * Appends one async `<script>` to `<head>` and settles when it loads or fails. The element
 * carries only the attributes given: no `crossorigin` (the providers do not need CORS for
 * the script) and never any cookie-related option.
 */
export function injectScript(
  doc: Document,
  src: string,
  attributes: Readonly<Record<string, string>>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = src;
    for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error(`analytics script failed: ${src}`)), {
      once: true,
    });
    doc.head.appendChild(script);
  });
}
