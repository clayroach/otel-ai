// Re-exports for easy importing of OpenTelemetry protobuf types
export * from './proto/collector/trace/v1/trace_service_pb.js';
export * from './proto/trace/v1/trace_pb.js';
export * from './proto/common/v1/common_pb.js';
export * from './proto/resource/v1/resource_pb.js';

// Export collector service types  
export * from './proto/collector/logs/v1/logs_service_pb.js';
export * from './proto/collector/metrics/v1/metrics_service_pb.js';

// Export data types
export * from './proto/logs/v1/logs_pb.js';
export * from './proto/metrics/v1/metrics_pb.js';