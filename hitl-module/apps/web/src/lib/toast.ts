export type ToastType = "info" | "warning" | "error";

export function showToast(message: string, type: ToastType): void {
  window.dispatchEvent(
    new CustomEvent("hitl:toast", { detail: { message, type } })
  );
}

export function dismissToast(): void {
  window.dispatchEvent(new CustomEvent("hitl:toast:dismiss"));
}
