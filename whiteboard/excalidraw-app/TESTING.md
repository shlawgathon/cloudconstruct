# Testing Excalidraw

This guide explains how to test the Excalidraw application.

## Quick Start

### 1. Install Dependencies

Navigate to the excalidraw-app directory and install dependencies:

```bash
cd whiteboard/excalidraw-app
npm install
# or
bun install
```

### 2. Start Development Server

Run the development server:

```bash
npm run dev
# or
bun run dev
```

The app will automatically open in your browser at `http://localhost:3000`.

### 3. Test Basic Functionality

Once the app is running, you should be able to:

- ✅ See the Excalidraw canvas
- ✅ Draw shapes (rectangles, circles, arrows, etc.)
- ✅ Add text
- ✅ Use the toolbar tools
- ✅ Undo/Redo operations
- ✅ Check browser console for change events

## What to Test

### Basic Drawing
- Draw rectangles, circles, diamonds
- Draw arrows and lines
- Add text labels
- Use different colors and stroke widths

### Console Logging
Open the browser console (F12 or Cmd+Option+I) and you should see:
- `Elements changed: X` - when you add/modify elements
- `App state: {...}` - current app state

### Excalidraw Features
- Toolbar tools (select, rectangle, circle, arrow, line, text)
- Zoom in/out
- Pan the canvas
- Undo/Redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
- Export/Import functionality

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, Vite will automatically try the next available port. Check the terminal output for the actual URL.

### Module Not Found Errors
If you see module not found errors:
1. Delete `node_modules` and reinstall:
   ```bash
   rm -rf node_modules
   npm install
   ```

### TypeScript Errors
If you see TypeScript errors:
1. Check that all dependencies are installed
2. Verify `tsconfig.json` is correct
3. Try restarting the TypeScript server in your IDE

### Excalidraw Not Rendering
If Excalidraw doesn't render:
1. Check browser console for errors
2. Verify `@excalidraw/excalidraw` is installed correctly
3. Check that React is properly set up

## Next Steps

Once basic Excalidraw is working, you can:

1. **Add Component Detection**: Implement `ComponentDetector.ts` to detect infrastructure components
2. **Add WebSocket Connection**: Connect to the worker service
3. **Add Status Overlays**: Implement visual status indicators
4. **Add AI Integration**: Connect to Gemini for component analysis

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed implementation plans.

