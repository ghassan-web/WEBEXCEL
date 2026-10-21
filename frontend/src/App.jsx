import { useState } from "react";
import Sidebar from "./components/Sidebar";
import OverviewPage    from "./pages/OverviewPage";
import ComparePage     from "./pages/ComparePage";
import MappingRulesPage from "./pages/MappingRulesPage";
import MasterPage      from "./pages/MasterPage";
import OSCLNPage       from "./pages/OSCLNPage";
import HistoryPage     from "./pages/HistoryPage";
import LibraryPage     from "./pages/LibraryPage";

export default function App() {
  const [page,    setPage]    = useState("overview");
  const [libTab,  setLibTab]  = useState("os");

  const navigateTo = (key) => {
    if (key === "library_os") {
      setLibTab("os");
      setPage("library");
    } else if (key === "library_infopack") {
      setLibTab("infopack");
      setPage("library");
    } else {
      setPage(key);
    }
  };

  function renderPage() {
    switch (page) {
      case "overview": return <OverviewPage     onNavigate={navigateTo} />;
      case "upload":   return <ComparePage      onNavigate={navigateTo} />;
      case "mapping":  return <MappingRulesPage />;
      case "master":   return <MasterPage />;
      case "oscln":    return <OSCLNPage />;
      case "history":  return <HistoryPage />;
      case "library":  return <LibraryPage initialTab={libTab} />;
      default:         return <OverviewPage onNavigate={navigateTo} />;
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar activePage={page} onNavigate={navigateTo} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {renderPage()}
      </div>
    </div>
  );
}
