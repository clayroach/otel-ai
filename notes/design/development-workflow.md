# Development Workflow Design

## Standalone Development (No Docker Required)

### Current State
- Development requires Docker for ClickHouse, MinIO, and OTel Collector
- Frontend and backend run separately
- Complex setup for new developers

### Target State  
- **`pnpm dev`** starts everything needed for development
- **No Docker required** for basic development workflow
- **Optional Docker** for full infrastructure testing

## Implementation Strategy

### Phase 1: Embedded Development Database
```typescript
// Use SQLite for development, ClickHouse for production
const storage = process.env.NODE_ENV === 'development' 
  ? new SQLiteStorage('./dev.db')
  : new ClickHouseStorage(config.clickhouse)
```

### Phase 2: Unified Development Server
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm build:frontend\" \"pnpm dev:backend\"",
    "dev:backend": "tsx --watch src/index.ts",
    "build:frontend": "cd ui && vite build --watch",
    "dev:full": "docker compose up -d && pnpm dev"
  }
}
```

### Phase 3: Mock Services for Development
- **Mock OTel Collector** that accepts OTLP data
- **In-memory trace storage** for quick iteration
- **Sample data generation** for UI development

## Monolithic Deployment Benefits

### Development
- **Single command start**: `pnpm dev`
- **Hot reload** for both frontend and backend
- **Shared types** between frontend and backend
- **No CORS issues** (same origin)

### Production
- **Single container** for deployment
- **Simplified scaling** (scale entire app together)
- **Better performance** (no network overhead for internal APIs)
- **Easier monitoring** (single service to monitor)

## File Structure After Monolithic Merge
```
src/
├── api/                    # Express API routes
│   ├── traces.ts
│   ├── metrics.ts
│   └── health.ts
├── frontend/              # React frontend (moved from ui/)
│   ├── components/
│   ├── views/
│   └── App.tsx
├── storage/               # Backend storage layer
├── ai-analyzer/           # AI analysis services
└── server.ts             # Main Express app (serves both API and frontend)
```

## Development Scripts

### Core Development
```bash
pnpm dev                   # Start full development environment
pnpm dev:backend          # Backend only with hot reload
pnpm dev:frontend         # Frontend build with watch mode
pnpm dev:full             # Full infrastructure with Docker
```

### Testing
```bash
pnpm test                 # Unit tests (no external dependencies)
pnpm test:integration     # Integration tests (requires Docker)
pnpm test:e2e            # End-to-end tests with full stack
```

### Production
```bash
pnpm build               # Build for production
pnpm start               # Start production server
pnpm docker:build        # Build Docker container
```

## Configuration Strategy

### Environment-Based Configuration
```typescript
export const config = {
  development: {
    storage: 'sqlite',
    collector: 'mock',
    frontend: 'watch-mode'
  },
  production: {
    storage: 'clickhouse',
    collector: 'otel',
    frontend: 'static-files'
  }
}
```

### Benefits
- **Fast development iteration** without infrastructure overhead
- **Full testing capability** when needed
- **Production-like environment** available on demand
- **Simple onboarding** for new developers