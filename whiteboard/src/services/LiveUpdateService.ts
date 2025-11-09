/**
 * Service to handle programmatic updates to Excalidraw canvas
 */
import type { ExcalidrawElement } from "./ElementFactory";
import { ElementFactory } from "./ElementFactory";
import { StatusUpdater, type Status } from "./StatusUpdater";

export interface ExcalidrawAPI {
  updateScene: (scene: { elements: ExcalidrawElement[]; appState?: any; commitToHistory?: boolean }) => void;
  getSceneElements: () => ExcalidrawElement[];
  getAppState: () => any;
  scrollToContent: (element: ExcalidrawElement) => void;
}

export class LiveUpdateService {
  private api: ExcalidrawAPI | null = null;
  private appStateGetter: (() => any) | null = null;
  private elementsGetter: (() => ExcalidrawElement[]) | null = null;
  private apiGetter: (() => ExcalidrawAPI | null) | null = null;
  private updateSceneCallback: ((elements: ExcalidrawElement[]) => void) | null = null;

  /**
   * Sets the Excalidraw API reference
   */
  setAPI(api: ExcalidrawAPI) {
    console.log("LiveUpdateService.setAPI called with:", api);
    this.api = api;
    console.log("LiveUpdateService.api set to:", this.api);
    console.log("LiveUpdateService instance:", this);
  }

  /**
   * Sets a function to get the current app state
   */
  setAppStateGetter(getter: () => any) {
    this.appStateGetter = getter;
    console.log("LiveUpdateService.setAppStateGetter called");
  }

  /**
   * Sets a function to get the current elements
   */
  setElementsGetter(getter: () => ExcalidrawElement[]) {
    this.elementsGetter = getter;
    console.log("LiveUpdateService.setElementsGetter called");
  }

  /**
   * Sets a function to get the API (fallback if API is not set directly)
   */
  setAPIGetter(getter: () => ExcalidrawAPI | null) {
    this.apiGetter = getter;
    console.log("LiveUpdateService.setAPIGetter called");
  }

  /**
   * Sets a callback to update the scene directly (fallback if API is not available)
   */
  setUpdateSceneCallback(callback: (elements: ExcalidrawElement[]) => void) {
    this.updateSceneCallback = callback;
    console.log("LiveUpdateService.setUpdateSceneCallback called");
  }

  /**
   * Filters out deleted elements
   */
  private filterActiveElements(elements: ExcalidrawElement[]): ExcalidrawElement[] {
    return elements.filter((el) => !el.isDeleted);
  }

  /**
   * Adds a new element to the canvas
   */
  addElement(
    type: "rectangle" | "text" | "component",
    position?: { x: number; y: number },
    properties?: Record<string, any>
  ): ExcalidrawElement | null {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return null;
    }

    const currentElements = this.api.getSceneElements();
    // Filter out deleted elements
    const activeElements = this.filterActiveElements(currentElements);

    // Random position if not provided
    const x = position?.x ?? Math.random() * 400 + 100;
    const y = position?.y ?? Math.random() * 300 + 100;

    let newElement: ExcalidrawElement;

    switch (type) {
      case "rectangle":
        newElement = ElementFactory.createRectangle(x, y);
        break;
      case "text":
        newElement = ElementFactory.createText(
          x,
          y,
          properties?.text || "New Text"
        );
        break;
      case "component":
        newElement = ElementFactory.createComponentElement(
          properties?.componentType || "webapp",
          x,
          y
        );
        break;
      default:
        newElement = ElementFactory.createRectangle(x, y);
    }

    // Apply any additional properties
    if (properties) {
      Object.assign(newElement, properties);
    }

    // Add new element to active elements (preserve all elements including deleted ones for Excalidraw)
    const updatedElements = [...currentElements, newElement];
    this.api.updateScene({ elements: updatedElements });

    return newElement;
  }

  /**
   * Updates an existing element
   */
  updateElement(elementId: string, updates: Partial<ExcalidrawElement>): void {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    const currentElements = this.api.getSceneElements();
    const updatedElements = currentElements.map((el) =>
      el.id === elementId ? { ...el, ...updates, isDeleted: false } : el
    );

    this.api.updateScene({ elements: updatedElements });
  }

  /**
   * Deletes elements from the canvas
   */
  deleteElements(elementIds: string[]): void {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    const currentElements = this.api.getSceneElements();
    const updatedElements = currentElements.filter(
      (el) => !elementIds.includes(el.id)
    );

    this.api.updateScene({ elements: updatedElements });
  }

  /**
   * Sets the status of an element (visual status update)
   */
  setElementStatus(elementId: string, status: Status): void {
    // Get current elements - prefer elementsGetter from onChange (most up-to-date)
    let currentElements: ExcalidrawElement[] = [];

    if (this.elementsGetter) {
      currentElements = this.elementsGetter();
      console.log("setElementStatus: Got elements from elementsGetter:", currentElements.length);
    } else if (this.api) {
      currentElements = this.api.getSceneElements();
      console.log("setElementStatus: Got elements from API:", currentElements.length);
    } else {
      console.error("setElementStatus: No way to get elements - no elementsGetter and no API");
      return;
    }

    const element = currentElements.find((el) => el.id === elementId && !el.isDeleted);

    if (!element) {
      console.error(`Element ${elementId} not found or is deleted`);
      return;
    }

    console.log("setElementStatus: Found element:", element.id, element.type);
    console.log("setElementStatus: Current element JSON:", JSON.stringify(element, null, 2));
    console.log("setElementStatus: Setting status to:", status);

    // Apply status to element
    const updatedElement = StatusUpdater.applyStatusToElement(element, status);
    console.log("setElementStatus: Updated element JSON:", JSON.stringify(updatedElement, null, 2));

    // Update the elements array
    const updatedElements = currentElements.map((el) =>
      el.id === elementId ? { ...updatedElement, isDeleted: false } : el
    );

        // Update the scene - need API for this
        // Try to get API from direct reference first, then from getter
        let apiToUse = this.api;

        console.log("setElementStatus: Checking API availability...");
        console.log("setElementStatus: this.api:", !!this.api);
        console.log("setElementStatus: this.apiGetter:", !!this.apiGetter);

        if (!apiToUse && this.apiGetter) {
          console.log("setElementStatus: API is null, trying to get from apiGetter");
          try {
            const apiFromGetter = this.apiGetter();
            console.log("setElementStatus: apiGetter() returned:", !!apiFromGetter);
            if (apiFromGetter) {
              apiToUse = apiFromGetter;
              console.log("setElementStatus: Using API from apiGetter");
            } else {
              console.warn("setElementStatus: apiGetter returned null/undefined - API not mounted yet");
            }
          } catch (error) {
            console.error("setElementStatus: Error calling apiGetter:", error);
          }
        }

        if (apiToUse) {
          try {
            console.log("setElementStatus: Calling updateScene with", updatedElements.length, "elements");
            apiToUse.updateScene({ elements: updatedElements });
            console.log("setElementStatus: Updated scene via API successfully");
          } catch (error) {
            console.error("setElementStatus: Error updating scene:", error);
          }
        } else if (this.updateSceneCallback) {
          // Fallback: Use updateSceneCallback if API is not available
          console.log("setElementStatus: API not available, using updateSceneCallback");
          try {
            this.updateSceneCallback(updatedElements);
            console.log("setElementStatus: Updated scene via callback successfully");
          } catch (error) {
            console.error("setElementStatus: Error updating scene via callback:", error);
          }
        } else {
          console.error("setElementStatus: Cannot update scene - no API available");
          console.error("setElementStatus: API not mounted yet. Queue operations until API is ready.");
        }
  }

  /**
   * Simulates status progression: orange -> blue -> green
   */
  simulateStatusProgression(elementId: string): void {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    // Set to orange immediately
    this.setElementStatus(elementId, "orange");

    // After 3 seconds, set to blue
    setTimeout(() => {
      this.setElementStatus(elementId, "blue");
    }, 3000);

    // After 6 seconds total, set to green
    setTimeout(() => {
      this.setElementStatus(elementId, "green");
    }, 6000);
  }

  /**
   * Changes the color of selected elements
   */
  changeElementColor(elementId: string, color: string): void {
    this.updateElement(elementId, { strokeColor: color });
  }

  /**
   * Adds an arrow between two elements
   */
  addArrow(startElementId: string, endElementId: string): void {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    const currentElements = this.api.getSceneElements();
    const startElement = currentElements.find((el) => el.id === startElementId);
    const endElement = currentElements.find((el) => el.id === endElementId);

    if (!startElement || !endElement) {
      console.error("Start or end element not found");
      return;
    }

    const startX = startElement.x + startElement.width / 2;
    const startY = startElement.y + startElement.height / 2;
    const endX = endElement.x + endElement.width / 2;
    const endY = endElement.y + endElement.height / 2;

    const arrow = ElementFactory.createArrow(
      startElementId,
      endElementId,
      startX,
      startY,
      endX,
      endY
    );

    const updatedElements = [...currentElements, arrow];
    this.api.updateScene({ elements: updatedElements });
  }

  /**
   * Clears all elements from the canvas
   */
  clearCanvas(): void {
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    this.api.updateScene({ elements: [] });
  }

  /**
   * Gets currently selected elements
   */
  getSelectedElements(): ExcalidrawElement[] {
    try {
      console.log("getSelectedElements: Checking getters...");
      console.log("getSelectedElements: appStateGetter exists:", !!this.appStateGetter);
      console.log("getSelectedElements: elementsGetter exists:", !!this.elementsGetter);
      console.log("getSelectedElements: api exists:", !!this.api);

      // Prefer app state from onChange callback (most up-to-date)
      let appState = null;

      if (this.appStateGetter) {
        appState = this.appStateGetter();
        console.log("AppState from getter (onChange ref):", appState);
      } else {
        console.warn("appStateGetter is null!");
      }

      // Get elements - prefer elementsGetter from onChange (most up-to-date)
      let currentElements: ExcalidrawElement[] = [];

      if (this.elementsGetter) {
        currentElements = this.elementsGetter();
        console.log("Got elements from elementsGetter:", currentElements.length);
      } else if (this.api) {
        currentElements = this.api.getSceneElements();
        console.log("Got elements from API:", currentElements.length);
      } else {
        console.error("No way to get elements - no elementsGetter and no API");
        console.error("elementsGetter:", this.elementsGetter);
        console.error("api:", this.api);
        return [];
      }

      // If we don't have appState from getter, try API
      if (!appState && this.api) {
        appState = this.api.getAppState();
        console.log("Got appState from API:", appState);
      }

      if (!appState) {
        console.warn("No appState available from either getter or API");
        return [];
      }

      console.log("=== getSelectedElements Debug ===");
      console.log("AppState:", appState);
      console.log("AppState keys:", appState ? Object.keys(appState) : []);
      console.log("selectedElementIds:", appState?.selectedElementIds);
      console.log("selectedElementIds type:", typeof appState?.selectedElementIds);
      console.log("selectedElementIds isArray:", Array.isArray(appState?.selectedElementIds));
      console.log("Current elements count:", currentElements.length);

      // Excalidraw's selectedElementIds can be:
      // - An object with element IDs as keys: { "id1": true, "id2": true }
      // - An array of IDs: ["id1", "id2"]
      // - A Set of IDs
      // - null or undefined
      let selectedIds: Set<string> = new Set();

      if (appState?.selectedElementIds) {
        if (Array.isArray(appState.selectedElementIds)) {
          selectedIds = new Set(appState.selectedElementIds);
          console.log("Selected IDs from array:", Array.from(selectedIds));
        } else if (appState.selectedElementIds instanceof Set) {
          selectedIds = appState.selectedElementIds;
          console.log("Selected IDs from Set:", Array.from(selectedIds));
        } else if (typeof appState.selectedElementIds === 'object' && appState.selectedElementIds !== null) {
          // Object format: { "id1": true, "id2": true }
          const keys = Object.keys(appState.selectedElementIds);
          console.log("Selected IDs object keys:", keys);
          selectedIds = new Set(
            keys.filter(
              (id) => appState.selectedElementIds[id] === true
            )
          );
          console.log("Selected IDs from object:", Array.from(selectedIds));
        } else {
          console.log("selectedElementIds is not a recognized format:", appState.selectedElementIds);
        }
      } else {
        console.log("No selectedElementIds in appState");
      }

      console.log("Final selectedIds Set:", Array.from(selectedIds));
      console.log("Selected IDs count:", selectedIds.size);

      const activeElements = this.filterActiveElements(currentElements);
      console.log("Active elements count:", activeElements.length);
      console.log("Active element IDs:", activeElements.map(el => el.id));

      // Filter elements that are selected
      const selected = activeElements.filter((el) => {
        const isSelected = selectedIds.has(el.id);
        if (isSelected) {
          console.log(`Element ${el.id} (${el.type}) is selected`);
        }
        return isSelected;
      });

      console.log("Selected elements count:", selected.length);
      console.log("Selected element IDs:", selected.map(el => el.id));
      console.log("=== End Debug ===");

      return selected;
    } catch (error) {
      console.error("Error getting selected elements:", error);
      return [];
    }
  }
}

