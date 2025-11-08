import { useEffect, useRef, useState } from "react";
import "./index.css";
import { ExcalidrawWrapper, type ExcalidrawAPI } from "./components/ExcalidrawWrapper";
import { TestPanel } from "./components/TestPanel";
import { AccountModal } from "./components/AccountModal";
import { LiveUpdateService } from "./services/LiveUpdateService";
import type { ExcalidrawElement } from "./services/ElementFactory";

/**
 * Main React component with Excalidraw embedding and test controls
 */
export function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawAPI | null>(null);
  const [updateService] = useState(() => new LiveUpdateService());
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [previousElements, setPreviousElements] = useState<ExcalidrawElement[]>([]);

  useEffect(() => {
    if (excalidrawAPI) {
      updateService.setAPI(excalidrawAPI);
    }
  }, [excalidrawAPI, updateService]);

  const handleAPIReady = (api: ExcalidrawAPI) => {
    setExcalidrawAPI(api);
    console.log("Excalidraw API ready");
  };

  const handleChange = (elements: ExcalidrawElement[], appState: any) => {
    // Detect changes
    if (previousElements.length !== elements.length) {
      console.log("Elements changed:", {
        previous: previousElements.length,
        current: elements.length,
      });
    }

    // Compare elements to detect additions/removals
    const previousIds = new Set(previousElements.map((el) => el.id));
    const currentIds = new Set(elements.map((el) => el.id));

    const added = elements.filter((el) => !previousIds.has(el.id));
    const removed = previousElements.filter((el) => !currentIds.has(el.id));

    if (added.length > 0) {
      console.log("Elements added:", added);
    }
    if (removed.length > 0) {
      console.log("Elements removed:", removed);
    }

    setPreviousElements([...elements]);
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Custom Top Bar with Account Button */}
      <div
        style={{
          height: "48px",
          background: "#ffffff",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 100,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: "500", color: "#1e1e1e" }}>
          Excalidraw Live Updates Test
        </div>
        <button
          onClick={() => setIsAccountModalOpen(true)}
          style={{
            padding: "6px 12px",
            background: "#f5f5f5",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            fontSize: "14px",
            fontWeight: "500",
            color: "#1e1e1e",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e8e8e8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f5f5f5";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Account
        </button>
      </div>

      {/* Excalidraw Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <ExcalidrawWrapper
          onAPIReady={handleAPIReady}
          onChange={handleChange}
          initialData={{
            elements: [],
          }}
        />
      </div>

      {/* Test Panel */}
      <TestPanel updateService={updateService} />

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </div>
  );
}

export default App;
