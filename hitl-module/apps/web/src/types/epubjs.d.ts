declare module "epubjs" {
  export interface NavItem {
    href: string;
  }

  export interface Book {
    renderTo(element: Element, options: Record<string, unknown>): Rendition;
    getRange(cfi: string): Range | null;
    getCfiFromRange?(range: Range): string;
    spine: {
      first(): NavItem;
    };
    destroy?(): void;
  }

  export interface Contents {
    addStylesheet(url: string): void;
    document?: Document;
    window: Window;
  }

  export interface Location {
    start: {
      cfi: string;
      href: string;
    };
  }

  export interface Themes {
    override(name: string, value: string): void;
  }

  export interface Rendition {
    hooks: {
      content: {
        register(cb: (contents: Contents) => void): void;
      };
    };
    themes: Themes;
    display(target?: string): Promise<void> | void;
    on(event: string, cb: (...args: any[]) => void): void;
    off?(event: string, cb?: (...args: any[]) => void): void;
    destroy?(): void;
    getRange?(cfi: string): Range | null;
  }

  export default function Epub(url: string): Book;
}
