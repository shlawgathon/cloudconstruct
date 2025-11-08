/**
 * Maps status to visual properties for Excalidraw elements
 */
import type { ExcalidrawElement } from "./ElementFactory";

export type Status = "green" | "red" | "blue" | "orange" | "loading";

export interface StatusStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
}

export class StatusUpdater {
  /**
   * Gets the visual style for a given status
   */
  static getStatusStyle(status: Status): StatusStyle {
    const styles: Record<Status, StatusStyle> = {
      green: {
        strokeColor: "#22c55e",
        backgroundColor: "#22c55e22",
        strokeWidth: 4,
        strokeStyle: "solid",
      },
      red: {
        strokeColor: "#ef4444",
        backgroundColor: "#ef444422",
        strokeWidth: 4,
        strokeStyle: "solid",
      },
      blue: {
        strokeColor: "#3b82f6",
        backgroundColor: "#3b82f622",
        strokeWidth: 3,
        strokeStyle: "solid",
      },
      orange: {
        strokeColor: "#f97316",
        backgroundColor: "#f9731622",
        strokeWidth: 3,
        strokeStyle: "dashed",
      },
      loading: {
        strokeColor: "#f97316",
        backgroundColor: "#f9731622",
        strokeWidth: 3,
        strokeStyle: "dashed",
      },
    };

    return styles[status];
  }

  /**
   * Applies status styling to an element
   */
  static applyStatusToElement(
    element: ExcalidrawElement,
    status: Status
  ): ExcalidrawElement {
    const style = this.getStatusStyle(status);

    return {
      ...element,
      strokeColor: style.strokeColor,
      backgroundColor: style.backgroundColor,
      strokeWidth: style.strokeWidth,
      strokeStyle: style.strokeStyle,
      customData: {
        ...element.customData,
        status,
      },
    };
  }

  /**
   * Gets status meaning/description
   */
  static getStatusMeaning(status: Status): string {
    const meanings: Record<Status, string> = {
      green: "Success / Deployed",
      red: "Failure / Error",
      blue: "Checking / Componentgen Complete",
      orange: "Loading / In Progress",
      loading: "Loading / In Progress",
    };

    return meanings[status];
  }
}

