import { useEffect, useRef } from "react";

import { bindDesktopShell } from "../desktop-shell";
import type { AppRoute } from "../ui";
import { ViewerDesktopShell } from "./ViewerDesktopShell";

type Teardown = () => void;

type RouteIslandProps = {
  route: AppRoute;
};

export function RouteIsland({ route }: RouteIslandProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let cancelled = false;
    let routeTeardown: Teardown | undefined;
    const shell = bindDesktopShell(host, route);

    async function mountRoute() {
      switch (route) {
        case "scene-graph":
          routeTeardown = (await import("../scene-graph")).mountSceneGraphPage(shell);
          break;
        case "asset-editor":
          routeTeardown = (await import("../asset-editor")).mountAssetEditor(shell);
          break;
        default:
          routeTeardown = await (await import("../app")).mountViewer(shell);
          break;
      }

      if (cancelled && routeTeardown) {
        routeTeardown();
      }
    }

    void mountRoute();

    return () => {
      cancelled = true;
      routeTeardown?.();
      shell.destroy();
    };
  }, [route]);

  return <ViewerDesktopShell route={route} hostRef={hostRef} />;
}
