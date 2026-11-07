/**
 * Tiny dependency-free toast used for short confirmations such as
 * "Saved to Downloads". It lives outside React so any service can call it.
 */
let activeToast: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, duration = 4000): void {
  if (typeof document === "undefined") return;

  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  if (hideTimer) clearTimeout(hideTimer);

  const toast = document.createElement("div");

  toast.setAttribute("role", "status");
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    bottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
    transform: "translateX(-50%)",
    maxWidth: "min(92vw, 420px)",
    padding: "12px 18px",
    borderRadius: "14px",
    background: "#17261d",
    color: "#e8f1ec",
    border: "1px solid #34d399",
    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
    fontSize: "13px",
    fontWeight: "600",
    lineHeight: "1.4",
    textAlign: "center",
    zIndex: "100000",
    wordBreak: "break-word"
  });

  document.body.appendChild(toast);
  activeToast = toast;

  hideTimer = setTimeout(() => {
    toast.remove();

    if (activeToast === toast) activeToast = null;
  }, duration);
}
