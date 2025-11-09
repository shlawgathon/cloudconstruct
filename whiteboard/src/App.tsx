import { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";
import { ExcalidrawWrapper, type ExcalidrawAPI } from "./components/ExcalidrawWrapper";
import { TestPanel } from "./components/TestPanel";
import { AccountModal } from "./components/AccountModal";
import { StatusBar } from "./components/StatusBar";
import { WorkerClient } from "./services/WorkerClient";
import { ComponentStatus, type StatusUpdateMessage } from "../../shared-api-client";
import { LiveUpdateService } from "./services/LiveUpdateService";
import type { ExcalidrawElement } from "./services/ElementFactory";

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
  const [statusMessage, setStatusMessage] = useState<string>("");
  // Track last-known componentId based on user selection/edits (element id)
  const currentComponentIdRef = useRef<string | null>(null);
  const previousElementsRef = useRef<ExcalidrawElement[]>([]);
  const currentElementsRef = useRef<ExcalidrawElement[]>([]);
  const periodicCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onChangeThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const currentAppStateRef = useRef<any>(null);
  const lastInputAtRef = useRef<number>(0);
  const TYPING_IDLE_MS = 2000; // consider user typing if changes within last 2s
  // Track last time an actual edit changed the elements and its snapshot to avoid sticky typing state
  const lastEditChangeAtRef = useRef<number>(0);
  const lastEditSnapshotRef = useRef<string>("");
  const MAX_PAUSE_MS = 10000; // safety cap: after 10s, allow syncing even if edit mode is stuck
  const isEditingRef = useRef<boolean>(false);

  // Polling + countdown UI
  const POLL_MS = 5000;
  const nextSyncAtRef = useRef<number>(Date.now() + POLL_MS);
  const uiTickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uiModeRef = useRef<'idle' | 'paused' | 'syncing' | 'external'>('idle');
  const lastSuccessfulComponentIdRef = useRef<string | null>(null);

  // Derive component id from current selection or recent single-element edits
  const deriveComponentId = useCallback((activeElements?: ExcalidrawElement[]) => {
    try {
      const selected = updateService.getSelectedElements();
      if (selected && selected.length > 0) {
        // Prefer a single selected element; if multiple, take the first for now
        currentComponentIdRef.current = selected[0].id;
        return currentComponentIdRef.current;
      }
      // If nothing selected, but there's exactly one active element on canvas, use it
      if (activeElements && activeElements.length === 1) {
        currentComponentIdRef.current = activeElements[0].id;
        return currentComponentIdRef.current;
      }
      // If no single element, but there are active elements and we have no prior id, use the first
      if ((!currentComponentIdRef.current || currentComponentIdRef.current === '') && activeElements && activeElements.length > 0) {
        currentComponentIdRef.current = activeElements[0].id;
        return currentComponentIdRef.current;
      }
      // Otherwise, keep whatever was last used (user might be editing text without selection updates)
      return currentComponentIdRef.current || lastSuccessfulComponentIdRef.current || null;
    } catch (e) {
      console.warn('Failed to derive component id', e);
      return currentComponentIdRef.current || lastSuccessfulComponentIdRef.current || null;
    }
  }, [updateService]);

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

  // Listen for StatusUpdate messages from the worker and update element styles
  useEffect(() => {
    const mapStatus = (s: ComponentStatus): Parameters<LiveUpdateService["setElementStatus"]>[1] => {
      switch (s) {
        case ComponentStatus.SUCCESS:
        case ComponentStatus.READY:
          return "green";
        case ComponentStatus.FAILURE:
          return "red";
        case ComponentStatus.CHECKING:
          return "blue";
        case ComponentStatus.LOADING:
        default:
          return "orange";
      }
    };

    const handler = (msg: StatusUpdateMessage) => {
      try {
        const status = mapStatus(msg.status);
        console.log(status)
        // componentId is expected to be the element ID on the canvas
        updateService.setElementStatus(msg.componentId, status);
        const fallback = msg.status === ComponentStatus.LOADING ? 'Working…' :
          msg.status === ComponentStatus.CHECKING ? 'Checking cluster…' :
          msg.status === ComponentStatus.SUCCESS ? 'Done.' :
          msg.status === ComponentStatus.FAILURE ? 'Failed.' : 'Update';
        // Temporarily show external status message
        uiModeRef.current = 'external';
        setStatusMessage(`Constructor says: ${msg.message || fallback}`);
        // After a short delay, allow UI to resume countdown mode
        setTimeout(() => {
          if (uiModeRef.current === 'external') {
            uiModeRef.current = 'idle';
          }
        }, 3000);
      } catch (e) {
        console.error("Failed to apply status update", e, msg);
      }
    };

    WorkerClient.onStatusUpdate(handler);
    return () => {
      WorkerClient.offStatusUpdate(handler);
    };
  }, [updateService]);

  // Live countdown / status ticker (1s)
  useEffect(() => {
    if (uiTickIntervalRef.current) {
      clearInterval(uiTickIntervalRef.current);
    }
    uiTickIntervalRef.current = setInterval(() => {
      // If external message is being shown, do not override
      if (uiModeRef.current === 'external') return;
      if (uiModeRef.current === 'syncing') {
        setStatusMessage('Syncing changes…');
        return;
      }
      if (uiModeRef.current === 'paused') {
        setStatusMessage('Editing… sync paused');
        return;
      }
      // idle countdown
      const now = Date.now();
      const secs = Math.max(0, Math.ceil((nextSyncAtRef.current - now) / 1000));
      setStatusMessage(`Idle. Next sync in ${secs}s`);
    }, 1000);

    return () => {
      if (uiTickIntervalRef.current) {
        clearInterval(uiTickIntervalRef.current);
        uiTickIntervalRef.current = null;
      }
    };
  }, []);

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

    const now = Date.now();

    // Determine if user is actively typing in a text/linear element
    const isEditing = !!(appState?.editingElement || appState?.isEditingText || appState?.editingLinearElement);
    isEditingRef.current = isEditing;

    if (isEditing) {
      // Bump last input time on any edit session tick
      lastInputAtRef.current = now;

      // Compute a lightweight snapshot of active elements that captures text/geometry changes
      const active = elements.filter((el: any) => !el.isDeleted);
      const snap = JSON.stringify(
        active.map((el: any) => ({
          id: el.id,
          type: el.type,
          // geometry + style most likely to change during editing/moving
          x: el.x, y: el.y, width: el.width, height: el.height,
          strokeColor: el.strokeColor, backgroundColor: el.backgroundColor,
          // text-bearing fields (Excalidraw text/linear, if present)
          text: (el as any).text ?? undefined,
          points: (el as any).points ? (el as any).points.length : undefined,
          version: (el as any).version ?? undefined,
        }))
      );
      if (snap !== lastEditSnapshotRef.current) {
        lastEditSnapshotRef.current = snap;
        lastEditChangeAtRef.current = now;
      }

      // Let the UI ticker render the paused message
      uiModeRef.current = 'paused';
    } else {
      // If we just exited editing state, allow polling cycle to resume
      // We don't clear timestamps; periodic loop will consider them
      uiModeRef.current = 'idle';
    }

    // Keep debug logs around selection changes (optional)
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
      }
    }

    // Important: Do NOT send updates directly onChange; we only poll every 5s
    // Also, do NOT update previousElementsRef here; periodic poll compares against last sent state.
  };

  // Periodic poll every 5 seconds; skip while user is actively typing
  useEffect(() => {
    if (!excalidrawAPI) return;

    // initialize next sync timestamp
    nextSyncAtRef.current = Date.now() + POLL_MS;

    periodicCheckIntervalRef.current = setInterval(() => {
      try {
        // schedule next tick timestamp for countdown UI
        nextSyncAtRef.current = Date.now() + POLL_MS;

        const now = Date.now();
        const withinTypingWindow = now - lastInputAtRef.current < TYPING_IDLE_MS;
        const recentActualChange = now - lastEditChangeAtRef.current < TYPING_IDLE_MS;
        const stuckTooLong = now - lastInputAtRef.current > MAX_PAUSE_MS;
        const shouldPause = withinTypingWindow && (recentActualChange || isEditingRef.current) && !stuckTooLong;
        if (shouldPause) {
          // User is actively typing (or editor reports edit) and not past safety cap; do not send updates
          uiModeRef.current = 'paused';
          return;
        }

        const currentElements = excalidrawAPI.getSceneElements();
        const activeElements = filterActiveElements(currentElements);
        const previousActive = filterActiveElements(previousElementsRef.current);

        // Compare to detect changes
        const previousIds = new Set(previousActive.map((el) => el.id));
        const currentIds = new Set(activeElements.map((el) => el.id));

        const added = activeElements.filter((el) => !previousIds.has(el.id));
        const removed = previousActive.filter((el) => !currentIds.has(el.id));
        const modified = activeElements.filter((el: any) => {
          const prev: any = previousActive.find((p) => p.id === el.id);
          if (!prev) return false;
          // Check if element properties changed (including text/points/version)
          const pointsLen = el.points ? el.points.length : undefined;
          const prevPointsLen = prev.points ? prev.points.length : undefined;
          return (
            prev.x !== el.x ||
            prev.y !== el.y ||
            prev.width !== el.width ||
            prev.height !== el.height ||
            prev.strokeColor !== el.strokeColor ||
            prev.backgroundColor !== el.backgroundColor ||
            prev.text !== el.text ||
            prev.version !== el.version ||
            prevPointsLen !== pointsLen
          );
        });

        if (added.length > 0 || removed.length > 0 || modified.length > 0) {
          console.log("Periodic check (5s) detected changes:", {
            added: added.length,
            removed: removed.length,
            modified: modified.length,
          });
          try {
            const componentId = deriveComponentId(activeElements);
            if (componentId) {
              uiModeRef.current = 'syncing';
              WorkerClient.updateWhiteboard(componentId, activeElements);
              lastSuccessfulComponentIdRef.current = componentId;
              // mark these as last sent snapshot
              previousElementsRef.current = currentElements;
              // After a short moment, go back to idle so countdown appears
              setTimeout(() => { if (uiModeRef.current === 'syncing') uiModeRef.current = 'idle'; }, 1000);
            } else {
              console.debug('Skipping periodic whiteboard update: no componentId could be derived');
            }
          } catch (e) {
            console.error('Failed to send whiteboard update (periodic)', e);
          }
        } else {
          // nothing changed; remain idle
          uiModeRef.current = 'idle';
        }
      } catch (error) {
        console.error("Error in periodic check:", error);
      }
    }, POLL_MS);

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
      <StatusBar onLoginClick={() => setIsAccountModalOpen(true)} statusMessage={statusMessage} />
      {/* Spacer to account for fixed StatusBar height */}
      <div style={{ height: 36 }} />

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
      {/*<TestPanel updateService={updateService} />*/}

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </div>
  );
}

export default App;
