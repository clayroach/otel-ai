import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

export const MetricsView: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>Metrics - Coming Soon</Title>
      <Card>
        <p>Metrics visualization will be implemented here.</p>
        <p>This will include time-series charts and metric analysis from the unified processing layer.</p>
      </Card>
    </div>
  );
};