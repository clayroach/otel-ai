/**
 * Utility function to clean protobuf service names from OpenTelemetry data
 * 
 * Handles both clean service names (mock data) and protobuf JSON objects (real data)
 * 
 * @param serviceName - Service name that may be a clean string or protobuf JSON object
 * @returns Clean service name string
 */
export const cleanServiceName = (serviceName: string): string => {
  // Check if it's a protobuf JSON object string
  if (serviceName.startsWith('{') && serviceName.includes('$typeName')) {
    try {
      // Handle potential double-escaping by attempting to parse directly first
      let parsed;
      try {
        parsed = JSON.parse(serviceName);
      } catch (firstError) {
        // If direct parsing fails, try unescaping first
        const unescaped = serviceName.replace(/\\(\$|")/g, '$1');
        parsed = JSON.parse(unescaped);
      }
      
      if (parsed.$typeName && parsed.$typeName.includes('opentelemetry.proto.common.v1.AnyValue')) {
        if (parsed.value?.case === 'stringValue' && parsed.value?.value) {
          console.log('🧹 Cleaned protobuf service name:', parsed.value.value);
          return parsed.value.value;
        }
      }
    } catch (e) {
      console.warn('Failed to parse protobuf service name:', e);
    }
  }
  return serviceName;
};

export default cleanServiceName;