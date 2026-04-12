import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMonitorSummary, formatRelativeAge, getHealthLabel, getServiceActionSuggestion, getServiceRiskLabel, isServiceAbnormal, sortServicesBySeverity, type MonitorServiceItem } from './monitorServiceMeta'

test('getHealthLabel maps warning health to user-facing copy', () => {
  assert.deepEqual(getHealthLabel({ level: 'warning', summary: '接口异常' }), {
    text: '异常',
    className: 'text-amber-700 bg-amber-50'
  })
})

test('getServiceRiskLabel marks stopped core service as high risk', () => {
  const service: MonitorServiceItem = {
    id: 'clawos',
    name: 'clawos.service',
    status: 'stopped',
    isRunning: false,
    description: '主界面',
    kind: 'core',
    health: { level: 'down', summary: '不可用' }
  }

  assert.deepEqual(getServiceRiskLabel(service), {
    text: '高风险',
    className: 'text-red-700 bg-red-50'
  })
})

test('sortServicesBySeverity brings unhealthy services to the top', () => {
  const services: MonitorServiceItem[] = [
    {
      id: 'ok',
      name: 'ok.service',
      status: 'running',
      isRunning: true,
      description: 'ok',
      kind: 'core',
      health: { level: 'ok', summary: '正常' }
    },
    {
      id: 'warn',
      name: 'warn.service',
      status: 'running',
      isRunning: true,
      description: 'warn',
      kind: 'core',
      health: { level: 'warning', summary: '异常' }
    },
    {
      id: 'down',
      name: 'down.service',
      status: 'stopped',
      isRunning: false,
      description: 'down',
      kind: 'core',
      health: { level: 'down', summary: '不可用' }
    }
  ]

  assert.deepEqual(sortServicesBySeverity(services).map((service) => service.id), ['down', 'warn', 'ok'])
})

test('formatRelativeAge returns friendly recent text', () => {
  const timestamp = new Date(Date.now() - 5 * 60_000).toISOString()
  assert.equal(formatRelativeAge(timestamp), '5 分钟前')
})

test('isServiceAbnormal detects warning service', () => {
  const service: MonitorServiceItem = {
    id: 'aria2',
    name: 'aria2',
    status: 'running',
    isRunning: true,
    description: '下载引擎',
    kind: 'core',
    health: { level: 'warning', summary: '异常' }
  }

  assert.equal(isServiceAbnormal(service), true)
})

test('getServiceActionSuggestion returns service-specific guidance', () => {
  const service: MonitorServiceItem = {
    id: 'alist',
    name: 'alist',
    status: 'running',
    isRunning: true,
    description: '网盘后台',
    kind: 'core',
    health: { level: 'warning', summary: '异常' }
  }

  assert.match(getServiceActionSuggestion(service), /AList/)
})

test('buildMonitorSummary counts high-risk and warning services', () => {
  const services: MonitorServiceItem[] = [
    {
      id: 'down',
      name: 'down',
      status: 'stopped',
      isRunning: false,
      description: 'down',
      kind: 'core',
      health: { level: 'down', summary: '不可用' }
    },
    {
      id: 'warn',
      name: 'warn',
      status: 'running',
      isRunning: true,
      description: 'warn',
      kind: 'core',
      health: { level: 'warning', summary: '异常' }
    },
    {
      id: 'ok',
      name: 'ok',
      status: 'running',
      isRunning: true,
      description: 'ok',
      kind: 'core',
      health: { level: 'ok', summary: '正常' }
    }
  ]

  assert.deepEqual(buildMonitorSummary(services), {
    total: 3,
    highRisk: 1,
    warning: 1,
    healthy: 1
  })
})
