import { useEffect, useRef } from "react";
import "./index.css";

/**
 * Excalidraw embed test
 * Uses Excalidraw web embed (iframe) for local testing
 */
export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Listen for messages from Excalidraw iframe
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from Excalidraw origin
      if (
        event.origin !== "https://excalidraw.com" &&
        event.origin !== "https://embed.excalidraw.com"
      ) {
        return;
      }

      console.log("Message from Excalidraw:", event.data);
      // Handle Excalidraw events here
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <iframe
        ref={iframeRef}
        src="https://excalidraw.com"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        title="Excalidraw Whiteboard"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default App;
