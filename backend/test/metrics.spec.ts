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
    expect(result).toContain('dict_word_not_found_total 0')
  })

  it('считает ненайденные слова словаря одним числом, без самого слова', () => {
    const metrics = new MetricsService()
    const hit = (url: string, statusCode: number) => {
      const response = new EventEmitter() as EventEmitter & { statusCode: number; once: EventEmitter['once'] }
      response.statusCode = statusCode
      metrics.middleware({ method: 'GET', originalUrl: url, headers: {} } as never, response as never, () => undefined)
      response.emit('finish')
    }
    hit('/api/dict/word/%EC%97%86%EB%8A%94', 404)
    hit('/api/dict/word/%ED%95%99%EA%B5%90', 200)
    hit('/api/notes/1', 404)
    const result = metrics.render()
    expect(result).toContain('dict_word_not_found_total 1')
    expect(result).not.toContain('%EC%97%86')
  })
})
