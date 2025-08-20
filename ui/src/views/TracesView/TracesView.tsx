import React, { useState, useCallback } from 'react';
import { Card, Row, Col, Button, Space, Typography, Spin, Dropdown, Tooltip } from 'antd';
import { 
  PlayCircleOutlined, 
  SaveOutlined, 
  FormatPainterOutlined, 
  ClearOutlined,
  CopyOutlined,
  HistoryOutlined,
  DownOutlined
} from '@ant-design/icons';
import { format } from 'sql-formatter';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MonacoQueryEditor } from '../../components/MonacoEditor/MonacoQueryEditor';
import { TraceResults } from '../../components/TraceResults/TraceResults';
import { TimeRangeSelector } from '../../components/TimeRangeSelector/TimeRangeSelector';
import { useAppStore } from '../../store/appStore';
import { useClickhouseQuery } from '../../hooks/useClickhouseQuery';

const { Title } = Typography;

const DEFAULT_QUERY = `-- Query traces from simplified single-path ingestion
SELECT 
  trace_id,
  service_name,
  operation_name,
  duration_ms,
  start_time as timestamp,
  status_code,
  is_error,
  span_kind,
  is_root
FROM otel.traces 
WHERE start_time >= subtractHours(now(), 3)
ORDER BY start_time DESC 
LIMIT 100`;

export const TracesView: React.FC = () => {
  const { 
    activeQuery, 
    setActiveQuery, 
    queryHistory, 
    addToQueryHistory 
  } = useAppStore();
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
    addToQueryHistory(query);
    try {
      await refetch();
    } finally {
      setIsRunning(false);
    }
  }, [query, setActiveQuery, addToQueryHistory, refetch]);

  const handleFormatQuery = useCallback(() => {
    try {
      // First fix common function name issues
      let fixedQuery = query
        .replace(/subtracthours/gi, 'subtractHours') // Fix case-sensitive function
        .replace(/substracthours/gi, 'subtractHours') // Fix common typo
        .replace(/now\(\s*\)/gi, 'now()'); // Fix spacing in now()
      
      const formatted = format(fixedQuery, {
        language: 'sql',
        tabWidth: 2,
        keywordCase: 'upper',
        functionCase: 'preserve', // Keep function names as-is
        identifierCase: 'preserve', // Keep identifiers as-is
        linesBetweenQueries: 2,
      });
      setQuery(formatted);
    } catch (error) {
      console.error('Error formatting SQL:', error);
    }
  }, [query]);

  const handleClearQuery = useCallback(() => {
    setQuery('');
  }, []);

  const handleCopyQuery = useCallback(() => {
    navigator.clipboard.writeText(query);
  }, [query]);

  const handleSaveQuery = useCallback(() => {
    // TODO: Implement query saving to file
    console.log('Save query');
  }, []);

  const handleHistorySelect = useCallback((historyItem: { query: string; timestamp: string; description: string }) => {
    setQuery(historyItem.query);
    setActiveQuery(historyItem.query);
    // Auto-run the historical query
    setTimeout(() => {
      handleRunQuery();
    }, 100);
  }, [setActiveQuery, handleRunQuery]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
  }, []);

  return (
    <div style={{ 
      padding: '24px', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '16px', flexShrink: 0 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Trace Analysis - Unified Processing
          </Title>
        </Col>
        <Col>
          <Space>
            <TimeRangeSelector />
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

      {/* Main Content - Resizable Panels */}
      <PanelGroup direction="horizontal" style={{ flex: 1 }}>
        {/* Query Editor Panel */}
        <Panel defaultSize={30} minSize={20} maxSize={60}>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Query Editor</span>
                <Space size="small">
                  {queryHistory.length > 0 && (
                    <Dropdown
                      menu={{
                        items: queryHistory.map((histItem, index) => ({
                          key: index,
                          label: (
                            <div style={{ maxWidth: '350px', padding: '4px 0' }}>
                              <div style={{ 
                                fontWeight: 'medium', 
                                marginBottom: '2px',
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {histItem.description}
                              </div>
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#888',
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {histItem.timestamp}
                              </div>
                            </div>
                          ),
                          onClick: () => handleHistorySelect(histItem),
                        })),
                      }}
                      trigger={['click']}
                    >
                      <Tooltip title="Query History">
                        <Button 
                          size="small" 
                          icon={<HistoryOutlined />}
                        >
                          History <DownOutlined />
                        </Button>
                      </Tooltip>
                    </Dropdown>
                  )}
                  <Tooltip title="Format & Fix SQL">
                    <Button
                      size="small"
                      icon={<FormatPainterOutlined />}
                      onClick={handleFormatQuery}
                    />
                  </Tooltip>
                  <Tooltip title="Copy Query">
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={handleCopyQuery}
                    />
                  </Tooltip>
                  <Tooltip title="Clear Query">
                    <Button
                      size="small"
                      icon={<ClearOutlined />}
                      onClick={handleClearQuery}
                    />
                  </Tooltip>
                  <Tooltip title="Save Query">
                    <Button
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={handleSaveQuery}
                    />
                  </Tooltip>
                </Space>
              </div>
            }
            style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              marginRight: '8px'
            }}
            styles={{ body: { flex: 1, padding: '4px', overflow: 'hidden' } }}
          >
            <MonacoQueryEditor
              value={query}
              onChange={handleQueryChange}
              onRunQuery={handleRunQuery}
              height="100%"
            />
          </Card>
        </Panel>

        {/* Resizable Handle */}
        <PanelResizeHandle 
          style={{
            width: '4px',
            backgroundColor: '#d9d9d9',
            cursor: 'col-resize',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '20px',
              height: '40px',
              backgroundColor: '#bfbfbf',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.7,
            }}
          >
            <div style={{
              width: '2px',
              height: '16px',
              backgroundColor: '#8c8c8c',
              marginRight: '2px'
            }} />
            <div style={{
              width: '2px',
              height: '16px',
              backgroundColor: '#8c8c8c'
            }} />
          </div>
        </PanelResizeHandle>

        {/* Results Panel */}
        <Panel defaultSize={70} minSize={40}>
          <Card 
            title="Query Results" 
            style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column',
              marginLeft: '8px'
            }}
            styles={{ body: { flex: 1, padding: '0', overflow: 'auto' } }}
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
        </Panel>
      </PanelGroup>
    </div>
  );
};