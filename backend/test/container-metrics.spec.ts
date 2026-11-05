import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContainerMetrics, cpuPercent, memoryBytes } from '../src/container-metrics.service'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DOCKER_API_URL
})

describe('нагрузка по службам для Grafana', () => {
  it('считает процессор в процентах ядра и память без файлового кэша', () => {
    const stats = {
      cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 2000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
      memory_stats: { usage: 500_000_000, stats: { inactive_file: 100_000_000 } },
    }
    expect(cpuPercent(stats)).toBeCloseTo(80)
    expect(memoryBytes(stats)).toBe(400_000_000)
    expect(cpuPercent({})).toBe(0)
    expect(memoryBytes({})).toBe(0)
  })

  it('отдаёт метрики с понятными названиями служб и пустой ответ, если Docker недоступен', async () => {
    process.env.DOCKER_API_URL = 'http://docker-proxy:2375'
    const stats = { cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 2 }, precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 500 }, memory_stats: { usage: 1000 } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('/stats')
      ? new Response(JSON.stringify(stats))
      : new Response(JSON.stringify([{ Id: 'abc', State: 'running', Labels: { 'com.docker.compose.service': 'backend' } }]))))
    const metrics = new ContainerMetrics()
    await metrics.poll()
    expect(metrics.render()).toContain('service_cpu_percent{service="backend",title="Сервер сайта (API)"} 40.000')
    expect(metrics.render()).toContain('service_memory_bytes{service="backend",title="Сервер сайта (API)"} 1000')

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('нет связи') }))
    await metrics.poll()
    expect(metrics.render()).not.toContain('{service=')
  })
})
