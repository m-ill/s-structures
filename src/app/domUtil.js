/**
 * `element.innerHTML = ''` is unreliable across the DOM shims used in this
 * codebase's fake-document test helpers (some only clear the text/HTML
 * string, not the actual child node list). Clear via removeChild instead,
 * which works identically on real and fake documents.
 */
export function clearElement(element) {
  const children = Array.from(element.children || element.childNodes || []);
  for (const child of children) element.removeChild(child);
}
