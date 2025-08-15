import React, { useState, useCallback } from 'react';
import { Card, Row, Col, Button, Space, Typography, Spin } from 'antd';
import { PlayCircleOutlined, SaveOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { MonacoQueryEditor } from '../../components/MonacoEditor/MonacoQueryEditor';
import { TraceResults } from '../../components/TraceResults/TraceResults';
import { TimeRangeSelector } from '../../components/TimeRangeSelector/TimeRangeSelector';
import { useAppStore } from '../../store/appStore';
import { useClickhouseQuery } from '../../hooks/useClickhouseQuery';

const { Title } = Typography;

const DEFAULT_QUERY = `-- Query unified traces across both ingestion paths
SELECT 
  trace_id,
  service_name,
  operation_name,
  duration_ms,
  timestamp,
  status_code,
  ingestion_path,
  schema_version,
  is_error,
  attribute_count
FROM otel.ai_traces_unified 
WHERE timestamp >= subtractHours(now(), 1)
ORDER BY timestamp DESC 
LIMIT 100`;

export const TracesView: React.FC = () => {
  const { activeQuery, setActiveQuery, timeRange } = useAppStore();
  const [query, setQuery] = useState(activeQuery || DEFAULT_QUERY);
  const [isRunning, setIsRunning] = useState(false);

  const {
    data: queryResults,
    isLoading,
    error,
    refetch
  } = useClickhouseQuery(query, {
    enabled: false, // Don't auto-run, only on explicit execution
  });

  const handleRunQuery = useCallback(async () => {
    setIsRunning(true);
    setActiveQuery(query);
    try {
      await refetch();
    } finally {
      setIsRunning(false);
    }
  }, [query, setActiveQuery, refetch]);

  const handleFormatQuery = useCallback(() => {
    // TODO: Implement SQL formatting
    console.log('Format query');
  }, []);

  const handleSaveQuery = useCallback(() => {
    // TODO: Implement query saving
    console.log('Save query');
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '16px' }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Trace Analysis - Unified Processing
          </Title>
        </Col>
        <Col>
          <Space>
            <TimeRangeSelector />
            <Button
              icon={<FormatPainterOutlined />}
              onClick={handleFormatQuery}
            >
              Format
            </Button>
            <Button
              icon={<SaveOutlined />}
              onClick={handleSaveQuery}
            >
              Save
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRunQuery}
              loading={isRunning || isLoading}
            >
              Run Query
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Main Content */}
      <Row gutter={[16, 16]} style={{ flex: 1, height: 0 }}>
        {/* Query Editor */}
        <Col span={24} lg={12}>
          <Card 
            title="Query Editor" 
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, padding: '8px' } }}
          >
            <MonacoQueryEditor
              value={query}
              onChange={handleQueryChange}
              onRunQuery={handleRunQuery}
              height="100%"
            />
          </Card>
        </Col>

        {/* Results */}
        <Col span={24} lg={12}>
          <Card 
            title="Query Results" 
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            styles={{ body: { flex: 1, padding: '0' } }}
            extra={
              queryResults && (
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {queryResults.rows} rows
                </span>
              )
            }
          >
            {isLoading || isRunning ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100%' 
              }}>
                <Spin size="large" />
              </div>
            ) : error ? (
              <div style={{ 
                padding: '24px', 
                textAlign: 'center', 
                color: '#ff4d4f' 
              }}>
                Query Error: {error.message}
              </div>
            ) : queryResults ? (
              <TraceResults data={queryResults} />
            ) : (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100%',
                color: '#666'
              }}>
                Run a query to see results
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};