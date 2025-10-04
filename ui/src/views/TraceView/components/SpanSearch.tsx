import React, { useState, useEffect, useCallback } from 'react'
import { Input, Button, Space, Typography } from 'antd'
import { SearchOutlined, CloseCircleOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'

const { Text } = Typography

interface SpanSearchProps {
  query: string
  matchCount: number
  currentIndex: number
  onQueryChange: (query: string) => void
  onNavigatePrev: () => void
  onNavigateNext: () => void
  onClear: () => void
}

export const SpanSearch: React.FC<SpanSearchProps> = ({
  query,
  matchCount,
  currentIndex,
  onQueryChange,
  onNavigatePrev,
  onNavigateNext,
  onClear
}) => {
  const [localQuery, setLocalQuery] = useState(query)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      onQueryChange(localQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [localQuery, onQueryChange])

  // Sync with external query changes
  useEffect(() => {
    setLocalQuery(query)
  }, [query])

  const handleClear = useCallback(() => {
    setLocalQuery('')
    onClear()
  }, [onClear])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          onNavigatePrev()
        } else {
          onNavigateNext()
        }
      } else if (e.key === 'Escape') {
        handleClear()
      }
    },
    [onNavigatePrev, onNavigateNext, handleClear]
  )

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #e8e8e8',
        backgroundColor: '#fafafa'
      }}
    >
      <Space.Compact style={{ width: '100%' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          placeholder="Search spans (service, operation, ID, attributes...)"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          suffix={
            localQuery ? (
              <CloseCircleOutlined
                style={{ color: '#8c8c8c', cursor: 'pointer' }}
                onClick={handleClear}
              />
            ) : null
          }
          style={{ flex: 1 }}
          size="small"
        />

        {matchCount > 0 && (
          <>
            <Button
              size="small"
              icon={<UpOutlined />}
              onClick={onNavigatePrev}
              disabled={matchCount === 0}
              title="Previous match (Shift+Enter)"
            />
            <Button
              size="small"
              icon={<DownOutlined />}
              onClick={onNavigateNext}
              disabled={matchCount === 0}
              title="Next match (Enter)"
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                backgroundColor: '#fff',
                border: '1px solid #d9d9d9',
                borderLeft: 'none',
                fontSize: '12px',
                whiteSpace: 'nowrap'
              }}
            >
              <Text type="secondary">
                {currentIndex + 1} of {matchCount}
              </Text>
            </div>
          </>
        )}

        {query && matchCount === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderLeft: 'none',
              fontSize: '12px',
              whiteSpace: 'nowrap'
            }}
          >
            <Text type="secondary">No matches</Text>
          </div>
        )}
      </Space.Compact>
    </div>
  )
}
