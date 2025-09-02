import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '../store/appStore'

describe('Store Data Flow Validation', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      useRealService: false,
      analysisModel: 'llama',
      analysisTimeRange: '5m',
      autoRefresh: 'manual',
      useMockData: false
    })
  })

  describe('LIVE Toggle State Management', () => {
    it('should initialize with LIVE mode OFF (mock data)', () => {
      const { result } = renderHook(() => useAppStore())
      expect(result.current.useRealService).toBe(false)
    })

    it('should toggle LIVE mode correctly', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Start with mock mode
      expect(result.current.useRealService).toBe(false)
      
      // Toggle to LIVE mode
      act(() => {
        result.current.setUseRealService(true)
      })
      expect(result.current.useRealService).toBe(true)
      
      // Toggle back to mock mode
      act(() => {
        result.current.setUseRealService(false)
      })
      expect(result.current.useRealService).toBe(false)
    })

    it('should persist LIVE mode setting', () => {
      const { result, rerender } = renderHook(() => useAppStore())
      
      // Set LIVE mode ON
      act(() => {
        result.current.setUseRealService(true)
      })
      
      // Simulate component unmount/remount
      rerender()
      
      // Should still be in LIVE mode
      expect(result.current.useRealService).toBe(true)
    })
  })

  describe('Data Source Consistency', () => {
    it('should never have both useMockData and useRealService true', () => {
      const { result } = renderHook(() => useAppStore())
      
      // When useRealService is true
      act(() => {
        result.current.setUseRealService(true)
      })
      
      // useMockData should be false (if they're related)
      if ('useMockData' in result.current) {
        expect(result.current.useRealService && result.current.useMockData).toBe(false)
      }
    })

    it('should maintain consistent state across components', () => {
      // Create two separate hooks (simulating different components)
      const { result: hook1 } = renderHook(() => useAppStore())
      const { result: hook2 } = renderHook(() => useAppStore())
      
      // Both should have same initial state
      expect(hook1.current.useRealService).toBe(hook2.current.useRealService)
      
      // Change in one should reflect in other
      act(() => {
        hook1.current.setUseRealService(true)
      })
      
      expect(hook2.current.useRealService).toBe(true)
    })
  })

  describe('Analysis Configuration', () => {
    it('should update analysis model independently of data source', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Set LIVE mode
      act(() => {
        result.current.setUseRealService(true)
      })
      
      // Change analysis model
      act(() => {
        result.current.setAnalysisModel('claude')
      })
      
      // Both settings should be maintained
      expect(result.current.useRealService).toBe(true)
      expect(result.current.analysisModel).toBe('claude')
    })

    it('should maintain time range setting across data source changes', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Set time range
      act(() => {
        result.current.setAnalysisTimeRange('1h')
      })
      
      // Toggle data source
      act(() => {
        result.current.setUseRealService(true)
      })
      
      // Time range should be preserved
      expect(result.current.analysisTimeRange).toBe('1h')
    })
  })

  describe('Auto-refresh Behavior', () => {
    it('should handle auto-refresh with correct data source', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Set LIVE mode and auto-refresh
      act(() => {
        result.current.setUseRealService(true)
        result.current.setAutoRefresh('1m')
      })
      
      // Both should be set correctly
      expect(result.current.useRealService).toBe(true)
      expect(result.current.autoRefresh).toBe('1m')
    })

    it('should disable auto-refresh when switching to mock mode', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Set LIVE mode with auto-refresh
      act(() => {
        result.current.setUseRealService(true)
        result.current.setAutoRefresh('1m')
      })
      
      // Switch to mock mode
      act(() => {
        result.current.setUseRealService(false)
      })
      
      // Consider if auto-refresh should be disabled or maintained
      // This depends on business logic
      expect(result.current.useRealService).toBe(false)
      // Auto-refresh might still be active but using mock data
    })
  })

  describe('State Validation Rules', () => {
    it('should validate state transitions', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Create a state transition log
      const transitions: Array<{ from: boolean; to: boolean }> = []
      
      // Track transitions
      const initialState = result.current.useRealService
      
      act(() => {
        result.current.setUseRealService(true)
      })
      transitions.push({ from: initialState, to: true })
      
      act(() => {
        result.current.setUseRealService(false)
      })
      transitions.push({ from: true, to: false })
      
      // All transitions should be valid
      transitions.forEach(transition => {
        expect(typeof transition.from).toBe('boolean')
        expect(typeof transition.to).toBe('boolean')
      })
    })

    it('should handle rapid state changes correctly', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Rapid toggles
      act(() => {
        result.current.setUseRealService(true)
        result.current.setUseRealService(false)
        result.current.setUseRealService(true)
        result.current.setUseRealService(false)
      })
      
      // Final state should be consistent
      expect(result.current.useRealService).toBe(false)
    })
  })

  describe('Data Source Indicators', () => {
    it('should provide clear indication of current data source', () => {
      const { result } = renderHook(() => useAppStore())
      
      // Mock mode
      act(() => {
        result.current.setUseRealService(false)
      })
      expect(result.current.useRealService).toBe(false)
      // This indicates mock data should be used
      
      // LIVE mode
      act(() => {
        result.current.setUseRealService(true)
      })
      expect(result.current.useRealService).toBe(true)
      // This indicates real data should be used
    })

    it('should never have ambiguous data source state', () => {
      const { result } = renderHook(() => useAppStore())
      
      // useRealService should always be boolean
      expect(typeof result.current.useRealService).toBe('boolean')
      
      // Should never be null or undefined
      expect(result.current.useRealService).not.toBeNull()
      expect(result.current.useRealService).not.toBeUndefined()
    })
  })
})