/**
 * Test cases for protobuf service name cleaning function
 * Validates both mock data (clean names) and real data (protobuf JSON objects)
 */

// Utility function to clean protobuf service names
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

// Test cases
describe('cleanServiceName', () => {
  describe('Mock Data (Clean Service Names)', () => {
    it('should return clean service names as-is', () => {
      const testCases = [
        'frontend-service',
        'api-gateway',
        'user-service',
        'payment-processor',
        'notification-hub',
        'data-warehouse'
      ];
      
      testCases.forEach(serviceName => {
        expect(cleanServiceName(serviceName)).toBe(serviceName);
      });
    });
    
    it('should handle service names with special characters', () => {
      const testCases = [
        'service_with_underscores',
        'service-with-dashes',
        'service.with.dots',
        'Service123',
        'my-awesome-service-v2'
      ];
      
      testCases.forEach(serviceName => {
        expect(cleanServiceName(serviceName)).toBe(serviceName);
      });
    });
  });

  describe('Real Data (Protobuf JSON Objects)', () => {
    it('should extract service name from escaped protobuf JSON', () => {
      // Real data from actual API response
      const protobufJson = '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"frontend-proxy"}}';
      const result = cleanServiceName(protobufJson);
      expect(result).toBe('frontend-proxy');
    });
    
    it('should extract service name from unescaped protobuf JSON', () => {
      // Direct protobuf JSON (if it comes through unescaped)
      const protobufJson = '{"$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"cart-service"}}';
      const result = cleanServiceName(protobufJson);
      expect(result).toBe('cart-service');
    });
    
    it('should handle multiple service names from real telemetry', () => {
      const realServiceNames = [
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"frontend-proxy"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"load-generator"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"cart"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"checkout"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"payment"}}'
      ];
      
      const expectedResults = [
        'frontend-proxy',
        'load-generator',
        'cart',
        'checkout',
        'payment'
      ];
      
      realServiceNames.forEach((protobufJson, index) => {
        const result = cleanServiceName(protobufJson);
        expect(result).toBe(expectedResults[index]);
      });
    });
    
    it('should handle complex service names with special characters', () => {
      const complexNames = [
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"api-gateway-v2"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"user_authentication_service"}}',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"data.processor.queue"}}'
      ];
      
      const expectedResults = [
        'api-gateway-v2',
        'user_authentication_service',
        'data.processor.queue'
      ];
      
      complexNames.forEach((protobufJson, index) => {
        const result = cleanServiceName(protobufJson);
        expect(result).toBe(expectedResults[index]);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"incomplete-service"';
      const result = cleanServiceName(malformedJson);
      expect(result).toBe(malformedJson); // Should return original if parsing fails
    });
    
    it('should handle non-OpenTelemetry JSON objects', () => {
      const randomJson = '{"someOtherType":"random","data":"not-a-service"}';
      const result = cleanServiceName(randomJson);
      expect(result).toBe(randomJson); // Should return original if not OTel protobuf
    });
    
    it('should handle empty and null values', () => {
      expect(cleanServiceName('')).toBe('');
      expect(cleanServiceName('null')).toBe('null');
      expect(cleanServiceName('undefined')).toBe('undefined');
    });
    
    it('should handle protobuf JSON with missing value', () => {
      const incompleteProtobuf = '{"$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue"}}';
      const result = cleanServiceName(incompleteProtobuf);
      expect(result).toBe(incompleteProtobuf); // Should return original if value is missing
    });
    
    it('should handle protobuf JSON with different value types', () => {
      const intValueProtobuf = '{"$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"intValue","value":123}}';
      const result = cleanServiceName(intValueProtobuf);
      expect(result).toBe(intValueProtobuf); // Should return original if not stringValue
    });
  });

  describe('Performance Test', () => {
    it('should clean multiple service names efficiently', () => {
      const mixedServiceNames = [
        'clean-service-1',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"protobuf-service-1"}}',
        'clean-service-2',
        '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"protobuf-service-2"}}',
        'another-clean-service'
      ];
      
      const expectedResults = [
        'clean-service-1',
        'protobuf-service-1',
        'clean-service-2',
        'protobuf-service-2',
        'another-clean-service'
      ];
      
      const startTime = performance.now();
      const results = mixedServiceNames.map(cleanServiceName);
      const endTime = performance.now();
      
      expect(results).toEqual(expectedResults);
      expect(endTime - startTime).toBeLessThan(10); // Should complete in less than 10ms
    });
  });

  describe('Real API Response Integration', () => {
    it('should handle complete AI analyzer response structure', () => {
      // Mock response structure based on real API
      const mockApiResponse = {
        architecture: {
          services: [
            {
              service: '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"frontend-proxy"}}',
              type: 'backend',
              dependencies: [
                {
                  service: '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"cart-service"}}',
                  callCount: 45
                }
              ]
            }
          ],
          criticalPaths: [
            {
              services: [
                '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"frontend-proxy"}}',
                '{"\\$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"payment-service"}}'
              ]
            }
          ]
        }
      };
      
      // Test main service cleaning
      const mainService = cleanServiceName(mockApiResponse.architecture.services[0].service);
      expect(mainService).toBe('frontend-proxy');
      
      // Test dependency service cleaning
      const depService = cleanServiceName(mockApiResponse.architecture.services[0].dependencies[0].service);
      expect(depService).toBe('cart-service');
      
      // Test critical path services cleaning
      const pathServices = mockApiResponse.architecture.criticalPaths[0].services.map(cleanServiceName);
      expect(pathServices).toEqual(['frontend-proxy', 'payment-service']);
    });
  });
});

// Export for use in React components
export default cleanServiceName;