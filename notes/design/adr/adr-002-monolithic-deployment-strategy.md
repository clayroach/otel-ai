# ADR-002: Monolithic Deployment Strategy

## Status
Proposed

## Context
Currently the project has separate frontend (React/Vite) and backend (Node.js/Express) services. While microservices have benefits, they add complexity for a single-developer AI-native project.

## Decision
Adopt a **monolithic deployment strategy** where frontend and backend run together as a single Node.js application.

## Rationale

### Benefits
- **Simplified Development**: No network requests between frontend/backend during development
- **Easier Deployment**: Single container, single process to manage
- **Better Performance**: No HTTP overhead for internal API calls
- **Unified Scaling**: Frontend and backend scale together automatically
- **Reduced Complexity**: One codebase, one deployment pipeline

### Technical Approach
- **Express.js serves both API and static files**
- **Vite builds frontend to `dist/` folder**
- **Express serves React app from static middleware**
- **API routes at `/api/*`, frontend routes handled by React Router**
- **WebSocket connections for real-time features**

### Development Workflow
- `pnpm dev` runs both frontend build and backend server
- Hot reload for both frontend and backend changes
- No Docker required for development
- Single TypeScript configuration for both frontend and backend

## Implementation Plan

### Phase 1: Consolidate Build Process
- Move frontend build into main project
- Configure Express to serve static files
- Update development scripts

### Phase 2: Unified API
- Move API routes into single Express app
- Remove CORS complexity (same origin)
- Implement WebSocket for real-time features

### Phase 3: Production Optimization
- Single Docker container for deployment
- Optimized build process for production
- Health checks and monitoring for unified app

## Consequences

### Positive
- Faster development iteration
- Simpler deployment and operations
- Better performance for internal calls
- Easier debugging and testing

### Trade-offs
- Less flexibility for independent scaling (not needed for this project)
- Larger single container (acceptable for single-developer project)
- Frontend and backend coupled in deployment (intentional for simplicity)

## Implementation Todos (Day 18)

### UI Directory Consolidation (30 minutes maximum)

**Current State**: UI directory exists separately from main src structure
**Target State**: UI moved into src/ui following project patterns
**Time Box**: Exactly 30 minutes

**Tasks:**
- [ ] **Assess current UI directory structure and dependencies**
- [ ] **Create src/ui directory with proper subdirectories**  
- [ ] **Move UI source files to src/ui**
- [ ] **Update package.json workspace configuration**
- [ ] **Fix import paths and dependencies**
- [ ] **Validate UI builds and runs correctly**
- [ ] **Clean up old UI directory after validation**

**Success Criteria:**
- [ ] UI successfully moved to src/ui structure
- [ ] Development server starts without errors
- [ ] All UI functionality works as before
- [ ] Project follows monolithic deployment pattern

## Future Considerations
- Can split back to microservices if scaling needs require it
- This approach is optimal for AI-assisted single-developer projects
- Aligns with the 4-hour workday philosophy by reducing operational complexity