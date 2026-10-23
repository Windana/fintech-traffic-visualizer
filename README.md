# Fintech Traffic Visualizer — React + Three.js

## Run

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually http://localhost:5173).

## Model

- Fixed directed topology: App → WEB ALB → Gateway → {Auth, Savings, KYC, Onboarding}; Savings → DL → {CBS, CEFT}.
- A synthetic journey chooses one of five valid paths.
- Each hop becomes a moving particle (a Three.js instanced mesh).
- At each hop's arrival, the destination node's cumulative counter is updated.
- Errors/exceptions terminate a journey at a selected downstream node; all preceding hops succeed.
- "Inject CBS incident" makes 70% of CBS-bound journeys end with an error at CBS, independently of the baseline random rate.
- Donut sectors show percentages of node arrivals by outcome. Metrics are **not** end-to-end transaction success rates.
- The traffic rate slider controls **journeys per second**, not requests per second. One journey creates multiple hop particles.
- All data is synthetic. No telemetry, logs, banking data, or production systems are accessed.

## Next steps for real telemetry

Define `ServiceHopEvent` with `{traceId,spanId,parentSpanId,fromService,toService,startTime,endTime,outcome}`. Feed the visualizer from a NestJS WebSocket endpoint, aggregating traffic by edge and outcome in time windows. For high traffic, animate sampled/representative particles and keep accurate aggregate counts separately. Use OpenTelemetry spans for correlation and redact customer identifiers before processing.
