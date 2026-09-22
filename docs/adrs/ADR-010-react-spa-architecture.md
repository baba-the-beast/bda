# ADR-010: Modern React Single-Page Application with Server-Sent Events

## Status
Accepted

## Context
Analysts and evaluators need an interactive, modern user interface to explore multi-year batch aggregations, run Hive queries, observe data quality reports, and visualize real-time power streams. Heavy full-duplex WebSocket protocols add server connection state overhead for unidirectional telemetry broadcasts.

## Decision
1. Build the frontend as a React 18 + TypeScript + Vite Single-Page Application (`frontend/`):
   - Modular navigation with 9 dedicated views: Overview, Batch Analytics, Real-Time Streaming, Datasets & Quality, MapReduce Jobs, Hive Query Lab, Project Metrics, Administration, and Interactive Viva Demo.
   - Clean, professional styling using TailwindCSS and Lucide-React icons.
2. Real-Time Telemetry Consumption:
   - Connect to `/api/v1/stream/live` using native browser `EventSource` (Server-Sent Events).
   - Lightweight, unidirectional, auto-reconnecting HTTP streaming that traverses standard corporate proxies and firewalls without custom WebSocket handshakes.

## Consequences
- **Positive**: Blazing fast client rendering, zero compilation errors (`npm run build` verified), seamless real-time telemetry rendering without socket connection state management complexity.
- **Negative**: SSE is unidirectional (server to client); client-to-server commands (start/stop) are sent via standard REST POST endpoints.
