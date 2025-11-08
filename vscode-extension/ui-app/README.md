# CloudConstruct UI App

Next.js application with shadcn/ui components for the VS Code extension webview.

## Overview

This is a Next.js application that provides the UI for the CloudConstruct VS Code extension. It runs in a webview within VS Code and communicates with the extension via the VS Code API.

## Features

- **Login/Signup UI**: Authentication interface for CloudConstruct
- **Status Dashboard**: Real-time cluster status monitoring
- **Modern UI**: Built with Next.js 15, React 19, and shadcn/ui components
- **VS Code Integration**: Seamless communication with the VS Code extension

## Development

### Prerequisites

- Node.js 18+ or Bun
- VS Code extension running (for full integration)

### Setup

1. Install dependencies:
```bash
bun install
```

2. Start the development server:
```bash
bun run dev
```

The app will be available at http://localhost:3001

### Running Standalone

The app can run standalone (outside VS Code) for development purposes. In standalone mode:
- VS Code API calls will be logged to console
- Some features may be limited
- Useful for UI development and testing

## Build

Build the application for production:

```bash
bun run build
```

The built files will be in the `out` directory (configured in `next.config.js`).

### Build Configuration

The app is configured with:
- `output: 'export'` - Static export for VS Code webview
- `distDir: 'out'` - Output directory
- `images.unoptimized: true` - Required for VS Code webview
- `trailingSlash: true` - URL compatibility

## Project Structure

```
ui-app/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Login page
│   └── status/            # Status pages
│       └── page.tsx        # Status dashboard
├── components/            # React components
│   └── ui/                # shadcn/ui components
│       ├── button.tsx
│       └── card.tsx
├── lib/                   # Utilities
│   └── utils.ts           # Helper functions
├── out/                   # Build output (generated)
├── next.config.js         # Next.js configuration
├── tailwind.config.ts     # Tailwind CSS configuration
└── package.json           # Dependencies
```

## Integration with VS Code Extension

The UI app communicates with the VS Code extension via:

1. **VS Code API**: The extension injects `acquireVsCodeApi()` into the webview
2. **PostMessage**: Two-way communication between webview and extension
3. **Commands**: UI triggers extension commands (login, signup, etc.)

### VS Code API Usage

```typescript
// In the UI app
if (window.vscode) {
  window.vscode.postMessage({ command: "login" });
}
```

## Configuration

The extension configuration (in VS Code settings) affects the UI app:

- `cloudconstruct.nextJsUrl`: Next.js dev server URL (default: `http://localhost:3001`)
- `cloudconstruct.workerUrl`: Worker service URL (default: `http://localhost:3000`)

## Scripts

- `bun run dev` - Start development server on port 3001
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run lint` - Run ESLint

## Dependencies

- **Next.js 15**: React framework
- **React 19**: UI library
- **shadcn/ui**: UI component library (via Radix UI)
- **Tailwind CSS**: Styling
- **Lucide React**: Icons

## Notes

- The app is designed to run in a VS Code webview, which has some limitations
- Static export is used (`output: 'export'`) for compatibility with VS Code
- Images must be unoptimized for webview compatibility
- The build output goes to `out/` directory (not `.next/`)

