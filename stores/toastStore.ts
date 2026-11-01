import { observable } from "@legendapp/state";

interface ToastState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "info";
}

export const toast$ = observable<ToastState>({
  visible: false,
  message: "",
  type: "success",
});

let toastTimeout: ReturnType<typeof setTimeout>;

export const showToast = (
  message: string,
  type: "success" | "error" | "info",
) => {
  if (toastTimeout) clearTimeout(toastTimeout);

  toast$.assign({
    visible: true,
    message,
    type,
  });

  toastTimeout = setTimeout(() => {
    toast$.visible.set(false);
  }, 3500);
};
