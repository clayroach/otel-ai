# Trace View Implementation for OTel Data in **otel-ai**

## How Existing Tools Display Traces (Logs & Metrics Integration)

**Grafana Tempo (Grafana's Trace UI):** Grafana's trace explorer
presents a Gantt-style timeline of spans with a minimap for overview.
Each span is a horizontal bar positioned by start time and length
(duration), grouped by service and parent/child hierarchy. Clicking a
span reveals its details (attributes, metadata) including any **events**
-- OpenTelemetry "events" are essentially log records attached to that
span. Grafana shows these span events as timestamped entries under the
span (e.g. errors or checkpoints within that span's execution). To
incorporate full application logs, Grafana doesn't intermix them on the
timeline; instead it provides **"Trace to logs"** jump links. From a
span's details you can pivot to a logs view filtered to that trace or
span ID. In practice, Grafana Tempo and similar systems rely on
**trace--log correlation**: your logs must carry the trace ID, so the UI
can query all log entries for that trace and show them in a separate
logs panel or tab. Metrics are integrated via a similar approach --
Grafana uses Prometheus exemplars to link metric data points to trace
IDs. In the UI, a "Trace to metrics" action on a span will open a
related metrics dashboard or highlight metric series that include that
trace's exemplar. In summary, Grafana's implementation keeps the trace
timeline focused on spans and their internal events, while offering
**linked views** for external logs and metrics (rather than plotting
those directly in the timeline).

**Jaeger UI:** Jaeger (CNCF's distributed tracing tool) has a similar
span timeline view. It shows spans in a nested timeline and, when a span
is expanded, lists that span's tags/attributes and its **Span Logs**
(which correspond to OTel span events). Jaeger doesn't natively pull in
application logs beyond those span-embedded events, but you can achieve
log correlation by ensuring your logging includes trace IDs and then
using external log search. An important feature of Jaeger's UI is that
it's open source (Apache 2.0) and can be embedded or integrated into
other apps. In fact, Jaeger UI supports an **"embedded mode"** where the
UI chrome/navigation is stripped away for embedding in a custom
interface. For example, you can iframe or webview the Jaeger trace page
with a URL parameter (`uiEmbed=v0`) to show just the trace timeline and
details without the full Jaeger header menus. This indicates one
possible route: running a Jaeger query service in the background and
loading its UI in your Electron app for a ready-made trace viewer. The
styling of Jaeger's UI is its own (not Ant Design), but it could be
restyled with custom CSS if needed.

**Other OpenTelemetry UIs:** Newer open-source APM tools like SigNoz
(MIT-licensed) follow a similar pattern of separating concerns. In
SigNoz's interface, you view a trace's span timeline and then can click
**"Go to related logs"** to open a logs tab filtered by that trace's ID.
They also plan "go to related metrics" in the trace view. The key
takeaway is that virtually all implementations avoid cluttering the
timeline with raw log lines or metrics; instead they incorporate those
via correlation links or side-by-side panels. Your trace view can do the
same: show the structured span timeline with the span's own events
in-line, and provide a toggle or link to view any **separate OTel logs**
for that trace.

## Existing Trace Viewer Libraries (MIT/Apache2 Licensed)

-   **Jaeger UI (Apache-2.0):** Jaeger's web UI is Apache-licensed and
    built with React. It's a full-featured trace explorer (search,
    timeline, minimap, span detail modal, etc.). You could integrate
    Jaeger UI in two ways: **(a)** Run the Jaeger backend and embed the
    UI in your Electron app. **(b)** Fork or reuse portions of the
    Jaeger UI code (React) and adapt them. Downsides: styling mismatch
    with AntD, operational overhead of Jaeger backend.

-   **Eclipse Theia Trace Viewer -- `traceviewer-react-components`
    (MIT):** The Eclipse Trace Compass project provides a web trace
    viewer, and they have reusable React components. This includes a
    timeline view, support for nested spans, and events/logs. It's MIT
    licensed and ships with no CSS -- only CSS custom properties
    (`--trace-viewer-*`) so you can style it to match AntD. Caveat: it
    requires a Trace Server backend (Java) or implementing TSP yourself.

-   **Other libraries / Gantt components:** Generic React Gantt chart
    libraries exist (MIT licensed) but lack tracing features (nested
    spans, logs). Apache ECharts can be used to draw Gantt-like charts,
    but no built-in Gantt series type exists -- you'd construct it
    manually.

## Building a Custom Trace View on Apache ECharts

Implementing your own trace view inside your Electron/React app is
feasible: - **Timeline rendering:** Use ECharts with a time-based
x-axis. Each span is a horizontal bar. Represent nesting by indenting
labels or rows. Use custom series for flexibility. - **Span
interactions:** Clicking a bar opens an AntD Drawer or Modal with span
details and OTel events. Events can be visualized as markers on the
bar. - **OTel Logs:** Show related logs in a separate panel (AntD
Table), filtered by `trace_id` (and optionally `span_id`). - **Metrics
integration:** Link to external charts or embed small ECharts sparkline
for metrics around span timeframe. - **Styling and UX:** Use AntD
components for consistency. ECharts can be themed accordingly.

## Recommendation and Trade-offs

-   **Quick Win:** Use existing open-source UIs (Jaeger or Theia).
    Jaeger is heavy, styling mismatch. Theia is MIT, flexible, but needs
    Java backend.
-   **Long-Term:** Build custom ECharts + React viewer for tight
    integration, styling, and no extra backend.
-   **Hybrid:** Start with Theia viewer + Trace Server in Docker. Later,
    replace with custom ECharts viewer, while keeping TSP as a backend
    service for LLMs or external APIs.

------------------------------------------------------------------------

# Deployment Strategy (User's Idea)

## Phase 1: Theia Trace Viewer Sidecar

-   Run Trace Compass Trace Server (Docker) exposing `/tsp/api/*`.
-   Run Theia Trace Viewer (Docker) pointing at the TSP service
    (`TRACE_SERVER_URL`).
-   Electron app embeds the viewer in a BrowserView at port 4000.
-   Use TSP API to open traces and feed data.
-   Logs and metrics handled separately in the Electron UI.

## Phase 2: ECharts + React Viewer

-   Keep TSP service for heavy traces and as LLM data source.
-   Build custom React component with ECharts for spans, events, logs,
    metrics.
-   Match AntD styling seamlessly.
-   Optionally keep Theia viewer available for power users.

------------------------------------------------------------------------

# Licensing

-   **Jaeger UI:** Apache 2.0
-   **Theia Trace Viewer / traceviewer-react-components:** MIT
-   **ECharts:** Apache 2.0
