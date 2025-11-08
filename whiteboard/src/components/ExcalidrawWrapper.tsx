/**
 * Wrapper component for Excalidraw with API access
 * Uses Excalidraw from CDN without installing the package
 */
import { useEffect, useRef, useState } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import type { ExcalidrawElement } from "../services/ElementFactory";

// Declare Excalidraw types from CDN
declare global {
  interface Window {
    ExcalidrawLib: any;
    React: typeof React;
    ReactDOM: typeof ReactDOM;
  }
}

export interface ExcalidrawAPI {
  updateScene: (scene: { elements: ExcalidrawElement[] }) => void;
  getSceneElements: () => ExcalidrawElement[];
  getAppState: () => any;
  scrollToContent: (element: ExcalidrawElement) => void;
}

interface ExcalidrawWrapperProps {
  onAPIReady?: (api: ExcalidrawAPI) => void;
  onChange?: (elements: ExcalidrawElement[], appState: any) => void;
  initialData?: {
    elements?: ExcalidrawElement[];
  };
}

export function ExcalidrawWrapper({
  onAPIReady,
  onChange,
  initialData,
}: ExcalidrawWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [Excalidraw, setExcalidraw] = useState<any>(null);
  const apiReadyRef = useRef(false);
  const rootRef = useRef<any>(null);

  useEffect(() => {
    // Excalidraw needs React 18, but we have React 19
    // Use esm.sh to bundle Excalidraw with React 18, isolating it from our React 19
    const setupReact = async () => {
      const win = window as any;
      
      // For UMD builds, we need React 18 available globally
      // But we'll try esm.sh first which bundles React 18
      // So we don't need to load React 18 separately
      
      // Only load React 18 if we're going to use UMD build
      // For now, we'll try esm.sh bundled version first
      return Promise.resolve();
    };

    // Check if Excalidraw is already loaded
    const checkExcalidraw = () => {
      // Try different possible global variable names
      const win = window as any;
      
      // Check ExcalidrawLib.Excalidraw
      if (win.ExcalidrawLib?.Excalidraw) {
        setExcalidraw(() => win.ExcalidrawLib.Excalidraw);
        setIsLoaded(true);
        return true;
      }
      
      // Check ExcalidrawLib.default
      if (win.ExcalidrawLib?.default) {
        setExcalidraw(() => win.ExcalidrawLib.default);
        setIsLoaded(true);
        return true;
      }
      
      // Check direct Excalidraw
      if (win.Excalidraw) {
        setExcalidraw(() => win.Excalidraw);
        setIsLoaded(true);
        return true;
      }
      
      // Check for any Excalidraw-related globals
      const excalidrawKeys = Object.keys(win).filter(k => 
        k.toLowerCase().includes('excalidraw')
      );
      if (excalidrawKeys.length > 0) {
        console.log("Found Excalidraw-related globals:", excalidrawKeys);
        // Try the first one
        const firstKey = excalidrawKeys[0];
        if (win[firstKey]?.Excalidraw) {
          setExcalidraw(() => win[firstKey].Excalidraw);
          setIsLoaded(true);
          return true;
        }
      }
      
      return false;
    };

    if (checkExcalidraw()) {
      return;
    }

    // Load Excalidraw - try ES module first (esm.sh bundles React), then UMD builds
    const loadExcalidraw = async () => {
      // Strategy 1: Try esm.sh with bundled React 18 (isolated from our React 19)
      try {
        console.log("Trying esm.sh with bundled React 18...");
        // Use esm.sh to bundle React 18 with Excalidraw, so it's isolated
        const esmModule = await import("https://esm.sh/@excalidraw/excalidraw@latest?deps=react@18,react-dom@18");
        const ExcalidrawComponent = esmModule.Excalidraw || esmModule.default?.Excalidraw || esmModule.default;
        if (ExcalidrawComponent && typeof ExcalidrawComponent === 'function') {
          setExcalidraw(() => ExcalidrawComponent);
          setIsLoaded(true);
          console.log("✓ Loaded Excalidraw from esm.sh (bundled React 18)");
          return;
        }
      } catch (e1) {
        console.log("esm.sh with bundled React failed:", e1);
      }

      // Strategy 2: Load React 18 from CDN, then load Excalidraw UMD build
      const win = window as any;
      
      // Check if React 18 is already loaded
      if (!(win.React && win.React.version && win.React.version.startsWith('18'))) {
        // Load React 18 from CDN
        await new Promise<void>((resolve) => {
          const reactScript = document.createElement("script");
          reactScript.src = "https://unpkg.com/react@18/umd/react.production.min.js";
          reactScript.crossOrigin = "anonymous";
          reactScript.setAttribute("data-react-cdn", "true");
          
          const reactDOMScript = document.createElement("script");
          reactDOMScript.src = "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js";
          reactDOMScript.crossOrigin = "anonymous";
          reactDOMScript.setAttribute("data-react-cdn", "true");
          
          reactScript.onload = () => {
            reactDOMScript.onload = () => {
              if (win.React && win.ReactDOM) {
                console.log("React 18 loaded from CDN for UMD build");
                resolve();
              } else {
                console.error("React 18 failed to load");
                resolve();
              }
            };
            reactDOMScript.onerror = () => {
              console.error("Failed to load ReactDOM 18");
              resolve();
            };
            document.head.appendChild(reactDOMScript);
          };
          
          reactScript.onerror = () => {
            console.error("Failed to load React 18");
            resolve();
          };
          
          document.head.appendChild(reactScript);
        });
      } else {
        console.log("React 18 already available");
      }
      
      // Now try loading Excalidraw UMD build
      const tryLoadScript = (url: string, cdnName: string) => {
        return new Promise<boolean>((resolve) => {
          const existingScript = document.querySelector(`script[src="${url}"]`);
          if (existingScript) {
            setTimeout(() => {
              resolve(checkExcalidraw());
            }, 100);
            return;
          }

          const script = document.createElement("script");
          script.type = "text/javascript";
          script.src = url;
          script.async = true;
          script.crossOrigin = "anonymous";
          
          script.onload = () => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
              attempts++;
              if (checkExcalidraw()) {
                clearInterval(checkInterval);
                console.log(`✓ Loaded Excalidraw from ${cdnName}`);
                resolve(true);
              } else if (attempts > 20) {
                clearInterval(checkInterval);
                console.log(`✗ ${cdnName} script loaded but Excalidraw not found`);
                resolve(false);
              }
            }, 200);
          };
          
          script.onerror = (e) => {
            console.log(`✗ Failed to load script from ${cdnName}:`, e);
            resolve(false);
          };
          
          document.head.appendChild(script);
        });
      };

      // Try different UMD build URLs
      const urls = [
        { url: "https://unpkg.com/@excalidraw/excalidraw@latest/dist/excalidraw.production.min.js", name: "unpkg (production)" },
        { url: "https://unpkg.com/@excalidraw/excalidraw@latest/dist/umd/excalidraw.production.min.js", name: "unpkg (UMD)" },
        { url: "https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@latest/dist/excalidraw.production.min.js", name: "jsDelivr (production)" },
      ];

      for (const { url, name } of urls) {
        console.log(`Trying ${name}...`);
        const success = await tryLoadScript(url, name);
        if (success) {
          return;
        }
      }

      // All methods failed
      console.error("✗ All CDN methods failed. Excalidraw may need to be installed via npm.");
      console.error("Available window properties:", 
        Object.keys(window).filter(k => 
          k.toLowerCase().includes('excalidraw') || 
          k.toLowerCase().includes('excal') ||
          k.toLowerCase().includes('react')
        )
      );
      console.error("React available:", !!(window as any).React);
      console.error("ReactDOM available:", !!(window as any).ReactDOM);
    };

    // Setup React first, then load Excalidraw
    setupReact().then(() => {
      loadExcalidraw();
    });

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Render Excalidraw using React 18's ReactDOM if available, otherwise use React 19
  // This useEffect must always be called (hooks rule), but only executes when ready
  useEffect(() => {
    // Guard: Only run once when Excalidraw is loaded
    if (!isLoaded || !Excalidraw || !containerRef.current || rootRef.current) return;

    const container = containerRef.current;
    const win = window as any;
    
    // Try to use React 18's ReactDOM if available (from CDN)
    const ReactDOMToUse = win.ReactDOM && win.React.version && win.React.version.startsWith('18')
      ? win.ReactDOM
      : ReactDOM;
    
    const ReactToUse = win.React && win.React.version && win.React.version.startsWith('18')
      ? win.React
      : React;

    // Clear container
    container.innerHTML = '';
    
    // Create a root using the appropriate ReactDOM
    let root: any;
    if (ReactDOMToUse.createRoot) {
      root = ReactDOMToUse.createRoot(container);
    } else {
      // Fallback for older React versions
      root = {
        render: (element: any) => ReactDOMToUse.render(element, container),
      };
    }

    // Store root reference to prevent re-rendering
    rootRef.current = root;

    // Render Excalidraw with the appropriate React
    const excalidrawElement = ReactToUse.createElement(Excalidraw, {
      ref: excalidrawRef,
      initialData,
      onChange: (elements: ExcalidrawElement[], appState: any) => {
        onChange?.(elements, appState);
      },
      onReady: () => {
        console.log("Excalidraw ready");
      },
    });

    root.render(excalidrawElement);

    // Create API wrapper after render - only call once
    if (!apiReadyRef.current) {
      const api: ExcalidrawAPI = {
        updateScene: (scene: { elements: ExcalidrawElement[] }) => {
          if (excalidrawRef.current) {
            excalidrawRef.current.updateScene(scene);
          }
        },
        getSceneElements: () => {
          if (excalidrawRef.current) {
            return excalidrawRef.current.getSceneElements() || [];
          }
          return [];
        },
        getAppState: () => {
          if (excalidrawRef.current) {
            return excalidrawRef.current.getAppState() || {};
          }
          return {};
        },
        scrollToContent: (element: ExcalidrawElement) => {
          if (excalidrawRef.current) {
            excalidrawRef.current.scrollToContent(element, {
              fitToContent: true,
            });
          }
        },
      };

      apiReadyRef.current = true;
      onAPIReady?.(api);
    }

    return () => {
      if (rootRef.current) {
        if (rootRef.current.unmount) {
          rootRef.current.unmount();
        } else if (container) {
          ReactDOMToUse.unmountComponentAtNode(container);
        }
        rootRef.current = null;
      }
      apiReadyRef.current = false;
    };
  }, [isLoaded, Excalidraw]); // Removed onChange, onAPIReady, initialData from dependencies to prevent re-renders

  // Always return the container - hooks must be called before any conditional returns
  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      {!isLoaded || !Excalidraw ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div style={{ marginBottom: "10px" }}>Loading Excalidraw from CDN...</div>
          <div style={{ fontSize: "12px", color: "#666", textAlign: "center", maxWidth: "500px" }}>
            If this takes too long, check the browser console for errors.
            <br />
            Excalidraw is being loaded from CDN without npm installation.
          </div>
        </div>
      ) : null}
    </div>
  );
}

