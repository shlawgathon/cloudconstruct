# CloudConstruct AI Excalidraw Extension

AI-powered infrastructure prototyping with visual feedback for VS Code.

## Features

- **Visual Infrastructure Design**: Draw your database to life with AI-powered prototyping
- **Cluster Management**: Monitor and manage Kubernetes clusters
- **Real-time Status**: Get real-time feedback on cluster status
- **Modern UI**: Built with Next.js and shadcn/ui components

## Development

### Prerequisites

- Node.js 18+ or Bun
- VS Code 1.105.0+

### Setup

1. Install dependencies for the extension:
```bash
bun install
```

2. Install dependencies for the UI app:
```bash
cd ui-app
bun install
cd ..
```

### Running

1. Start the Next.js UI app in development mode:
```bash
bun run ui:dev
```

2. Compile the extension:
```bash
bun run compile
```

3. Press `F5` in VS Code to launch a new Extension Development Host window with the extension loaded.

### Building

Build both the extension and UI app:
```bash
bun run vscode:prepublish
```

This will:
- Compile TypeScript to JavaScript in the `out` directory
- Build the Next.js app to `ui-app/out`

### Packaging

Package the extension for distribution:
```bash
bun run package
```

## Project Structure

```
vscode-extension/
├── src/                    # Extension source code
│   ├── extension.ts       # Main entry point
│   ├── auth/              # Authentication management
│   ├── client/            # API client
│   ├── cluster/           # Cluster operations
│   ├── filesystem/        # File system operations
│   ├── types/             # Type definitions
│   ├── ui/                # UI components
│   └── websocket/         # WebSocket management
├── ui-app/                # Next.js UI application
│   ├── app/               # Next.js app directory
│   ├── components/        # React components (shadcn/ui)
│   └── lib/               # Utilities
├── media/                 # Static assets
└── out/                   # Compiled output
```

## Configuration

The extension can be configured via VS Code settings:

- `cloudconstruct.workerUrl`: Worker service URL (default: `http://localhost:3000`)
- `cloudconstruct.nextJsUrl`: Next.js dev server URL (default: `http://localhost:3001`)
- `cloudconstruct.autoCheck`: Automatically check cluster status (default: `true`)

## Commands

- `CloudConstruct: Login` - Open login view
- `CloudConstruct: Sign Up` - Open sign up view
- `CloudConstruct: Open in Browser` - Open CloudConstruct in browser
- `CloudConstruct: Show Status` - Show detailed cluster status
- `CloudConstruct: Check Cluster` - Check cluster status

## License

MIT
