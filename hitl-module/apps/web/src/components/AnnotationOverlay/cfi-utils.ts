export function cfiToScreenRects(cfi: string, rendition: any): DOMRect[] {
  const range = rendition?.getRange?.(cfi);
  if (!range) return [];

  const iframeRect = rendition.manager.container.getBoundingClientRect();

  return Array.from(range.getClientRects() as Iterable<DOMRect>).map(
    (rect) =>
      new DOMRect(
        rect.left + iframeRect.left,
        rect.top + iframeRect.top,
        rect.width,
        rect.height
      )
  );
}
