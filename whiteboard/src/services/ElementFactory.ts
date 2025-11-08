/**
 * Factory to create Excalidraw elements with proper structure
 */

export type ExcalidrawElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  boundElements?: any[];
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  customData?: Record<string, any>;
  [key: string]: any;
};

export class ElementFactory {
  /**
   * Creates a rectangle element
   */
  static createRectangle(
    x: number,
    y: number,
    width: number = 200,
    height: number = 150
  ): ExcalidrawElement {
    return {
      id: this.generateId(),
      type: "rectangle",
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      boundElements: [],
    };
  }

  /**
   * Creates a text element
   */
  static createText(
    x: number,
    y: number,
    text: string,
    fontSize: number = 20
  ): ExcalidrawElement {
    return {
      id: this.generateId(),
      type: "text",
      x,
      y,
      width: text.length * (fontSize * 0.6),
      height: fontSize * 1.2,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      boundElements: [],
      text,
      fontSize,
      fontFamily: 1, // Virgil
    };
  }

  /**
   * Creates an arrow element connecting two elements
   */
  static createArrow(
    startElementId: string,
    endElementId: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): ExcalidrawElement {
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);

    return {
      id: this.generateId(),
      type: "arrow",
      x: startX,
      y: startY,
      width: length,
      height: 0,
      angle: Math.atan2(dy, dx),
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      boundElements: [],
      points: [
        [0, 0],
        [length, 0],
      ],
      startBinding: {
        elementId: startElementId,
        focus: 0,
        gap: 0,
      },
      endBinding: {
        elementId: endElementId,
        focus: 0,
        gap: 0,
      },
    };
  }

  /**
   * Creates a component element with metadata
   */
  static createComponentElement(
    componentType: "LB" | "DB" | "webapp" | "k8s",
    x: number,
    y: number,
    width: number = 200,
    height: number = 150
  ): ExcalidrawElement {
    const labels: Record<string, string> = {
      LB: "Load Balancer",
      DB: "Database",
      webapp: "Web App",
      k8s: "K8s Cluster",
    };

    return {
      id: this.generateId(),
      type: "rectangle",
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "hachure",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      boundElements: [],
      customData: {
        componentType,
        label: labels[componentType],
        status: "initial",
      },
    };
  }

  /**
   * Generates a unique ID for elements
   */
  private static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

