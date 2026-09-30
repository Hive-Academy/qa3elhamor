const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable descendants in tab order (DOM order; positive tabindex is not supported). */
export const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && !el.closest('[hidden]'),
  );

/**
 * Whether focus can meaningfully go back to `element`: it is still in the page, is not the
 * body (where a click on the canvas leaves focus), and is not hidden from assistive
 * technology (the canvas and its beacons are `aria-hidden`).
 */
export function isReturnableFocus(
  element: Element | null,
): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    element !== element.ownerDocument.body &&
    !element.closest('[aria-hidden="true"]') &&
    !element.closest('[inert]')
  );
}

/**
 * Makes everything outside `keep` inert (unreachable by Tab, the virtual cursor and the
 * pointer): every sibling of `keep` and of each of its ancestors up to `<body>`. Returns the
 * undo, which restores each element's own previous `inert` value.
 */
export function inertOutside(keep: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (
    let node: HTMLElement = keep;
    node.parentElement;
    node = node.parentElement
  ) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (
        sibling === node ||
        !(sibling instanceof HTMLElement) ||
        sibling.hasAttribute('inert')
      )
        continue;
      if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;
      sibling.setAttribute('inert', '');
      changed.push(sibling);
    }
    if (node.parentElement === node.ownerDocument.body) break;
  }
  return () => {
    for (const element of changed) element.removeAttribute('inert');
  };
}
