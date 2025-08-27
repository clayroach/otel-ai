/**
 * Utility function to clean protobuf service names from OpenTelemetry data
 * 
 * Handles both clean service names (mock data) and protobuf JSON objects (real data)
 * 
 * @param serviceName - Service name that may be a clean string or protobuf JSON object
 * @returns Clean service name string
 */
export const cleanServiceName = (serviceName: string): string => {
  // Handle already clean service names
  if (!serviceName || typeof serviceName !== 'string') {
    return serviceName || '';
  }

  // Check if it's a simple JSON object with stringValue (current format)
  if (serviceName.startsWith('{') && serviceName.includes('stringValue')) {
    try {
      const parsed = JSON.parse(serviceName);
      if (parsed.stringValue) {
        console.log('🧹 Cleaned simple protobuf service name:', parsed.stringValue);
        return parsed.stringValue;
      }
    } catch (e) {
      console.warn('Failed to parse simple protobuf service name:', e);
    }
  }

  // Check if it's a complex protobuf JSON object string (legacy format)
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
          console.log('🧹 Cleaned complex protobuf service name:', parsed.value.value);
          return parsed.value.value;
        }
      }
    } catch (e) {
      console.warn('Failed to parse complex protobuf service name:', e);
    }
  }

  // Return as-is if no protobuf formatting detected
  return serviceName;
};

export default cleanServiceName;