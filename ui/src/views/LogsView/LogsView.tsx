import React from 'react'
import { Card, Typography } from 'antd'

const { Title } = Typography

export const LogsView: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>Logs - Coming Soon</Title>
      <Card>
        <p>Log analysis and visualization will be implemented here.</p>
        <p>This will include log search, filtering, and correlation with traces.</p>
      </Card>
    </div>
  )
}
