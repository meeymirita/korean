import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'

const SERVICES = ['backend', 'frontend', 'caddy', 'prometheus', 'grafana', 'node-exporter', 'docker-proxy', 'postgres', 'redis', 'meilisearch'] as const
type ServiceName = typeof SERVICES[number]
type Container = {
  Id: string
  Names?: string[]
  Created: number
  State: string
  Status: string
  Labels?: Record<string, string>
  Health?: { Status?: string }
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> }
}

@Injectable()
export class OpsService {
  private readonly base = (process.env.DOCKER_API_URL || '').replace(/\/$/, '')
  private readonly project = process.env.COMPOSE_PROJECT_NAME || 'korean'

  async services() {
    const containers = await this.listContainers()
    return {
      project: this.project,
      checkedAt: new Date().toISOString(),
      services: SERVICES.filter(service => service !== 'caddy' || containers.some(c => c.Labels?.['com.docker.compose.service'] === 'caddy')).map(service => {
        const matches = containers
          .filter(container => container.Labels?.['com.docker.compose.service'] === service)
          .sort((a, b) => b.Created - a.Created)
        const container = matches.find(item => item.State === 'running') || matches[0]
        return container ? {
          name: service,
          container: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
          state: container.State,
          health: container.Health?.Status || container.Status.match(/\((healthy|unhealthy|starting)\)/)?.[1] || 'not_configured',
          status: container.Status,
          createdAt: new Date(container.Created * 1000).toISOString(),
          ip: Object.values(container.NetworkSettings?.Networks || {}).map(network => network.IPAddress).find(Boolean) || null,
          replicas: matches.length,
        } : { name: service, state: 'not_found', health: 'unknown', status: 'Container is not running or is not in this Compose project', replicas: 0 }
      }),
    }
  }

  async logs(service: string, tail = 100) {
    if (!SERVICES.includes(service as ServiceName)) throw new NotFoundException({ error: 'unknown_service', services: SERVICES })
    const count = Number.isFinite(tail) ? Math.max(1, Math.min(500, tail)) : 100
    const container = (await this.listContainers())
      .filter(item => item.Labels?.['com.docker.compose.service'] === service)
      .sort((a, b) => Number(b.State === 'running') - Number(a.State === 'running') || b.Created - a.Created)[0]
    if (!container) throw new NotFoundException({ error: 'service_not_found', service })

    const query = new URLSearchParams({ stdout: '1', stderr: '1', timestamps: '1', tail: String(count) })
    const response = await this.request(`/containers/${encodeURIComponent(container.Id)}/logs?${query}`)
    if (!response.ok) throw new ServiceUnavailableException({ error: 'docker_logs_unavailable', status: response.status })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return {
      service,
      container: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
      tail: count,
      logs: this.decodeLogs(bytes),
    }
  }

  private async listContainers(): Promise<Container[]> {
    const filters = JSON.stringify({ label: [`com.docker.compose.project=${this.project}`] })
    const query = new URLSearchParams({ all: '1', filters })
    const response = await this.request(`/containers/json?${query}`)
    if (!response.ok) throw new ServiceUnavailableException({ error: 'docker_status_unavailable', status: response.status })
    const containers = await response.json() as Container[]
    return containers.filter(container => container.Labels?.['com.docker.compose.project'] === this.project)
  }

  private async request(path: string) {
    if (!this.base) throw new ServiceUnavailableException({ error: 'docker_api_not_configured' })
    try {
      return await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(5000) })
    } catch {
      throw new ServiceUnavailableException({ error: 'docker_api_unavailable' })
    }
  }

  /** Docker возвращает stdout/stderr в виде записей с восьмибайтовым заголовком, если контейнер запущен без TTY. */
  private decodeLogs(bytes: Uint8Array) {
    const chunks: string[] = []
    let offset = 0
    while (offset + 8 <= bytes.length) {
      const stream = bytes[offset]
      const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0)
      if (stream !== 0 && stream !== 1 && stream !== 2 || offset + 8 + size > bytes.length) return new TextDecoder().decode(bytes)
      chunks.push(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + size)))
      offset += 8 + size
    }
    return offset === bytes.length ? chunks.join('') : new TextDecoder().decode(bytes)
  }
}
