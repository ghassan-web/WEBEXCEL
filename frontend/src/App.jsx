import { useState, useCallback } from "react";
import { MainLayout } from "./components/layout";
import OverviewPage     from "./pages/OverviewPage";
import ComparePage      from "./pages/ComparePage";
import MappingRulesPage from "./pages/MappingRulesPage";
import MasterPage       from "./pages/MasterPage";
import OSCLNPage        from "./pages/OSCLNPage";
import HistoryPage        from "./pages/HistoryPage";
import LibraryPage        from "./pages/LibraryPage";
import UserManagementPage from "./pages/UserManagementPage";
import UserGuidePage      from "./pages/UserGuidePage";

export default function App() {
  const [page,   setPage]   = useState("overview");
  const [libTab, setLibTab] = useState("os");

  const navigateTo = useCallback((key) => {
    if (key === "library_os") {
      setLibTab("os");
      setPage("library");
    } else if (key === "library_infopack") {
      setLibTab("infopack");
      setPage("library");
    } else {
      setPage(key);
    }
  }, []);

  function renderPage() {
    switch (page) {
      case "overview": return <OverviewPage     onNavigate={navigateTo} />;
      case "upload":   return <ComparePage      onNavigate={navigateTo} />;
      case "mapping":  return <MappingRulesPage />;
      case "master":   return <MasterPage />;
      case "oscln":    return <OSCLNPage />;
      case "history":  return <HistoryPage />;
      case "library":  return <LibraryPage initialTab={libTab} />;
      case "users":    return <UserManagementPage />;
      case "guide":    return <UserGuidePage    onNavigate={navigateTo} />;
      default:         return <OverviewPage onNavigate={navigateTo} />;
    }
  }

  return (
    <MainLayout activePage={page} onNavigate={navigateTo}>
      {renderPage()}
    </MainLayout>
  );
}
