import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import { frontendLog } from '../lib/logger'

interface Props {
  children: ReactNode
  /** 可选的 fallback UI，不传则显示默认错误提示 */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 全局错误边界 — 捕获 React 渲染错误，防止白屏
 * 同时将错误上报到前端日志系统
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    frontendLog.error('ErrorBoundary', `React render error: ${error.name}: ${error.message}`, {
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#1a1a2e',
          color: '#e0e0e0',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ff6b6b' }}>
            ClawOS - Application Error
          </h1>
          <p style={{ fontSize: '0.95rem', marginBottom: '0.5rem', opacity: 0.8 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <p style={{ fontSize: '0.85rem', marginBottom: '2rem', opacity: 0.5 }}>
            The error has been logged automatically.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.6rem 1.5rem',
              background: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
