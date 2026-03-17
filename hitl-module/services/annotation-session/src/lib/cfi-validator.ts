/** Validates that a string is a well-formed EPUB CFI. */
const CFI_REGEX = /^epubcfi\(.+\)$/;

export function validateCfi(cfi: string): boolean {
  return CFI_REGEX.test(cfi);
}
