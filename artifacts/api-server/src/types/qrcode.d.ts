// Minimal ambient declaration for the `qrcode` package (no @types installed).
// We only use toDataURL from the server-side invoice renderer.
declare module "qrcode" {
  export function toDataURL(text: string, opts?: Record<string, unknown>): Promise<string>;
  const _default: { toDataURL: typeof toDataURL };
  export default _default;
}
