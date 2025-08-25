import React from 'react';
import { Layout as AntLayout, Menu, Button, Typography, Space, Dropdown } from 'antd';
import { 
  BugOutlined, 
  BarChartOutlined, 
  FileTextOutlined, 
  BulbOutlined,
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  MenuOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';

const { Header, Sider, Content } = AntLayout;
const { Title } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleDarkMode, sidebarCollapsed, toggleSidebar } = useAppStore();

  const menuItems = [
    {
      key: '/traces',
      icon: <BugOutlined />,
      label: 'Traces',
    },
    {
      key: '/metrics',
      icon: <BarChartOutlined />,
      label: 'Metrics',
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: 'Logs',
    },
    {
      key: '/insights',
      icon: <BulbOutlined />,
      label: 'AI Insights',
    },
    {
      key: '/llm-debug',
      icon: <RobotOutlined />,
      label: 'LLM Debug',
    },
  ];

  const settingsMenu = {
    items: [
      {
        key: 'theme',
        icon: darkMode ? <SunOutlined /> : <MoonOutlined />,
        label: darkMode ? 'Light Mode' : 'Dark Mode',
        onClick: toggleDarkMode,
      },
      {
        key: 'preferences',
        icon: <SettingOutlined />,
        label: 'Preferences',
        onClick: () => {
          // TODO: Open preferences modal
        },
      },
    ],
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

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
            background: darkMode ? '#001529' : '#fff',
          }}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{
              height: '100%',
              borderRight: 0,
            }}
          />
        </Sider>

        <AntLayout style={{ padding: '0' }}>
          <Content
            style={{
              background: darkMode ? '#141414' : '#f5f5f5',
              margin: 0,
              minHeight: 280,
              overflow: 'auto',
            }}
          >
            {children}
          </Content>
        </AntLayout>
      </AntLayout>
    </AntLayout>
  );
};