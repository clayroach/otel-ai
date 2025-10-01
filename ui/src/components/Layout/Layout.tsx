import {
  ApartmentOutlined,
  BugOutlined,
  MenuOutlined,
  MoonOutlined,
  RobotOutlined,
  SettingOutlined,
  SunOutlined
} from '@ant-design/icons'
import { Layout as AntLayout, Button, Dropdown, Menu, Space, Typography } from 'antd'
import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { AnalyzeButton } from '../GlobalControls/AnalyzeButton'
import { AutoRefreshSelector } from '../GlobalControls/AutoRefreshSelector'
import { TimeRangeSelector } from '../GlobalControls/TimeRangeSelector'
import { ModelSelector, ModelSelectorSQL } from '../ModelSelector'

const { Header, Sider, Content } = AntLayout
const { Title } = Typography

interface LayoutProps {
  children: React.ReactNode
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { darkMode, toggleDarkMode, sidebarCollapsed, toggleSidebar } = useAppStore()

  const menuItems = [
    {
      key: '/servicetopology',
      icon: <ApartmentOutlined />,
      label: 'Service Topology',
      'data-testid': 'nav-servicetopology'
    },
    {
      key: '/traces',
      icon: <BugOutlined />,
      label: 'Traces',
      'data-testid': 'nav-traces'
    },
    {
      key: '/llm-debug',
      icon: <RobotOutlined />,
      label: 'LLM Debug',
      'data-testid': 'nav-llm-debug'
    }
  ]

  const settingsMenu = {
    items: [
      {
        key: 'theme',
        icon: darkMode ? <SunOutlined /> : <MoonOutlined />,
        label: darkMode ? 'Light Mode' : 'Dark Mode',
        onClick: toggleDarkMode
      },
      {
        key: 'preferences',
        icon: <SettingOutlined />,
        label: 'Preferences',
        onClick: () => {
          // TODO: Open preferences modal
        }
      }
    ]
  }

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Header
        style={{
          padding: '0 24px',
          background: darkMode ? '#001529' : '#fff',
          borderBottom: `1px solid ${darkMode ? '#303030' : '#f0f0f0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Space>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={toggleSidebar}
            style={{
              fontSize: '16px',
              color: darkMode ? '#fff' : '#000'
            }}
          />
          <Title
            level={4}
            style={{
              margin: 0,
              color: darkMode ? '#fff' : '#000'
            }}
          >
            OTel AI Observability
          </Title>
        </Space>

        <Space>
          <ModelSelector
            taskType="general"
            label="General"
            className={darkMode ? 'dark-mode' : ''}
          />
          <ModelSelectorSQL className={darkMode ? 'dark-mode' : ''} />
          <TimeRangeSelector darkMode={darkMode} />
          <AutoRefreshSelector darkMode={darkMode} />
          <AnalyzeButton darkMode={darkMode} />
          <Dropdown menu={settingsMenu} placement="bottomRight">
            <Button
              type="text"
              icon={<SettingOutlined />}
              style={{
                color: darkMode ? '#fff' : '#000'
              }}
            />
          </Dropdown>
        </Space>
      </Header>

      <AntLayout>
        <Sider
          collapsed={sidebarCollapsed}
          theme={darkMode ? 'dark' : 'light'}
          width={240}
          style={{
            background: darkMode ? '#001529' : '#fff'
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              height: '100%',
              borderRight: 0
            }}
          />
        </Sider>

        <AntLayout style={{ padding: '0' }}>
          <Content
            style={{
              background: darkMode ? '#141414' : '#f5f5f5',
              margin: 0,
              minHeight: 280,
              overflow: 'auto'
            }}
          >
            {children}
          </Content>
        </AntLayout>
      </AntLayout>
    </AntLayout>
  )
}
