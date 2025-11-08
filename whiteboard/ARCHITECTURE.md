# Excalidraw AI Integration - Architecture Documentation

## Overview

This document describes the architecture and design of the Excalidraw-based whiteboard application with AI integration for infrastructure visualization and management. The application integrates with the Kotlin Worker service and VSCode extension to provide real-time infrastructure component tracking, status monitoring, and automated code generation.

## Project Structure

```
excalidraw-app/
├── src/
│   ├── App.tsx                    # Main Excalidraw app with custom integrations
│   ├── index.tsx                  # Entry point
│   ├── client/
│   │   └── WorkerApiClient.ts     # SHARED TypeScript API client - SAME as VSCode extension
│   ├── websocket/
│   │   ├── WhiteboardWebSocket.ts # Separate WS connection for whiteboard operations
│   │   └── ConnectionManager.ts  # Manages WS lifecycle, reconnection, heartbeat
│   ├── auth/
│   │   ├── AuthProvider.tsx       # Auth context provider for React
│   │   ├── AuthService.ts         # Basic auth service, session management
│   │   └── LoginModal.tsx         # Login modal UI component
│   ├── components/
│   │   ├── ComponentDetector.ts   # Detects infrastructure components from Excalidraw elements
│   │   ├── ChangeTracker.ts       # Tracks component changes (added/removed/modified)
│   │   ├── ComponentMapper.ts     # Maps Excalidraw elements to infrastructure components
│   │   └── PeriodicChecker.ts     # 1s interval checker to detect whiteboard changes
│   ├── status/
│   │   ├── StatusOverlay.tsx      # Visual status overlay on components (blue/green/red/orange)
│   │   ├── StatusManager.ts       # Manages component status state
│   │   ├── LoadingIndicator.tsx   # Loading spinner for components being checked
│   │   └── StatusBadge.tsx        # Status badge component (checkmark, error, loading)
│   ├── ai/
│   │   ├── GeminiService.ts          # Gemini API integration for component analysis
│   │   ├── ScreenshotCapture.ts   # Captures component screenshots for multimodal input
│   │   ├── ComponentAnalyzer.ts   # Analyzes component changes via Gemini
│   │   └── PromptBuilder.ts       # Builds prompts for Gemini with context
│   ├── whiteboard/
│   │   ├── WhiteboardSync.ts      # Syncs whiteboard state with worker
│   │   ├── ElementRenderer.ts     # Custom rendering for infrastructure components
│   │   ├── ComponentRegistry.ts  # Registry of known component types (LB, DB, webapp, etc)
│   │   └── LayoutManager.ts       # Manages component layout and connections
│   ├── ui/
│   │   ├── Toolbar.tsx            # Custom toolbar with component palette
│   │   ├── ComponentPalette.tsx  # Palette of infrastructure components
│   │   ├── StatusPanel.tsx        # Side panel showing all component statuses
│   │   ├── ConnectionStatus.tsx   # Worker connection status indicator
│   │   └── NotificationToast.tsx  # Toast notifications for updates
│   ├── hooks/
│   │   ├── useWhiteboardSync.ts   # Hook for whiteboard sync logic
│   │   ├── useComponentStatus.ts  # Hook for component status updates
│   │   ├── usePeriodicCheck.ts    # Hook for 1s periodic checks
│   │   └── useWebSocket.ts        # Hook for WebSocket connection
│   ├── types/
│   │   ├── components.ts          # Infrastructure component type definitions
│   │   ├── status.ts              # Status type definitions
│   │   ├── messages.ts            # WebSocket message types (matches worker)
│   │   └── excalidraw.ts          # Extended Excalidraw element types
│   ├── utils/
│   │   ├── elementUtils.ts        # Helper functions for Excalidraw elements
│   │   ├── diffUtils.ts           # Diff utility for detecting changes
│   │   └── screenshotUtils.ts     # Screenshot capture utilities
│   └── store/
│       ├── componentStore.ts      # Zustand/Redux store for component state
│       ├── statusStore.ts         # Store for component statuses
│       └── authStore.ts           # Authentication state store
├── public/
│   ├── index.html                 # HTML entry point
│   └── assets/
│       └── component-icons.svg    # Infrastructure component icons
├── package.json                   # Dependencies including @excalidraw/excalidraw
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite build configuration
└── .env.example                   # Environment variables (worker URL, etc)
```

## Architecture Layers

### 1. Presentation Layer

#### Excalidraw Canvas
- **Responsibility**: Visual editing of infrastructure components
- **Technology**: `@excalidraw/excalidraw` React component
- **Features**:
  - Drag-and-drop component placement
  - Visual editing of component properties
  - Connection drawing between components

#### Status Overlay
- **Responsibility**: Visual feedback on component status
- **Status Colors**:
  - **Blue**: Checking/componentgen complete
  - **Green**: Success - component deployed
  - **Red**: Failure - deployment failed
  - **Orange**: Loading/In progress

#### Component Palette
- **Responsibility**: Drag-and-drop infrastructure components
- **Available Components**:
  - Load Balancer
  - Database (MongoDB, PostgreSQL, etc)
  - Web App
  - K8s Cluster
  - API Gateway

### 2. Business Logic Layer

#### ComponentDetector
- **Responsibility**: Detect infrastructure components from Excalidraw elements
- **Algorithm**: Parse element text, shape, and metadata to identify component type
- **Detection Rules**: See [Component Detection Rules](#component-detection-rules)

#### ChangeTracker
- **Responsibility**: Track changes every 1s
- **Detects**:
  - Component added
  - Component removed
  - Component modified (position, size, connections)
  - Component text changed

#### StatusManager
- **Responsibility**: Manage component status lifecycle
- **States**:
  - `initial`: Component just created
  - `loading`: Component being analyzed
  - `checking`: Component being checked against cluster
  - `blue`: Componentgen complete
  - `green`: Success - deployed
  - `red`: Failure - deployment failed

### 3. Integration Layer

#### WorkerApiClient (Shared)
- **Responsibility**: Communication with Kotlin Worker via WebSocket
- **Note**: SAME client used by VSCode extension - ensures consistency
- **Location**: Should be symlinked or copied from `vscode-extension/src/client/WorkerApiClient.ts`

#### GeminiService
- **Responsibility**: AI analysis of component changes
- **Inputs**:
  - Screenshot of changed component
  - Component metadata (type, connections)
  - Previous state
- **Outputs**:
  - Interpreted component specification
  - Affected nodes on whiteboard

### 4. Data Layer

#### Component Store
- **Responsibility**: Client-side state management
- **Data**:
  - Component registry (id → component data)
  - Status map (componentId → status)
  - Change history

#### Worker MongoDB
- **Responsibility**: Server-side persistence
- **Data**:
  - Whiteboard state
  - Component specifications
  - Cluster check results

## Workflows

### Periodic Check Workflow (1s interval)

1. **PeriodicChecker** runs every 1 second
2. Compare current elements against previous snapshot
3. Detect changes (added/removed/modified components)
4. If changes detected:
   - Capture screenshot of affected area
   - Send to Gemini for analysis (multimodal)
   - Gemini returns component specification
   - Mark affected components as "loading"
   - Sync with worker via WebSocket
5. Worker processes changes and returns status updates
6. Update component visual status on whiteboard

### Cluster Check Workflow

1. User draws/modifies infrastructure component
2. Change detected by PeriodicChecker
3. Ask VSCode extension if spec file exists for component
4. If spec file exists:
   - Mark component for cluster check
   - Queue cluster check in worker
5. If spec file doesn't exist:
   - Trigger codegen via Gemini
   - Generate k8s/Terraform spec files
   - Send to VSCode extension via worker
6. Worker runs cluster check (apply/status)
7. Results streamed back to Excalidraw and VSCode
8. Component status updated to blue/green/red

### Codegen Workflow

1. Worker receives component specification from Excalidraw
2. Worker calls Gemini to generate k8s YAML/Terraform code
3. Generated code saved to MongoDB
4. Worker sends code to VSCode extension via WS
5. VSCode creates/updates spec file
6. Cluster check triggered automatically
7. Status updates flow back to Excalidraw

## WebSocket Message Flow

### Connection

- **Endpoint**: `ws://worker:8080/whiteboard`
- **Authentication**: Basic Auth on connection, session token for messages

### Message Types

#### Whiteboard Sync

**WHITEBOARD_STATE_UPDATE** (client → server)
```typescript
{
  elements: ExcalidrawElement[];
  appState: AppState;
  timestamp: number;
}
```

#### Component Detection

**COMPONENT_DETECTED** (client → server)
```typescript
{
  componentId: string;
  componentType: string;
  metadata: object;
  screenshot?: string; // base64
}
```

**COMPONENT_CHANGED** (client → server)
```typescript
{
  componentId: string;
  changeType: 'added' | 'removed' | 'modified';
  before?: ComponentData;
  after?: ComponentData;
  screenshot?: string; // base64
}
```

#### Status Updates

**COMPONENT_STATUS_UPDATE** (server → client)
```typescript
{
  componentId: string;
  componentName: string;
  status: 'loading' | 'checking' | 'blue' | 'green' | 'red';
  message?: string;
  details?: object;
}
```

#### Spec File Check

**SPEC_FILE_CHECK_REQUEST** (client → server)
```typescript
{
  componentName: string;
  componentType: string;
}
```

**SPEC_FILE_CHECK_RESPONSE** (server → client)
```typescript
{
  componentName: string;
  exists: boolean;
  path?: string;
}
```

#### Codegen

**CODEGEN_TRIGGER** (client → server)
```typescript
{
  componentName: string;
  componentSpec: object;
  componentType: string;
}
```

**CODEGEN_COMPLETE** (server → client)
```typescript
{
  componentName: string;
  success: boolean;
  files: {path: string, content: string}[];
}
```

## Component Detection Rules

### Load Balancer
- **Pattern**: Element contains text matching: "load balancer", "LB", "lb-"
- **Shape**: Rectangle or rounded rectangle
- **Color**: Orange or green border

### Database
- **Pattern**: Element contains text matching: "mongo", "database", "db", "postgres"
- **Shape**: Diamond, cylinder, or rectangle
- **Metadata**: May include connection specs (64g PVC, etc)

### Web App
- **Pattern**: Element contains text matching: "webapp", "web app", "frontend", "backend"
- **Shape**: Rectangle
- **Connections**: Usually connected to load balancer and/or database

### K8s Service
- **Pattern**: Element contains text matching: "k8s", "lb-N on k8s", "online"
- **Shape**: Rectangle with rounded corners
- **Color**: Blue fill

## Status Color Meanings

| Color | Meaning | Description |
|-------|---------|-------------|
| **Blue** | Checking/Componentgen Complete | Component specification has been generated and is ready for deployment |
| **Green** | Success | Component has been successfully deployed to the cluster |
| **Red** | Failure | Deployment failed or component check failed |
| **Orange** | Loading/In Progress | Component is being analyzed, code is being generated, or deployment is in progress |

## Integration Points

### VSCode Extension
- **Shared Client**: Uses the same `WorkerApiClient` for consistency
- **Spec File Management**: VSCode extension creates/updates spec files based on codegen results
- **Status Sync**: Both Excalidraw and VSCode receive status updates from worker

### Kotlin Worker
- **WebSocket Server**: Handles whiteboard-specific WebSocket connections
- **Code Generation**: Calls Gemini API to generate k8s/Terraform specs
- **Cluster Checks**: Executes cluster checks and streams results
- **State Persistence**: Stores whiteboard state and component specs in MongoDB

### Gemini AI
- **Multimodal Analysis**: Analyzes component screenshots and metadata
- **Code Generation**: Generates infrastructure-as-code from component specifications
- **Component Interpretation**: Interprets drawn components into structured specifications

## Development Notes

### Shared Code
- The `WorkerApiClient` should be shared between VSCode extension and Excalidraw app
- Consider using a shared package or symlink to ensure consistency
- Message types should match exactly between client and worker

### Performance Considerations
- Periodic checking runs every 1 second - optimize diff algorithms
- Screenshot capture should be throttled to avoid excessive API calls
- WebSocket reconnection should be handled gracefully with exponential backoff

### Security
- Basic Auth on WebSocket connection
- Session tokens for message authentication
- Gemini API keys stored in environment variables

## Future Enhancements

- [ ] Support for more component types
- [ ] Multi-user collaboration
- [ ] Component templates library
- [ ] Export/import whiteboard configurations
- [ ] Integration with more infrastructure providers
- [ ] Real-time collaboration features
- [ ] Component dependency visualization
- [ ] Automated testing of generated infrastructure

