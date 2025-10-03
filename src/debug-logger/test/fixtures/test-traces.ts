/**
 * Test fixtures for trace formatter tests
 */

import type { SpanData } from '../../src/types.js'

/**
 * Simple flat trace with 3 spans (no hierarchy)
 */
export const flatTrace: SpanData[] = [
  {
    traceId: 'trace-flat-001',
    spanId: 'span-001',
    serviceName: 'frontend',
    operationName: 'render',
    startTimeUnixNano: '1000000000000000',
    endTimeUnixNano: '1000000050000000',
    durationNs: 50000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-flat-001',
    spanId: 'span-002',
    serviceName: 'backend',
    operationName: 'process',
    startTimeUnixNano: '1000000100000000',
    endTimeUnixNano: '1000000200000000',
    durationNs: 100000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-flat-001',
    spanId: 'span-003',
    serviceName: 'database',
    operationName: 'query',
    startTimeUnixNano: '1000000300000000',
    endTimeUnixNano: '1000000450000000',
    durationNs: 150000000,
    statusCode: 'STATUS_CODE_OK'
  }
]

/**
 * Hierarchical trace with parent-child relationships
 */
export const hierarchicalTrace: SpanData[] = [
  {
    traceId: 'trace-hier-001',
    spanId: 'root-span',
    serviceName: 'frontend',
    operationName: 'handleRequest',
    startTimeUnixNano: '2000000000000000',
    endTimeUnixNano: '2000000450000000',
    durationNs: 450000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-hier-001',
    spanId: 'api-span',
    parentSpanId: 'root-span',
    serviceName: 'frontend',
    operationName: 'fetchData',
    startTimeUnixNano: '2000000010000000',
    endTimeUnixNano: '2000000300000000',
    durationNs: 290000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-hier-001',
    spanId: 'db-span',
    parentSpanId: 'api-span',
    serviceName: 'database',
    operationName: 'query',
    startTimeUnixNano: '2000000050000000',
    endTimeUnixNano: '2000000280000000',
    durationNs: 230000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-hier-001',
    spanId: 'template-span',
    parentSpanId: 'root-span',
    serviceName: 'frontend',
    operationName: 'compileTemplate',
    startTimeUnixNano: '2000000310000000',
    endTimeUnixNano: '2000000440000000',
    durationNs: 130000000,
    statusCode: 'STATUS_CODE_OK'
  }
]

/**
 * Deep nested trace (4 levels)
 */
export const deepTrace: SpanData[] = [
  {
    traceId: 'trace-deep-001',
    spanId: 'level-0',
    serviceName: 'api-gateway',
    operationName: 'handleRequest',
    startTimeUnixNano: '3000000000000000',
    endTimeUnixNano: '3000001000000000',
    durationNs: 1000000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-deep-001',
    spanId: 'level-1',
    parentSpanId: 'level-0',
    serviceName: 'backend-service',
    operationName: 'processRequest',
    startTimeUnixNano: '3000000100000000',
    endTimeUnixNano: '3000000900000000',
    durationNs: 800000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-deep-001',
    spanId: 'level-2',
    parentSpanId: 'level-1',
    serviceName: 'data-service',
    operationName: 'fetchData',
    startTimeUnixNano: '3000000200000000',
    endTimeUnixNano: '3000000800000000',
    durationNs: 600000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-deep-001',
    spanId: 'level-3',
    parentSpanId: 'level-2',
    serviceName: 'cache',
    operationName: 'lookup',
    startTimeUnixNano: '3000000300000000',
    endTimeUnixNano: '3000000400000000',
    durationNs: 100000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-deep-001',
    spanId: 'level-3-db',
    parentSpanId: 'level-2',
    serviceName: 'database',
    operationName: 'query',
    startTimeUnixNano: '3000000500000000',
    endTimeUnixNano: '3000000750000000',
    durationNs: 250000000,
    statusCode: 'STATUS_CODE_OK'
  }
]

/**
 * Trace with errors
 */
export const errorTrace: SpanData[] = [
  {
    traceId: 'trace-error-001',
    spanId: 'span-ok',
    serviceName: 'frontend',
    operationName: 'render',
    startTimeUnixNano: '4000000000000000',
    endTimeUnixNano: '4000000100000000',
    durationNs: 100000000,
    statusCode: 'STATUS_CODE_OK'
  },
  {
    traceId: 'trace-error-001',
    spanId: 'span-error',
    parentSpanId: 'span-ok',
    serviceName: 'backend',
    operationName: 'failedOperation',
    startTimeUnixNano: '4000000050000000',
    endTimeUnixNano: '4000000090000000',
    durationNs: 40000000,
    statusCode: 'STATUS_CODE_ERROR',
    attributes: {
      'error.type': 'TimeoutError',
      'error.message': 'Connection timeout',
      'http.status_code': 504
    }
  }
]

/**
 * Trace with span attributes
 */
export const traceWithAttributes: SpanData[] = [
  {
    traceId: 'trace-attr-001',
    spanId: 'span-with-attrs',
    serviceName: 'api',
    operationName: 'http.request',
    startTimeUnixNano: '5000000000000000',
    endTimeUnixNano: '5000000200000000',
    durationNs: 200000000,
    statusCode: 'STATUS_CODE_OK',
    attributes: {
      'http.method': 'GET',
      'http.url': '/api/users',
      'http.status_code': 200,
      'http.user_agent': 'Mozilla/5.0',
      'http.client_ip': '192.168.1.1',
      'custom.user_id': 'user-12345',
      'custom.request_id': 'req-abc-123'
    }
  }
]

/**
 * Zero-duration span (instantaneous event)
 */
export const zeroDurationTrace: SpanData[] = [
  {
    traceId: 'trace-zero-001',
    spanId: 'instant-span',
    serviceName: 'metrics',
    operationName: 'recordEvent',
    startTimeUnixNano: '6000000000000000',
    endTimeUnixNano: '6000000000000000',
    durationNs: 0,
    statusCode: 'STATUS_CODE_OK'
  }
]

/**
 * Complex OTel demo trace - Get recommendations flow
 * Demonstrates realistic microservices interaction with fan-out pattern
 */
export const otelDemoGetRecommendations: SpanData[] = [
  // Root: Load generator initiates get recommendations
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'eabdc0da',
    serviceName: 'load-generator',
    operationName: 'user_get_recommendations',
    startTimeUnixNano: '8000000000000000',
    endTimeUnixNano: '8000001200000000',
    durationNs: 1200000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Load generator GET request
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'c06f31dc',
    parentSpanId: 'eabdc0da',
    serviceName: 'load-generator',
    operationName: 'GET',
    startTimeUnixNano: '8000000010000000',
    endTimeUnixNano: '8000001190000000',
    durationNs: 1180000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend receives GET
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '359b819e',
    parentSpanId: 'c06f31dc',
    serviceName: 'frontend',
    operationName: 'GET',
    startTimeUnixNano: '8000000020000000',
    endTimeUnixNano: '8000001180000000',
    durationNs: 1160000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend handles recommendations route
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '7c9a4214',
    parentSpanId: '359b819e',
    serviceName: 'frontend',
    operationName: 'GET /api/recommendations?productIds=1YMWWN1N4O',
    startTimeUnixNano: '8000000025000000',
    endTimeUnixNano: '8000001170000000',
    durationNs: 1145000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Execute recommendations API route
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'a5213be3',
    parentSpanId: '7c9a4214',
    serviceName: 'frontend',
    operationName: 'executing api route (pages) /api/recommendations',
    startTimeUnixNano: '8000000030000000',
    endTimeUnixNano: '8000001160000000',
    durationNs: 1130000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls recommendation service
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '5e039f1e',
    parentSpanId: 'a5213be3',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.RecommendationService/ListRecommendations',
    startTimeUnixNano: '8000000040000000',
    endTimeUnixNano: '8000000600000000',
    durationNs: 560000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Recommendation service handles request
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '2cdcf60d',
    parentSpanId: '5e039f1e',
    serviceName: 'recommendation',
    operationName: '/oteldemo.RecommendationService/ListRecommendations',
    startTimeUnixNano: '8000000045000000',
    endTimeUnixNano: '8000000590000000',
    durationNs: 545000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Recommendation service gets product list
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '5239e945',
    parentSpanId: '2cdcf60d',
    serviceName: 'recommendation',
    operationName: 'get_product_list',
    startTimeUnixNano: '8000000050000000',
    endTimeUnixNano: '8000000580000000',
    durationNs: 530000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Recommendation service calls product catalog
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '566ea253',
    parentSpanId: '5239e945',
    serviceName: 'recommendation',
    operationName: '/oteldemo.ProductCatalogService/ListProducts',
    startTimeUnixNano: '8000000060000000',
    endTimeUnixNano: '8000000570000000',
    durationNs: 510000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog handles list request
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'aeff9162',
    parentSpanId: '566ea253',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/ListProducts',
    startTimeUnixNano: '8000000065000000',
    endTimeUnixNano: '8000000560000000',
    durationNs: 495000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls product catalog (fan-out 1)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '20ee0692',
    parentSpanId: 'a5213be3',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000610000000',
    endTimeUnixNano: '8000000850000000',
    durationNs: 240000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls product catalog (fan-out 2)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'b57d07ae',
    parentSpanId: 'a5213be3',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000620000000',
    endTimeUnixNano: '8000000900000000',
    durationNs: 280000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls product catalog (fan-out 3)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'aded9974',
    parentSpanId: 'a5213be3',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000630000000',
    endTimeUnixNano: '8000001100000000',
    durationNs: 470000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls product catalog (fan-out 4)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: '318edcd3',
    parentSpanId: 'a5213be3',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000640000000',
    endTimeUnixNano: '8000001150000000',
    durationNs: 510000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog handles GetProduct (1)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'db39b773',
    parentSpanId: 'b57d07ae',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000625000000',
    endTimeUnixNano: '8000000890000000',
    durationNs: 265000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog handles GetProduct (2)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'e735eec4',
    parentSpanId: '318edcd3',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000645000000',
    endTimeUnixNano: '8000001140000000',
    durationNs: 495000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog handles GetProduct (3)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'd4b994dd',
    parentSpanId: '20ee0692',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000615000000',
    endTimeUnixNano: '8000000840000000',
    durationNs: 225000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog handles GetProduct (4)
  {
    traceId: 'trace-otel-recommendations-001',
    spanId: 'a4ca3e71',
    parentSpanId: 'aded9974',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '8000000635000000',
    endTimeUnixNano: '8000001090000000',
    durationNs: 455000000,
    statusCode: 'STATUS_CODE_OK'
  }
]

/**
 * Complex OTel demo trace - Add to cart flow
 * Demonstrates realistic microservices interaction with multiple levels
 */
export const otelDemoAddToCart: SpanData[] = [
  // Root: Load generator initiates add to cart
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'fe4dd48a',
    serviceName: 'load-generator',
    operationName: 'user_add_to_cart',
    startTimeUnixNano: '7000000000000000',
    endTimeUnixNano: '7000000850000000',
    durationNs: 850000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Load generator GET product details
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'bfde1e6a',
    parentSpanId: 'fe4dd48a',
    serviceName: 'load-generator',
    operationName: 'GET',
    startTimeUnixNano: '7000000010000000',
    endTimeUnixNano: '7000000350000000',
    durationNs: 340000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend receives GET
  {
    traceId: 'trace-otel-demo-001',
    spanId: '98d1a798',
    parentSpanId: 'bfde1e6a',
    serviceName: 'frontend',
    operationName: 'GET',
    startTimeUnixNano: '7000000020000000',
    endTimeUnixNano: '7000000340000000',
    durationNs: 320000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend handles product route
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'bb74b9d8',
    parentSpanId: '98d1a798',
    serviceName: 'frontend',
    operationName: 'GET /api/products/HQTGWGPNH4',
    startTimeUnixNano: '7000000025000000',
    endTimeUnixNano: '7000000330000000',
    durationNs: 305000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Execute Next.js API route
  {
    traceId: 'trace-otel-demo-001',
    spanId: '8dee2805',
    parentSpanId: 'bb74b9d8',
    serviceName: 'frontend',
    operationName: 'executing api route (pages) /api/products/[productId]',
    startTimeUnixNano: '7000000030000000',
    endTimeUnixNano: '7000000320000000',
    durationNs: 290000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls product catalog gRPC
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'a4038cd0',
    parentSpanId: '8dee2805',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '7000000040000000',
    endTimeUnixNano: '7000000310000000',
    durationNs: 270000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Product catalog service handles request
  {
    traceId: 'trace-otel-demo-001',
    spanId: '587ba98e',
    parentSpanId: 'a4038cd0',
    serviceName: 'product-catalog',
    operationName: 'oteldemo.ProductCatalogService/GetProduct',
    startTimeUnixNano: '7000000045000000',
    endTimeUnixNano: '7000000300000000',
    durationNs: 255000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Load generator POST to add item
  {
    traceId: 'trace-otel-demo-001',
    spanId: '5b329f5e',
    parentSpanId: 'fe4dd48a',
    serviceName: 'load-generator',
    operationName: 'POST',
    startTimeUnixNano: '7000000360000000',
    endTimeUnixNano: '7000000840000000',
    durationNs: 480000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend receives POST
  {
    traceId: 'trace-otel-demo-001',
    spanId: '1617a93a',
    parentSpanId: '5b329f5e',
    serviceName: 'frontend',
    operationName: 'POST',
    startTimeUnixNano: '7000000370000000',
    endTimeUnixNano: '7000000830000000',
    durationNs: 460000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend handles cart POST route
  {
    traceId: 'trace-otel-demo-001',
    spanId: '3ec2dc30',
    parentSpanId: '1617a93a',
    serviceName: 'frontend',
    operationName: 'POST /api/cart',
    startTimeUnixNano: '7000000375000000',
    endTimeUnixNano: '7000000820000000',
    durationNs: 445000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Execute cart API route
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'be38938d',
    parentSpanId: '3ec2dc30',
    serviceName: 'frontend',
    operationName: 'executing api route (pages) /api/cart',
    startTimeUnixNano: '7000000380000000',
    endTimeUnixNano: '7000000810000000',
    durationNs: 430000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls cart service AddItem
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'd7835025',
    parentSpanId: 'be38938d',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.CartService/AddItem',
    startTimeUnixNano: '7000000390000000',
    endTimeUnixNano: '7000000650000000',
    durationNs: 260000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Cart service handles AddItem
  {
    traceId: 'trace-otel-demo-001',
    spanId: '2d2e1143',
    parentSpanId: 'd7835025',
    serviceName: 'cart',
    operationName: 'POST /oteldemo.CartService/AddItem',
    startTimeUnixNano: '7000000395000000',
    endTimeUnixNano: '7000000640000000',
    durationNs: 245000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Redis HGET - check existing cart
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'e5cabe93',
    parentSpanId: '2d2e1143',
    serviceName: 'cart',
    operationName: 'HGET',
    startTimeUnixNano: '7000000400000000',
    endTimeUnixNano: '7000000450000000',
    durationNs: 50000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Redis HMSET - update cart
  {
    traceId: 'trace-otel-demo-001',
    spanId: '1a96683f',
    parentSpanId: '2d2e1143',
    serviceName: 'cart',
    operationName: 'HMSET',
    startTimeUnixNano: '7000000460000000',
    endTimeUnixNano: '7000000550000000',
    durationNs: 90000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Redis EXPIRE - set TTL
  {
    traceId: 'trace-otel-demo-001',
    spanId: '0f926c24',
    parentSpanId: '2d2e1143',
    serviceName: 'cart',
    operationName: 'EXPIRE',
    startTimeUnixNano: '7000000560000000',
    endTimeUnixNano: '7000000630000000',
    durationNs: 70000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Frontend calls cart service GetCart
  {
    traceId: 'trace-otel-demo-001',
    spanId: '00576e09',
    parentSpanId: 'be38938d',
    serviceName: 'frontend',
    operationName: 'grpc.oteldemo.CartService/GetCart',
    startTimeUnixNano: '7000000660000000',
    endTimeUnixNano: '7000000800000000',
    durationNs: 140000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Cart service handles GetCart
  {
    traceId: 'trace-otel-demo-001',
    spanId: 'a821f91f',
    parentSpanId: '00576e09',
    serviceName: 'cart',
    operationName: 'POST /oteldemo.CartService/GetCart',
    startTimeUnixNano: '7000000665000000',
    endTimeUnixNano: '7000000790000000',
    durationNs: 125000000,
    statusCode: 'STATUS_CODE_OK'
  },
  // Redis HGET - fetch updated cart
  {
    traceId: 'trace-otel-demo-001',
    spanId: '773829d1',
    parentSpanId: 'a821f91f',
    serviceName: 'cart',
    operationName: 'HGET',
    startTimeUnixNano: '7000000670000000',
    endTimeUnixNano: '7000000780000000',
    durationNs: 110000000,
    statusCode: 'STATUS_CODE_OK'
  }
]
