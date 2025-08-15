#!/usr/bin/env node

/**
 * Continuous Test Data Generator for AI-Native Observability Platform
 * Generates realistic telemetry data for both collector and direct ingestion paths
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { trace, SpanStatusCode, SpanKind } = require('@opentelemetry/api');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const axios = require('axios');

// Configuration from environment variables
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || 'http://localhost:4318';
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const GENERATE_INTERVAL = process.env.GENERATE_INTERVAL || '30s';
const DIRECT_INGESTION_RATIO = 0.2; // 20% direct, 80% collector

console.log('🚀 Starting AI-Native Observability Test Data Generator');
console.log(`📡 OTLP Endpoint: ${OTLP_ENDPOINT}`);
console.log(`💾 ClickHouse URL: ${CLICKHOUSE_URL}`);
console.log(`⏱️  Generation Interval: ${GENERATE_INTERVAL}`);

// Service definitions for realistic data
const SERVICES = [
  { name: 'rect-ingestion-service', version: '1.2.0', type: 'ingestion' },
  { name: 'st-telemetry-generator', version: '2.1.1', type: 'generator' },
  { name: 'ai-analyzer-service', version: '0.9.3', type: 'ai' },
  { name: 'config-manager-service', version: '1.0.0', type: 'config' },
  { name: 'llm-orchestrator', version: '0.8.2', type: 'llm' }
];

const OPERATIONS = {
  'ingestion': ['ingest-traces', 'validate-schema', 'parse-otlp', 'enrich-metadata'],
  'generator': ['generate-span', 'emit-metric', 'create-log-entry', 'batch-telemetry'],
  'ai': ['detect-anomaly', 'train-model', 'predict-pattern', 'analyze-performance'],
  'config': ['validate-config', 'apply-settings', 'reload-rules', 'sync-state'],
  'llm': ['route-request', 'generate-dashboard', 'optimize-query', 'personalize-ui']
};

// Initialize OpenTelemetry SDK for collector path
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'test-data-generator',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  })
);

const sdk = new NodeSDK({
  resource: resource,
  traceExporter: new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`,
  }),
  instrumentations: [new HttpInstrumentation()],
});

// Start the SDK
sdk.start();
console.log('✅ OpenTelemetry SDK initialized for collector path');

// Get tracer
const tracer = trace.getTracer('test-data-generator', '1.0.0');

// Generate random trace data
function generateTraceId() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateSpanId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomDuration() {
  // Generate realistic durations: mostly fast (10-500ms), some slow (1-10s), few very slow (10-30s)
  const rand = Math.random();
  if (rand < 0.7) return Math.floor(Math.random() * 490) + 10; // 10-500ms
  if (rand < 0.95) return Math.floor(Math.random() * 9000) + 1000; // 1-10s
  return Math.floor(Math.random() * 20000) + 10000; // 10-30s
}

// Generate test trace via collector path (OpenTelemetry SDK)
async function generateCollectorTrace() {
  const service = getRandomElement(SERVICES);
  const operation = getRandomElement(OPERATIONS[service.type]);
  const isError = Math.random() < 0.1; // 10% error rate
  
  return new Promise((resolve) => {
    const span = tracer.startSpan(`${operation}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'service.name': service.name,
        'service.version': service.version,
        'service.type': service.type,
        'operation.name': operation,
        'test.data.source': 'collector',
        'test.data.generator': 'otel-ai-test-generator',
        'http.method': getRandomElement(['GET', 'POST', 'PUT', 'DELETE']),
        'http.status_code': isError ? getRandomElement([400, 404, 500, 503]) : getRandomElement([200, 201, 204]),
        'user.id': `user-${Math.floor(Math.random() * 1000)}`,
        'session.id': generateSpanId(),
        'environment': 'development'
      }
    });

    // Simulate work duration
    const duration = generateRandomDuration();
    
    setTimeout(() => {
      if (isError) {
        span.recordException(new Error(`Simulated error in ${operation}`));
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Simulated test error' });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      
      // Add some events
      span.addEvent('operation.start', { 
        'component': service.type,
        'thread.id': Math.floor(Math.random() * 8) + 1
      });
      
      if (Math.random() < 0.3) { // 30% chance of additional event
        span.addEvent('cache.hit', {
          'cache.key': `cache-${Math.floor(Math.random() * 100)}`,
          'cache.type': getRandomElement(['redis', 'memory', 'disk'])
        });
      }
      
      span.addEvent('operation.complete', {
        'records.processed': Math.floor(Math.random() * 1000),
        'duration.ms': duration
      });
      
      span.end();
      resolve({
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        service: service.name,
        operation,
        duration,
        status: isError ? 'ERROR' : 'OK'
      });
    }, Math.min(duration, 1000)); // Cap actual delay at 1s for faster generation
  });
}

// Generate test trace via direct ingestion path
async function generateDirectTrace() {
  const service = getRandomElement(SERVICES);
  const operation = getRandomElement(OPERATIONS[service.type]);
  const isError = Math.random() < 0.08; // Slightly lower error rate for direct path
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const duration = generateRandomDuration();
  const timestamp = new Date().toISOString();
  
  // Custom schema optimized for AI analysis
  const traceData = {
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: '',
    service_name: service.name,
    operation_name: operation,
    start_time: new Date(Date.now() - duration).toISOString(),
    end_time: timestamp,
    duration_ms: duration,
    status_code: isError ? 2 : 1,
    status_message: isError ? 'Simulated direct ingestion error' : 'OK',
    span_kind: 'SERVER',
    attributes: {
      'service.version': service.version,
      'service.type': service.type,
      'ingestion.path': 'direct',
      'ingestion.schema': 'custom',
      'test.data.source': 'direct',
      'ai.optimization.enabled': 'true',
      'http.method': getRandomElement(['GET', 'POST', 'PUT', 'DELETE']),
      'http.status_code': isError ? getRandomElement([400, 404, 500, 503]) : getRandomElement([200, 201, 204]),
      'user.id': `user-${Math.floor(Math.random() * 1000)}`,
      'session.id': generateSpanId(),
      'environment': 'development',
      'ai.feature.enabled': Math.random() < 0.7 ? 'true' : 'false'
    },
    events: JSON.stringify([
      {
        name: 'operation.start',
        timestamp: new Date(Date.now() - duration).toISOString(),
        attributes: { 'component': service.type }
      },
      {
        name: 'operation.complete',
        timestamp: timestamp,
        attributes: { 
          'records.processed': Math.floor(Math.random() * 1000),
          'duration.ms': duration 
        }
      }
    ]),
    resource_attributes: {
      'service.name': service.name,
      'service.version': service.version,
      'deployment.environment': 'development'
    },
    schema_version: 'ai-optimized-v1.0'
  };
  
  try {
    // Direct insertion to ClickHouse custom table
    const query = `
      INSERT INTO otel.traces (
        trace_id, span_id, parent_span_id, operation_name,
        start_time, end_time, duration,
        service_name, service_version,
        status_code, status_message, span_kind,
        attributes, resource_attributes
      ) VALUES (
        '${traceData.trace_id}',
        '${traceData.span_id}',
        '${traceData.parent_span_id}',
        '${traceData.operation_name}',
        parseDateTimeBestEffort('${traceData.start_time}'),
        parseDateTimeBestEffort('${traceData.end_time}'),
        ${traceData.duration_ms * 1000000},
        '${traceData.service_name}',
        '${service.version}',
        ${traceData.status_code},
        '${traceData.status_message}',
        '${traceData.span_kind}',
        ${JSON.stringify(traceData.attributes)},
        ${JSON.stringify(traceData.resource_attributes)}
      )
    `;
    
    await axios.post(`${CLICKHOUSE_URL}/?database=otel`, query, {
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': 'Basic ' + Buffer.from('otel:otel123').toString('base64')
      }
    });
    
    return {
      traceId: traceData.trace_id,
      spanId: traceData.span_id,
      service: service.name,
      operation,
      duration,
      status: isError ? 'ERROR' : 'OK',
      path: 'direct'
    };
  } catch (error) {
    console.error('❌ Failed to insert direct trace:', error.message);
    throw error;
  }
}

// Parse interval string to milliseconds
function parseInterval(interval) {
  const match = interval.match(/^(\d+)([smh])$/);
  if (!match) return 30000; // Default 30 seconds
  
  const [, value, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000 };
  return parseInt(value) * multipliers[unit];
}

// Main generation loop
async function startDataGeneration() {
  const intervalMs = parseInterval(GENERATE_INTERVAL);
  console.log(`🔄 Starting data generation every ${intervalMs}ms`);
  
  let generationCount = 0;
  let collectorCount = 0;
  let directCount = 0;
  
  const generateBatch = async () => {
    try {
      const batchSize = Math.floor(Math.random() * 5) + 3; // 3-7 traces per batch
      const promises = [];
      
      for (let i = 0; i < batchSize; i++) {
        if (Math.random() < DIRECT_INGESTION_RATIO) {
          promises.push(generateDirectTrace().then(result => ({ ...result, path: 'direct' })));
          directCount++;
        } else {
          promises.push(generateCollectorTrace().then(result => ({ ...result, path: 'collector' })));
          collectorCount++;
        }
      }
      
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - successful;
      
      generationCount += successful;
      
      console.log(`📊 Batch ${Math.floor(generationCount / 5)}: ${successful} traces generated${failed > 0 ? ` (${failed} failed)` : ''}`);
      console.log(`📈 Total: ${generationCount} traces (${collectorCount} collector, ${directCount} direct)`);
      
      if (generationCount % 50 === 0) {
        console.log('🎯 Milestone: 50+ traces generated! Data should be visible in UI');
      }
      
    } catch (error) {
      console.error('❌ Batch generation failed:', error.message);
    }
  };
  
  // Generate initial batch immediately
  await generateBatch();
  
  // Continue generating at intervals
  setInterval(generateBatch, intervalMs);
}

// Wait for dependencies and start generation
async function waitForDependencies() {
  console.log('⏳ Waiting for ClickHouse to be ready...');
  
  let retries = 30;
  while (retries > 0) {
    try {
      await axios.get(`${CLICKHOUSE_URL}/ping`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('otel:otel123').toString('base64')
        },
        timeout: 5000
      });
      console.log('✅ ClickHouse is ready');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error('❌ ClickHouse not available after 30 retries');
        process.exit(1);
      }
      console.log(`🔄 ClickHouse not ready, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Start data generation
  await startDataGeneration();
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  sdk.shutdown().then(() => {
    console.log('✅ OpenTelemetry SDK shut down');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  sdk.shutdown().then(() => {
    console.log('✅ OpenTelemetry SDK shut down');
    process.exit(0);
  });
});

// Start the application
waitForDependencies().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});