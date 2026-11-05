import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'

type Stats = {
  cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number }
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number }
  memory_stats?: { usage?: number; stats?: Record<string, number> }
}
const TITLES: Record<string, string> = {
  backend: 'Сервер сайта (API)', frontend: 'Сайт', postgres: 'База данных', redis: 'Очередь задач (Redis)', meilisearch: 'Поиск',
  prometheus: 'Prometheus', grafana: 'Grafana', 'node-exporter': 'Метрики сервера', 'docker-proxy': 'Доступ к Docker', caddy: 'Caddy в Docker',
}
const title = (service: string) => TITLES[service] ?? service
type Container = { Id: string; State: string; Labels?: Record<string, string> }

/** Загрузка процессора (в процентах одного ядра) по двум снимкам статистики Docker. */
export function cpuPercent(s: Stats) {
  const cpu = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0)
  const system = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0)
  if (cpu < 0 || system <= 0) return 0
  return (cpu / system) * (s.cpu_stats?.online_cpus || 1) * 100
}

/** Память без файлового кэша (так её считает `docker stats`). */
export function memoryBytes(s: Stats) {
  const m = s.memory_stats
  if (!m?.usage) return 0
  return Math.max(0, m.usage - (m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? m.stats?.cache ?? 0))
}

/**
 * Нагрузка по службам Compose для панели Grafana: процессор и память каждого контейнера проекта.
 * Данные берутся у Docker через тот же read-only прокси, что и вкладка «Сервисы» (отдельный cAdvisor на новых Docker часто не узнаёт контейнеры).
 * Опрос раз в 15 секунд в фоне, /api/metrics отдаёт последний снимок и ничего не ждёт.
 */
@Injectable()
export class ContainerMetrics implements OnModuleInit, OnModuleDestroy {
  private readonly base = (process.env.DOCKER_API_URL || '').replace(/\/$/, '')
  private readonly project = process.env.COMPOSE_PROJECT_NAME || 'korean'
  private snapshot = new Map<string, { cpu: number; memory: number }>()
  private timer?: NodeJS.Timeout

  onModuleInit() {
    if (!this.base || process.env.NODE_ENV === 'test') return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), 15_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async poll() {
    if (!this.base) return
    try {
      const filters = JSON.stringify({ label: [`com.docker.compose.project=${this.project}`], status: ['running'] })
      const list = await this.get<Container[]>(`/containers/json?${new URLSearchParams({ filters })}`)
      const next = new Map<string, { cpu: number; memory: number }>()
      await Promise.all(list.map(async c => {
        const service = c.Labels?.['com.docker.compose.service']
        if (!service) return
        try {
          const stats = await this.get<Stats>(`/containers/${encodeURIComponent(c.Id)}/stats?stream=false`)
          next.set(service, { cpu: cpuPercent(stats), memory: memoryBytes(stats) })
        } catch { /* контейнер остановился между запросами */ }
      }))
      this.snapshot = next
    } catch {
      this.snapshot = new Map() // Docker недоступен: лучше пустые линии, чем устаревшие цифры
    }
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error(`docker ${response.status}`)
    return await response.json() as T
  }

  render() {
    const lines = [
      '# HELP service_cpu_percent Загрузка процессора службой Compose, в процентах одного ядра.',
      '# TYPE service_cpu_percent gauge',
    ]
    for (const [service, v] of this.snapshot) lines.push(`service_cpu_percent{service="${service}",title="${title(service)}"} ${v.cpu.toFixed(3)}`)
    lines.push('# HELP service_memory_bytes Память службы Compose без файлового кэша.', '# TYPE service_memory_bytes gauge')
    for (const [service, v] of this.snapshot) lines.push(`service_memory_bytes{service="${service}",title="${title(service)}"} ${Math.round(v.memory)}`)
    return `${lines.join('\n')}\n`
  }
}
