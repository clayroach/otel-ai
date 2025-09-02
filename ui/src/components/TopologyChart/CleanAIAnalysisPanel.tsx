import React, { useState } from 'react';
import { Progress, Badge, List, Button, Space, Typography, Row, Col, Tag } from 'antd';
import { 
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  AlertOutlined,
  BulbOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

// Types
interface HealthMetric {
  name: 'Performance' | 'Security' | 'Reliability';
  value: number;
  description: string;
}

interface Issue {
  id: string;
  title: string;
  description: string;
  category: 'bottleneck' | 'anomaly' | 'optimization' | 'security' | 'reliability';
  severity: 'high' | 'critical' | 'warning' | 'medium' | 'low';
  confidence: number;
  affected: string[];
  recommendation?: string;
  timestamp: string;
}

type FilterType = 'all' | 'bottleneck' | 'anomaly' | 'optimization' | 'security' | 'reliability';

// Mock data for global view
const globalHealthMetrics: HealthMetric[] = [
  { name: 'Performance', value: 78, description: 'Performance' },
  { name: 'Security', value: 85, description: 'Security' },
  { name: 'Reliability', value: 92, description: 'Reliability' }
];

const globalIssues: Issue[] = [
  {
    id: '1',
    title: 'Database Connection Pool Exhaustion',
    description: 'PostgreSQL connection pool is frequently reaching capacity, causing request queueing',
    category: 'bottleneck',
    severity: 'high',
    confidence: 92,
    affected: ['user-service', 'order-service'],
    recommendation: 'Increase connection pool size or implement connection pooling optimization',
    timestamp: '3:30:50 AM'
  },
  {
    id: '2',
    title: 'Unusual Traffic Pattern Detected',
    description: 'Payment service showing 300% increase in error rates compared to baseline',
    category: 'anomaly',
    severity: 'critical',
    confidence: 89,
    affected: ['payment-service'],
    recommendation: 'Investigate payment gateway integration and implement circuit breaker',
    timestamp: '3:05:00 AM'
  },
  {
    id: '3',
    title: 'Caching Opportunity',
    description: 'User profile queries show high repetition rate, suitable for Redis caching',
    category: 'optimization',
    severity: 'warning',
    confidence: 95,
    affected: ['user-service'],
    recommendation: 'Implement Redis caching for user profile data with 15-minute TTL',
    timestamp: '3:00:00 AM'
  }
];

// Function to generate service-specific issues dynamically
const generateServiceIssues = (serviceName: string): Issue[] => {
  const serviceId = serviceName.toLowerCase().replace(/\s+/g, '-');
  
  // Generate different issues based on service name characteristics
  const issues: Issue[] = [];
  
  // Feature flag services (like flagd)
  if (serviceName.toLowerCase().includes('flag')) {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Feature Flag Evaluation Latency',
        description: 'Flag evaluation taking 45ms on average, exceeding 20ms SLA',
        category: 'bottleneck',
        severity: 'high',
        confidence: 92,
        affected: [serviceName],
        recommendation: 'Consider implementing local flag caching or reducing rule complexity',
        timestamp: '5 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'Flag Configuration Drift Detected',
        description: 'Production flags differ from staging configuration in 3 instances',
        category: 'anomaly',
        severity: 'warning',
        confidence: 88,
        affected: [serviceName],
        recommendation: 'Sync flag configurations across environments',
        timestamp: '12 min ago'
      }
    );
  }
  // Payment/checkout services
  else if (serviceName.toLowerCase().includes('payment') || serviceName.toLowerCase().includes('checkout')) {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Payment Gateway Timeout',
        description: 'Third-party payment provider responding slowly, 15% of requests timing out',
        category: 'reliability',
        severity: 'critical',
        confidence: 95,
        affected: [serviceName],
        recommendation: 'Implement circuit breaker and fallback payment provider',
        timestamp: '2 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'PCI Compliance Warning',
        description: 'Credit card data being logged in debug mode',
        category: 'security',
        severity: 'high',
        confidence: 99,
        affected: [serviceName],
        recommendation: 'Disable debug logging in production and audit log files',
        timestamp: '8 min ago'
      }
    );
  }
  // Cart services
  else if (serviceName.toLowerCase().includes('cart')) {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Cart Abandonment Rate High',
        description: 'Session timeout causing 30% cart abandonment rate',
        category: 'optimization',
        severity: 'medium',
        confidence: 85,
        affected: [serviceName],
        recommendation: 'Extend session timeout and implement cart persistence',
        timestamp: '20 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'Redis Memory Pressure',
        description: 'Cart cache using 85% of allocated Redis memory',
        category: 'bottleneck',
        severity: 'warning',
        confidence: 91,
        affected: [serviceName],
        recommendation: 'Implement cart data compression or increase Redis memory allocation',
        timestamp: '30 min ago'
      }
    );
  }
  // Frontend services
  else if (serviceName.toLowerCase().includes('frontend') || serviceName.toLowerCase().includes('ui')) {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Bundle Size Exceeding Threshold',
        description: 'JavaScript bundle size 2.3MB, causing slow initial page loads',
        category: 'optimization',
        severity: 'medium',
        confidence: 93,
        affected: [serviceName],
        recommendation: 'Enable code splitting and lazy loading for non-critical components',
        timestamp: '15 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'Cumulative Layout Shift',
        description: 'CLS score of 0.25, affecting user experience',
        category: 'bottleneck',
        severity: 'warning',
        confidence: 87,
        affected: [serviceName],
        recommendation: 'Reserve space for dynamic content and optimize font loading',
        timestamp: '25 min ago'
      }
    );
  }
  // Product/catalog services
  else if (serviceName.toLowerCase().includes('product') || serviceName.toLowerCase().includes('catalog')) {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Database Query N+1 Problem',
        description: 'Product listing generating 50+ queries per page load',
        category: 'bottleneck',
        severity: 'high',
        confidence: 96,
        affected: [serviceName],
        recommendation: 'Implement eager loading or GraphQL data loader pattern',
        timestamp: '7 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'Image CDN Cache Miss',
        description: 'Product images serving from origin 40% of the time',
        category: 'optimization',
        severity: 'medium',
        confidence: 82,
        affected: [serviceName],
        recommendation: 'Review CDN cache headers and implement image optimization',
        timestamp: '18 min ago'
      }
    );
  }
  // Default/generic service issues
  else {
    issues.push(
      {
        id: `${serviceId}-1`,
        title: 'Elevated Response Times',
        description: `${serviceName} showing 25% increase in P95 latency over baseline`,
        category: 'bottleneck',
        severity: 'warning',
        confidence: 85,
        affected: [serviceName],
        recommendation: 'Profile service performance and identify bottlenecks',
        timestamp: '10 min ago'
      },
      {
        id: `${serviceId}-2`,
        title: 'Connection Pool Configuration',
        description: `Database connections not being released properly in ${serviceName}`,
        category: 'optimization',
        severity: 'medium',
        confidence: 78,
        affected: [serviceName],
        recommendation: 'Review connection pool settings and implement proper cleanup',
        timestamp: '22 min ago'
      }
    );
  }
  
  return issues;
};

// Function to generate service-specific metrics
const generateServiceMetrics = (serviceName: string): HealthMetric[] => {
  // Generate pseudo-random but consistent metrics based on service name
  const hash = serviceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const performance = 60 + (hash % 35); // 60-94
  const security = 70 + (hash % 25); // 70-94
  const reliability = 65 + ((hash * 2) % 30); // 65-94
  
  return [
    { name: 'Performance', value: performance, description: 'Performance' },
    { name: 'Security', value: security, description: 'Security' },
    { name: 'Reliability', value: reliability, description: 'Reliability' }
  ];
};

interface CleanAIAnalysisPanelProps {
  tabType?: 'global' | 'service';
  serviceName?: string;
  serviceId?: string;
}

export const CleanAIAnalysisPanel: React.FC<CleanAIAnalysisPanelProps> = ({ 
  tabType = 'global', 
  serviceName,
  serviceId 
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // Get the appropriate data based on tab type
  const healthMetrics = tabType === 'service' && serviceName 
    ? generateServiceMetrics(serviceName)
    : globalHealthMetrics;
  const mockIssues = tabType === 'service' && serviceName 
    ? generateServiceIssues(serviceName)
    : globalIssues;

  // Filter issues based on selected filter
  const filteredIssues = mockIssues.filter(issue => {
    if (activeFilter === 'all') return true;
    return issue.category === activeFilter;
  });

  // Get color for health metric
  const getHealthColor = (value: number): string => {
    if (value >= 85) return '#52c41a'; // green
    if (value >= 70) return '#1890ff'; // blue
    return '#ff4d4f'; // red
  };

  // Get severity color and label
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { color: '#fff', backgroundColor: '#ff4d4f', label: 'CRITICAL' };
      case 'high':
        return { color: '#fff', backgroundColor: '#ff7a45', label: 'HIGH' };
      case 'warning':
        return { color: '#fff', backgroundColor: '#faad14', label: 'WARNING' };
      case 'medium':
        return { color: '#fff', backgroundColor: '#1890ff', label: 'MEDIUM' };
      case 'low':
        return { color: '#666', backgroundColor: '#f0f0f0', label: 'LOW' };
      default:
        return { color: '#666', backgroundColor: '#f0f0f0', label: 'INFO' };
    }
  };

  // Get category icon
  const getCategoryIcon = (category: string, severity: string) => {
    const isHighSeverity = severity === 'critical' || severity === 'high';
    
    switch (category) {
      case 'bottleneck':
        return <AlertOutlined style={{ color: isHighSeverity ? '#ff7a45' : '#faad14', fontSize: '16px' }} />;
      case 'anomaly':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '16px' }} />;
      case 'optimization':
        return <BulbOutlined style={{ color: '#faad14', fontSize: '16px' }} />;
      case 'security':
        return <WarningOutlined style={{ color: '#ff7a45', fontSize: '16px' }} />;
      case 'reliability':
        return <InfoCircleOutlined style={{ color: '#722ed1', fontSize: '16px' }} />;
      default:
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />;
    }
  };

  // Count issues by category
  const issueCounts = {
    all: mockIssues.length,
    bottleneck: mockIssues.filter(i => i.category === 'bottleneck').length,
    anomaly: mockIssues.filter(i => i.category === 'anomaly').length,
    optimization: mockIssues.filter(i => i.category === 'optimization').length,
    security: mockIssues.filter(i => i.category === 'security').length,
    reliability: mockIssues.filter(i => i.category === 'reliability').length
  };

  // Count critical issues and optimizations
  const criticalCount = mockIssues.filter(i => i.severity === 'critical' || i.severity === 'high').length;
  const optimizationCount = mockIssues.filter(i => i.category === 'optimization').length;
  
  // Get service-specific or global summary
  const getSummaryText = () => {
    if (tabType === 'service' && serviceName) {
      return {
        health: `${serviceName} operational`,
        issues: `${criticalCount} critical issues`,
        optimizations: `${optimizationCount} optimizations`
      };
    }
    return {
      health: '10/12 services healthy',
      issues: `${criticalCount} critical issues`,
      optimizations: `${optimizationCount} optimizations`
    };
  };

  return (
    <div style={{ 
      height: '100%',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Content - No header needed */}
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
      }}>
        {/* System Health Scores Section - No title */}
        <div style={{ marginBottom: '20px' }}>
          <Row gutter={[8, 8]}>
            {healthMetrics.map((metric) => (
              <Col span={8} key={metric.name}>
                <div style={{ 
                  textAlign: 'center'
                }}>
                  <Progress
                    type="circle"
                    percent={metric.value}
                    size={60}
                    strokeColor={getHealthColor(metric.value)}
                    strokeWidth={6}
                    format={(percent) => (
                      <span style={{ 
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#1f2937'
                      }}>
                        {percent}%
                      </span>
                    )}
                  />
                  <div style={{ 
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#6b7280',
                    fontWeight: 500
                  }}>
                    {metric.description}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
          
          {/* Summary Stats - Inline */}
          <div style={{ 
            marginTop: '12px',
            fontSize: '11px',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: '4px',
            paddingRight: '4px'
          }}>
            <span>{getSummaryText().health}</span>
            <span>{getSummaryText().issues}</span>
            <span>{getSummaryText().optimizations}</span>
          </div>
        </div>

        {/* Issues Section */}
        <div>
          {/* Section Header with Filters */}
          <div style={{ marginBottom: '16px' }}>
            <Space size={4} wrap style={{ marginBottom: '12px' }}>
              <Button 
                size="small"
                type={activeFilter === 'all' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('all')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                All Issues ({issueCounts.all})
              </Button>
              <Button 
                size="small"
                type={activeFilter === 'bottleneck' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('bottleneck')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                Bottlenecks ({issueCounts.bottleneck})
              </Button>
              <Button 
                size="small"
                type={activeFilter === 'anomaly' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('anomaly')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                Anomalies ({issueCounts.anomaly})
              </Button>
              <Button 
                size="small"
                type={activeFilter === 'optimization' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('optimization')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                Optimizations ({issueCounts.optimization})
              </Button>
              <Button 
                size="small"
                type={activeFilter === 'security' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('security')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                Security ({issueCounts.security})
              </Button>
              <Button 
                size="small"
                type={activeFilter === 'reliability' ? 'primary' : 'default'}
                onClick={() => setActiveFilter('reliability')}
                style={{ 
                  fontSize: '11px',
                  height: '24px'
                }}
              >
                Reliability ({issueCounts.reliability})
              </Button>
            </Space>
          </div>

          {/* Issues List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredIssues.map((issue) => {
              const severityStyle = getSeverityStyle(issue.severity);
              
              return (
                <div 
                  key={issue.id}
                  style={{ 
                    padding: '12px',
                    backgroundColor: '#ffffff',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Header with icon and severity */}
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ marginTop: '2px' }}>
                      {getCategoryIcon(issue.category, issue.severity)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px'
                      }}>
                        <Text strong style={{ 
                          fontSize: '13px',
                          color: '#1f2937'
                        }}>
                          {issue.title}
                        </Text>
                        <Tag 
                          style={{ 
                            ...severityStyle,
                            fontSize: '10px',
                            padding: '0 6px',
                            borderRadius: '3px',
                            border: 'none',
                            marginLeft: '8px'
                          }}
                        >
                          {severityStyle.label}
                        </Tag>
                      </div>
                      
                      <Text style={{ 
                        fontSize: '12px',
                        color: '#6b7280',
                        display: 'block',
                        marginBottom: '8px',
                        lineHeight: 1.4
                      }}>
                        {issue.description}
                      </Text>
                      
                      {/* Affected services */}
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <Text style={{ fontSize: '11px', color: '#6b7280' }}>Affected:</Text>
                        {issue.affected.map((service, idx) => (
                          <Tag 
                            key={idx}
                            style={{ 
                              fontSize: '10px',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              borderRadius: '3px',
                              padding: '0 6px',
                              margin: 0
                            }}
                          >
                            {service}
                          </Tag>
                        ))}
                      </div>
                      
                      {/* Recommendation */}
                      {issue.recommendation && (
                        <div style={{ 
                          marginBottom: '8px',
                          padding: '6px 8px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '4px',
                          borderLeft: '3px solid #1890ff'
                        }}>
                          <Text style={{ 
                            fontSize: '11px',
                            color: '#374151',
                            fontWeight: 500,
                            display: 'block',
                            marginBottom: '2px'
                          }}>
                            Recommendation:
                          </Text>
                          <Text style={{ 
                            fontSize: '11px',
                            color: '#6b7280',
                            display: 'block'
                          }}>
                            {issue.recommendation}
                          </Text>
                        </div>
                      )}
                      
                      {/* Footer with confidence and timestamp */}
                      <div style={{ 
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '10px',
                        color: '#9ca3af'
                      }}>
                        <span>{issue.confidence}% confidence</span>
                        <span>{issue.timestamp}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CleanAIAnalysisPanel;