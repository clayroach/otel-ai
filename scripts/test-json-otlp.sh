#!/bin/bash

# Test JSON OTLP traces endpoint
# This script sends JSON-formatted OTLP trace data to test the JSON encoding path

echo "🧪 Testing JSON OTLP traces endpoint..."

# Generate a test trace in OTLP JSON format
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)
TIMESTAMP_NS=$(date +%s%N)

JSON_PAYLOAD=$(cat <<EOF
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "json-test-service"
            }
          },
          {
            "key": "service.version", 
            "value": {
              "stringValue": "1.0.0"
            }
          }
        ]
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "test-instrumentation",
            "version": "1.0.0"
          },
          "spans": [
            {
              "traceId": "$TRACE_ID",
              "spanId": "$SPAN_ID", 
              "name": "json-test-operation",
              "kind": 1,
              "startTimeUnixNano": "$TIMESTAMP_NS",
              "endTimeUnixNano": "$(($TIMESTAMP_NS + 50000000))",
              "attributes": [
                {
                  "key": "http.method",
                  "value": {
                    "stringValue": "GET"
                  }
                },
                {
                  "key": "http.status_code", 
                  "value": {
                    "intValue": 200
                  }
                }
              ],
              "status": {
                "code": 1,
                "message": "OK"
              }
            }
          ]
        }
      ]
    }
  ]
}
EOF
)

echo "📤 Sending JSON OTLP trace..."
echo "🔍 Trace ID: $TRACE_ID"
echo "🔍 Span ID: $SPAN_ID"

# Send JSON data to the OTLP endpoint
curl -X POST \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  http://localhost:4319/v1/traces

echo -e "\n✅ JSON trace sent!"

# Wait a moment for processing
sleep 2

echo "🔍 Checking if JSON trace was stored..."
curl -s "http://localhost:4319/api/traces?limit=5" | jq -r '.traces[] | select(.service_name == "json-test-service") | "Found JSON trace: \(.trace_id) - \(.service_name) - \(.operation_name)"'

echo "🎯 Check the UI at http://localhost:5173 to see JSON vs Protobuf statistics!"