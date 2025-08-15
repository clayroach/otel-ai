import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

export const InsightsView: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>AI Insights - Coming Soon</Title>
      <Card>
        <p>AI-powered insights and anomaly detection will be implemented here.</p>
        <p>This will include cross-path analysis, pattern recognition, and automated recommendations.</p>
      </Card>
    </div>
  );
};