import { App as AntdApp, ConfigProvider } from "antd";
import { useEffect, useState } from "react";

import type { AppRoute } from "../ui";
import { RouteIsland } from "./RouteIsland";
import { antdTheme, resolveRoute } from "./shellModel";

export function AppRoot() {
  const [route, setRoute] = useState<AppRoute>(() => resolveRoute());

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <RouteIsland key={route} route={route} />
      </AntdApp>
    </ConfigProvider>
  );
}
