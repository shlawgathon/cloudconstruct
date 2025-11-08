import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useState } from 'react';
import './App.css';

/**
 * Main Excalidraw app with custom integrations
 * Basic test implementation to verify Excalidraw works
 */
export const App = () => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={(elements, appState) => {
          console.log('Elements changed:', elements.length);
          console.log('App state:', appState);
        }}
      />
    </div>
  );
};

