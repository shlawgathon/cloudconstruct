import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";
import { ExcalidrawWrapper, type ExcalidrawAPI } from "./components/ExcalidrawWrapper";
import { TestPanel } from "./components/TestPanel";
import { AccountModal } from "./components/AccountModal";
import { LiveUpdateService } from "./services/LiveUpdateService";
import type { ExcalidrawElement } from "./services/ElementFactory";
import logoImage from "../logo.png";

// Module-level API ref - this is the "link" that gets set when Excalidraw mounts
const excalidrawAPIRef = { current: null as ExcalidrawAPI | null };

// Getter function that reads from the ref
export const getExcalidrawApi = () => excalidrawAPIRef.current;

/**
 * Main React component with Excalidraw embedding and test controls
 */
export function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawAPI | null>(null);
  // Use useRef to ensure we always use the same instance
  const updateServiceRef = useRef(new LiveUpdateService());
  const updateService = updateServiceRef.current;
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const previousElementsRef = useRef<ExcalidrawElement[]>([]);
  const currentElementsRef = useRef<ExcalidrawElement[]>([]);
  const periodicCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onChangeThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const currentAppStateRef = useRef<any>(null);

  // Set getters immediately on mount (don't wait for API)
  useEffect(() => {
    console.log("Setting getters on updateService (on mount)");
    updateService.setAppStateGetter(() => currentAppStateRef.current);
    updateService.setElementsGetter(() => currentElementsRef.current);
    // Use the module-level getter function
    updateService.setAPIGetter(() => getExcalidrawApi());
    updateService.setUpdateSceneCallback(handleUpdateScene);
    console.log("Getters set, verifying:", {
      appStateGetter: !!(updateService as any).appStateGetter,
      elementsGetter: !!(updateService as any).elementsGetter,
      apiGetter: !!(updateService as any).apiGetter,
    });
  }, [updateService]);

  useEffect(() => {
    if (excalidrawAPI) {
      console.log("Setting API in updateService:", excalidrawAPI);
      console.log("updateService instance:", updateService);
      updateService.setAPI(excalidrawAPI);
      // Also ensure getters are set (in case they weren't set before)
      updateService.setAppStateGetter(() => currentAppStateRef.current);
      updateService.setElementsGetter(() => currentElementsRef.current);
      // Use the module-level getter function
      updateService.setAPIGetter(() => getExcalidrawApi());
      console.log("API set in updateService, verifying:", updateService);
      console.log("updateService.api after set:", (updateService as any).api);
      console.log("updateService.appStateGetter after set:", !!(updateService as any).appStateGetter);
      console.log("updateService.elementsGetter after set:", !!(updateService as any).elementsGetter);
      console.log("updateService.apiGetter after set:", !!(updateService as any).apiGetter);
    } else {
      console.log("excalidrawAPI is null, not setting");
    }
  }, [excalidrawAPI, updateService]);

  // Callback that gets called when Excalidraw API is ready
  const onAPIReady = useCallback((api: ExcalidrawAPI) => {
    console.log("onAPIReady called with API:", api);
    
    // Store API in module-level ref - this is the "link"
    excalidrawAPIRef.current = api;
    console.log("API stored in excalidrawAPIRef.current");
    
    // Also store in state for component-level access
    setExcalidrawAPI(api);
    
    // Set API on the service
    updateService.setAPI(api);
    updateService.setAppStateGetter(() => currentAppStateRef.current);
    updateService.setElementsGetter(() => currentElementsRef.current);
    // Set API getter to use the module-level ref
    updateService.setAPIGetter(() => getExcalidrawApi());
    
    console.log("API set on updateService and module ref");
  }, [updateService]);

  // Filter out deleted elements
  const filterActiveElements = (elements: ExcalidrawElement[]): ExcalidrawElement[] => {
    return elements.filter((el) => !el.isDeleted);
  };

  const handleUpdateScene = (elements: ExcalidrawElement[]) => {
    // Direct update scene callback - use this if API is not available
    console.log("handleUpdateScene: Called with", elements.length, "elements");
    const api = getExcalidrawApi();
    if (api) {
      console.log("handleUpdateScene: Using API from getter to update scene");
      api.updateScene({ elements });
    } else {
      console.warn("handleUpdateScene: No API available to update scene");
    }
  };

  const handleChange = (elements: ExcalidrawElement[], appState: any) => {
    // Store current app state and elements for getting selected elements
    currentAppStateRef.current = appState;
    currentElementsRef.current = elements;
    
    // Debug: Log selection changes
    if (appState?.selectedElementIds) {
      const selectedCount = Array.isArray(appState.selectedElementIds) 
        ? appState.selectedElementIds.length 
        : typeof appState.selectedElementIds === 'object' 
          ? Object.keys(appState.selectedElementIds).filter(k => appState.selectedElementIds[k] === true).length
          : 0;
      if (selectedCount > 0) {
        console.log("✓ Selection detected in onChange:", {
          selectedCount,
          selectedElementIds: appState.selectedElementIds,
          type: Array.isArray(appState.selectedElementIds) ? 'array' : typeof appState.selectedElementIds,
        });
        console.log("✓ Stored appState in ref:", currentAppStateRef.current?.selectedElementIds);
        console.log("✓ Stored elements in ref:", currentElementsRef.current.length);
      }
    } else {
      // Log when selection is cleared
      if (currentAppStateRef.current?.selectedElementIds) {
        console.log("✗ Selection cleared in onChange");
      }
    }
    
    // Throttle onChange to prevent excessive calls
    if (onChangeThrottleRef.current) {
      clearTimeout(onChangeThrottleRef.current);
    }

    onChangeThrottleRef.current = setTimeout(() => {
      // Filter out deleted elements
      const activeElements = filterActiveElements(elements);
      const previousActive = filterActiveElements(previousElementsRef.current);

      // Only detect changes if there are actual differences
      if (activeElements.length !== previousActive.length) {
        const previousIds = new Set(previousActive.map((el) => el.id));
        const currentIds = new Set(activeElements.map((el) => el.id));

        const added = activeElements.filter((el) => !previousIds.has(el.id));
        const removed = previousActive.filter((el) => !currentIds.has(el.id));

        // Only log if there are actual changes
        if (added.length > 0 || removed.length > 0) {
          if (added.length > 0) {
            console.log("Elements added:", added.length, added.map((el) => ({ id: el.id, type: el.type })));
          }
          if (removed.length > 0) {
            console.log("Elements removed:", removed.length, removed.map((el) => ({ id: el.id, type: el.type })));
          }
          // Update ref only when there are actual changes
          previousElementsRef.current = elements;
        }
      } else {
        // Check for modifications (same count but different properties)
        const hasChanges = activeElements.some((el) => {
          const prev = previousActive.find((p) => p.id === el.id);
          if (!prev) return false;
          return (
            prev.x !== el.x ||
            prev.y !== el.y ||
            prev.width !== el.width ||
            prev.height !== el.height ||
            prev.strokeColor !== el.strokeColor ||
            prev.backgroundColor !== el.backgroundColor
          );
        });

        if (hasChanges) {
          console.log("Elements modified");
          previousElementsRef.current = elements;
        }
      }
    }, 100); // Throttle to 100ms
  };

  // Periodic check every 1 second (without causing re-renders)
  useEffect(() => {
    if (!excalidrawAPI) return;

    periodicCheckIntervalRef.current = setInterval(() => {
      try {
        const currentElements = excalidrawAPI.getSceneElements();
        const activeElements = filterActiveElements(currentElements);
        const previousActive = filterActiveElements(previousElementsRef.current);

        // Compare to detect changes
        const previousIds = new Set(previousActive.map((el) => el.id));
        const currentIds = new Set(activeElements.map((el) => el.id));

        const added = activeElements.filter((el) => !previousIds.has(el.id));
        const removed = previousActive.filter((el) => !currentIds.has(el.id));
        const modified = activeElements.filter((el) => {
          const prev = previousActive.find((p) => p.id === el.id);
          if (!prev) return false;
          // Check if element properties changed
          return (
            prev.x !== el.x ||
            prev.y !== el.y ||
            prev.width !== el.width ||
            prev.height !== el.height ||
            prev.strokeColor !== el.strokeColor ||
            prev.backgroundColor !== el.backgroundColor
          );
        });

        if (added.length > 0 || removed.length > 0 || modified.length > 0) {
          console.log("Periodic check (1s) detected changes:", {
            added: added.length,
            removed: removed.length,
            modified: modified.length,
          });
          // Update ref
          previousElementsRef.current = currentElements;
        }
      } catch (error) {
        console.error("Error in periodic check:", error);
      }
    }, 1000);

    return () => {
      if (periodicCheckIntervalRef.current) {
        clearInterval(periodicCheckIntervalRef.current);
        periodicCheckIntervalRef.current = null;
      }
      if (onChangeThrottleRef.current) {
        clearTimeout(onChangeThrottleRef.current);
        onChangeThrottleRef.current = null;
      }
    };
  }, [excalidrawAPI]);

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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src={logoImage}
            alt="CloudConstruct Logo"
            style={{
              width: "32px",
              height: "32px",
              objectFit: "contain",
            }}
          />
          <span style={{ fontSize: "16px", fontWeight: "500", color: "#1e1e1e" }}>
            Excalidraw Live Updates Test
          </span>
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
          onAPIReady={onAPIReady}
          onChange={handleChange}
          onUpdateScene={handleUpdateScene}
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
