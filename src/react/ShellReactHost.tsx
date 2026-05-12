import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

export type ShellReactCleanup = () => void;
export type RegisterShellReactCleanup = (cleanup: ShellReactCleanup) => void;

export function createShellReactContent(
  content: ReactNode,
  registerCleanup: RegisterShellReactCleanup,
): HTMLElement {
  const host = document.createElement("div");
  host.className = "desktop-shell-react-content";
  const root = createRoot(host);
  let unmounted = false;
  flushSync(() => {
    root.render(<>{content}</>);
  });
  registerCleanup(() => {
    if (unmounted) {
      return;
    }
    unmounted = true;
    queueMicrotask(() => root.unmount());
  });
  return host;
}
