# Feature 002 - Dynamic UI Generation: Frontend Component Guide (Day 29)

> **Related Design Document**: [Feature 002 - Dynamic UI Generation](../design/features/feature-002-dynamic-ui-generation.md)  
> **Current Phase**: Phase 5 - Frontend Components (Day 29 Implementation)  
> **Backend Status**: ✅ Complete (Phases 3-4 implemented on Day 28)

## Quick Reference for Frontend Integration

### 1. DynamicLineChart Component

```typescript
// ui/src/components/DynamicCharts/DynamicLineChart.tsx
import React from 'react';
import ReactECharts from 'echarts-for-react';
import { EChartsOption } from 'echarts';

interface DynamicLineChartProps {
  config: EChartsOption;
  height?: string;
  loading?: boolean;
  error?: string;
}

export const DynamicLineChart: React.FC<DynamicLineChartProps> = ({
  config,
  height = '400px',
  loading = false,
  error
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <ReactECharts 
      option={config}
      style={{ height, width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
};
```

### 2. API Integration Hook

```typescript
// ui/src/hooks/useUIGeneration.ts
import { useState, useCallback } from 'react';

interface UIGenerationResponse {
  component: {
    type: string;
    title: string;
    description?: string;
    component: string;
    props: any;
  };
  query: {
    sql: string;
    model: string;
  };
  results: {
    data: any[];
    rowCount: number;
  };
}

export const useUIGeneration = () => {
  const [data, setData] = useState<UIGenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateUI = useCallback(async (naturalLanguageQuery: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/ui-generator/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ naturalLanguageQuery }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    generateUI,
  };
};
```

### 3. Dynamic Component Renderer

```typescript
// ui/src/components/DynamicCharts/DynamicChartRenderer.tsx
import React from 'react';
import { DynamicLineChart } from './DynamicLineChart';
import { DynamicBarChart } from './DynamicBarChart';
import { DynamicDataTable } from './DynamicDataTable';

interface DynamicChartRendererProps {
  component: {
    component: string;
    props: any;
  };
  loading?: boolean;
  error?: string;
}

export const DynamicChartRenderer: React.FC<DynamicChartRendererProps> = ({
  component,
  loading,
  error
}) => {
  const renderComponent = () => {
    switch (component.component) {
      case 'DynamicLineChart':
        return <DynamicLineChart {...component.props} loading={loading} error={error} />;
      case 'DynamicBarChart':
        return <DynamicBarChart {...component.props} loading={loading} error={error} />;
      case 'DynamicDataTable':
        return <DynamicDataTable {...component.props} loading={loading} error={error} />;
      default:
        return (
          <div className="p-4 bg-gray-100 rounded">
            <p>Unknown component type: {component.component}</p>
          </div>
        );
    }
  };

  return (
    <div className="w-full">
      {renderComponent()}
    </div>
  );
};
```

### 4. Integration Example in TracesView

```typescript
// ui/src/views/TracesView/TracesView.tsx (addition)
import { useUIGeneration } from '../../hooks/useUIGeneration';
import { DynamicChartRenderer } from '../../components/DynamicCharts/DynamicChartRenderer';

// Inside TracesView component:
const { data, loading, error, generateUI } = useUIGeneration();

// Add UI generation trigger
const handleGenerateVisualization = async () => {
  try {
    await generateUI('Show service latency over the last 15 minutes');
  } catch (err) {
    console.error('Failed to generate visualization:', err);
  }
};

// Render generated component
{data?.component && (
  <DynamicChartRenderer 
    component={data.component}
    loading={loading}
    error={error}
  />
)}
```

### 5. Backend API Endpoint (Server Side)

```typescript
// src/server/routes/ui-generator.ts
import express from 'express';
import { UIGenerationPipeline } from '../../ui-generator/services/ui-generation-pipeline';

const router = express.Router();

router.post('/pipeline', async (req, res) => {
  try {
    const { naturalLanguageQuery } = req.body;
    
    const result = await UIGenerationPipeline.generateFromNaturalLanguage(
      naturalLanguageQuery,
      {
        context: {
          services: ['frontend', 'checkout', 'payment'], // Could be dynamic
          timeRange: '15 minutes'
        }
      }
    );
    
    res.json(result);
  } catch (error) {
    console.error('UI generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate UI component',
      message: error.message 
    });
  }
});

export default router;
```

## Quick Test Scenarios

### Test 1: Line Chart Generation
```javascript
// Natural language query
"Show latency percentiles for checkout service over the last hour"

// Expected: Line chart with p50, p95, p99 lines
```

### Test 2: Bar Chart Generation
```javascript
// Natural language query
"Compare error counts across all services"

// Expected: Bar chart with service names on X-axis, error counts on Y-axis
```

### Test 3: Table Fallback
```javascript
// Natural language query
"Show all trace IDs with errors"

// Expected: Data table with trace information
```

## Troubleshooting Guide

### Common Issues & Solutions

1. **ECharts not rendering**
   - Check if `echarts-for-react` is installed
   - Verify config object structure matches ECharts format
   - Check console for ECharts errors

2. **API endpoint 404**
   - Ensure backend server is running
   - Check API route registration
   - Verify proxy configuration in development

3. **Component not found**
   - Check component name matches backend specification
   - Ensure all components are exported properly
   - Verify DynamicChartRenderer switch statement

4. **Empty visualization**
   - Check if data is being passed correctly
   - Verify backend is returning proper config
   - Look for console errors

## Minimal Working Example

If time is running out, here's the absolute minimum to demonstrate the concept:

```typescript
// Hardcoded demo component
export const DemoLineChart = () => {
  const mockConfig = {
    title: { text: 'Service Latency Demo' },
    xAxis: { type: 'category', data: ['00:00', '00:01', '00:02'] },
    yAxis: { type: 'value' },
    series: [{
      data: [120, 132, 101],
      type: 'line'
    }]
  };
  
  return <ReactECharts option={mockConfig} />;
};
```

This proves the concept works even if full integration isn't complete.

---

**Remember**: Focus on getting ONE chart working end-to-end before adding complexity!