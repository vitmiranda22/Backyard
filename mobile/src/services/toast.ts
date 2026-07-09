// Toast — a tiny pub-sub so any screen can surface a non-blocking message
// without threading props through the whole app. A single <ToastHost />
// mounted once in App.tsx is the only subscriber.

type ToastType = "error" | "success";
type Listener = (message: string, type: ToastType) => void;

let listener: Listener | null = null;

export function _setToastListener(fn: Listener | null) {
  listener = fn;
}

export function showToast(message: string, type: ToastType = "error") {
  listener?.(message, type);
}
