/**
 * app.tsx
 *
 * Root component — manages view state and global keyboard shortcuts.
 */

import { useState } from "react";
import { Box, useInput, useApp } from "ink";
import { Header } from "./components/header.js";
import { Nav, type ViewName } from "./components/nav.js";
import { Footer } from "./components/footer.js";
import { DashboardView } from "./views/dashboard.js";
import { WalletsView } from "./views/wallets.js";
import { LogsView } from "./views/logs.js";
import type { WalletServices } from "./services.js";

interface AppProps {
  services: WalletServices;
}

export function App({ services }: AppProps) {
  const { exit } = useApp();
  const [view, setView] = useState<ViewName>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  useInput((input) => {
    if (input === "q") exit();
    if (input === "1") setView("dashboard");
    if (input === "2") setView("wallets");
    if (input === "3") setView("logs");
    if (input === "r") setRefreshKey((k) => k + 1);
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header cluster={services.config.cluster} />
      <Nav active={view} />

      <Box flexDirection="column">
        {view === "dashboard" && (
          <DashboardView services={services} refreshKey={refreshKey} />
        )}
        {view === "wallets" && (
          <WalletsView services={services} refreshKey={refreshKey} />
        )}
        {view === "logs" && (
          <LogsView services={services} refreshKey={refreshKey} />
        )}
      </Box>

      <Footer services={services} view={view} />
    </Box>
  );
}
