/**
 * Service to handle programmatic updates to Excalidraw canvas
 */
import type { ExcalidrawElement } from "./ElementFactory";
import { ElementFactory } from "./ElementFactory";
import { StatusUpdater, type Status } from "./StatusUpdater";

export interface ExcalidrawAPI {
  updateScene: (scene: { elements: ExcalidrawElement[] }) => void;
  getSceneElements: () => ExcalidrawElement[];
  getAppState: () => any;
  scrollToContent: (element: ExcalidrawElement) => void;
}

export class LiveUpdateService {
  private api: ExcalidrawAPI | null = null;

  /**
   * Sets the Excalidraw API reference
   */
  setAPI(api: ExcalidrawAPI) {
    this.api = api;
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
    const appState = this.api.getAppState();

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
      el.id === elementId ? { ...el, ...updates } : el
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
    if (!this.api) {
      console.error("Excalidraw API not initialized");
      return;
    }

    const currentElements = this.api.getSceneElements();
    const element = currentElements.find((el) => el.id === elementId);

    if (!element) {
      console.error(`Element ${elementId} not found`);
      return;
    }

    const updatedElement = StatusUpdater.applyStatusToElement(element, status);
    const updatedElements = currentElements.map((el) =>
      el.id === elementId ? updatedElement : el
    );

    this.api.updateScene({ elements: updatedElements });
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
    if (!this.api) {
      return [];
    }

    const appState = this.api.getAppState();
    const selectedElementIds = appState?.selectedElementIds || {};
    const currentElements = this.api.getSceneElements();

    return currentElements.filter((el) => selectedElementIds[el.id]);
  }
}

