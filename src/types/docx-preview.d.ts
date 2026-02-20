declare module "docx-preview" {
  export interface RenderOptions {
    inWrapper?: boolean;
    ignoreWidth?: boolean;
    ignoreHeight?: boolean;
    breakPages?: boolean;
    renderHeaders?: boolean;
    renderFooters?: boolean;
    renderEndnotes?: boolean;
  }

  export function renderAsync(
    data: ArrayBuffer | Blob | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement,
    options?: RenderOptions
  ): Promise<void>;
}
