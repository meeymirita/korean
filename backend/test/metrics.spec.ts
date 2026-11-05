import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { MetricsService } from '../src/metrics.service'

describe('метрики HTTP-запросов', () => {
  it('считает запросы, ошибки и задержку, не добавляя путь или пользователя в метки', () => {
    const metrics = new MetricsService()
    const response = new EventEmitter() as EventEmitter & { statusCode: number; once: EventEmitter['once'] }
    response.statusCode = 503
    const next = () => undefined
    metrics.middleware({ method: 'GET', originalUrl: '/api/notes/личное', headers: { authorization: 'secret' } } as never, response as never, next)
    response.emit('finish')

    const result = metrics.render()
    expect(result).toContain('http_requests_total{method="GET",status="503"} 1')
    expect(result).toContain('http_request_duration_seconds_count{method="GET",status="503"} 1')
    expect(result).not.toContain('/api/notes')
    expect(result).not.toContain('secret')
  })
})
