/**
 * Control panel to trigger live updates
 */
import { LiveUpdateService } from "../services/LiveUpdateService";
import type { Status } from "../services/StatusUpdater";

interface TestPanelProps {
  updateService: LiveUpdateService;
}

export function TestPanel({ updateService }: TestPanelProps) {
  const handleAddRectangle = () => {
    updateService.addElement("rectangle");
  };

  const handleAddText = () => {
    updateService.addElement("text", undefined, { text: "Hello World" });
  };

  const handleChangeColor = () => {
    const selected = updateService.getSelectedElements();
    if (selected.length > 0) {
      const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f97316", "#8b5cf6"];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      updateService.changeElementColor(selected[0].id, randomColor);
    } else {
      alert("Please select an element first");
    }
  };

  const handleSetStatus = (status: Status) => {
    const selected = updateService.getSelectedElements();
    if (selected.length > 0) {
      selected.forEach((el) => {
        updateService.setElementStatus(el.id, status);
      });
    } else {
      alert("Please select an element first");
    }
  };

  const handleAddArrow = () => {
    const selected = updateService.getSelectedElements();
    if (selected.length >= 2) {
      updateService.addArrow(selected[0].id, selected[1].id);
    } else {
      alert("Please select at least 2 elements");
    }
  };

  const handleDeleteSelected = () => {
    const selected = updateService.getSelectedElements();
    if (selected.length > 0) {
      const ids = selected.map((el) => el.id);
      updateService.deleteElements(ids);
    } else {
      alert("Please select an element first");
    }
  };

  const handleClearCanvas = () => {
    if (confirm("Are you sure you want to clear the canvas?")) {
      updateService.clearCanvas();
    }
  };

  const handleSimulateStatusChange = () => {
    const selected = updateService.getSelectedElements();
    if (selected.length > 0) {
      updateService.simulateStatusProgression(selected[0].id);
    } else {
      alert("Please select an element first");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "white",
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 1000,
        maxWidth: "300px",
        maxHeight: "80vh",
        overflowY: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px", fontWeight: "600" }}>
        Test Controls
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={handleAddRectangle}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            background: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Add Rectangle
        </button>
        <button
          onClick={handleAddText}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            background: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Add Text
        </button>
        <button
          onClick={handleChangeColor}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            background: "white",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Change Color
        </button>
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e0e0e0" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
            Status:
          </div>
          <button
            onClick={() => handleSetStatus("green")}
            style={{
              padding: "6px 10px",
              border: "1px solid #22c55e",
              borderRadius: "4px",
              background: "#22c55e22",
              color: "#22c55e",
              cursor: "pointer",
              fontSize: "12px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Set Status Green
          </button>
          <button
            onClick={() => handleSetStatus("red")}
            style={{
              padding: "6px 10px",
              border: "1px solid #ef4444",
              borderRadius: "4px",
              background: "#ef444422",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "12px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Set Status Red
          </button>
          <button
            onClick={() => handleSetStatus("blue")}
            style={{
              padding: "6px 10px",
              border: "1px solid #3b82f6",
              borderRadius: "4px",
              background: "#3b82f622",
              color: "#3b82f6",
              cursor: "pointer",
              fontSize: "12px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Set Status Blue
          </button>
          <button
            onClick={() => handleSetStatus("orange")}
            style={{
              padding: "6px 10px",
              border: "1px solid #f97316",
              borderRadius: "4px",
              background: "#f9731622",
              color: "#f97316",
              cursor: "pointer",
              fontSize: "12px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Set Status Orange
          </button>
        </div>
        <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e0e0e0" }}>
          <button
            onClick={handleAddArrow}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              background: "white",
              cursor: "pointer",
              fontSize: "14px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Add Arrow
          </button>
          <button
            onClick={handleDeleteSelected}
            style={{
              padding: "8px 12px",
              border: "1px solid #ef4444",
              borderRadius: "4px",
              background: "#ef444422",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "14px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Delete Selected
          </button>
          <button
            onClick={handleClearCanvas}
            style={{
              padding: "8px 12px",
              border: "1px solid #ef4444",
              borderRadius: "4px",
              background: "#ef444422",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: "14px",
              marginBottom: "4px",
              width: "100%",
            }}
          >
            Clear Canvas
          </button>
          <button
            onClick={handleSimulateStatusChange}
            style={{
              padding: "8px 12px",
              border: "1px solid #3b82f6",
              borderRadius: "4px",
              background: "#3b82f622",
              color: "#3b82f6",
              cursor: "pointer",
              fontSize: "14px",
              width: "100%",
            }}
          >
            Simulate Status Change
          </button>
        </div>
      </div>
    </div>
  );
}

