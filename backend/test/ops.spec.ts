import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { OpsService } from '../src/admin/ops.service'

const env = process.env.DOCKER_API_URL
afterEach(() => {
  vi.unstubAllGlobals()
  if (env === undefined) delete process.env.DOCKER_API_URL
  else process.env.DOCKER_API_URL = env
})

describe('состояние Docker-сервисов в кабинете', () => {
  it('показывает только контейнеры заданного Compose проекта и их healthcheck', async () => {
    process.env.DOCKER_API_URL = 'http://docker-proxy:2375'
    process.env.COMPOSE_PROJECT_NAME = 'korean'
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify([
      { Id: 'abc123456789', Names: ['/korean-backend-1'], Created: 100, State: 'running', Status: 'Up 1 minute (healthy)', Labels: { 'com.docker.compose.project': 'korean', 'com.docker.compose.service': 'backend' }, Health: { Status: 'healthy' } },
      { Id: 'other12345678', Created: 200, State: 'running', Status: 'Up', Labels: { 'com.docker.compose.project': 'other', 'com.docker.compose.service': 'backend' } },
    ]), { status: 200 })))

    const response = await new OpsService().services()
    expect(response.project).toBe('korean')
    expect(response.services.find(service => service.name === 'caddy-host')).toMatchObject({ state: 'unknown', external: true })
    expect((await new OpsService().services(true)).services.find(service => service.name === 'caddy-host')).toMatchObject({ state: 'running', health: 'healthy' })
    expect(response.services.some(service => service.name === 'caddy')).toBe(false) // Caddy в профиле edge: без его контейнера в списке нет
    expect(response.services.find(service => service.name === 'backend')).toMatchObject({
      container: 'korean-backend-1', state: 'running', health: 'healthy', replicas: 1,
    })
  })

  it('декодирует журналы Docker и ограничивает выбор контейнера текущим проектом', async () => {
    process.env.DOCKER_API_URL = 'http://docker-proxy:2375'
    const bytes = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 5, ...new TextEncoder().encode('hello')])
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ Id: 'abc123456789', Names: ['/korean-redis-1'], Created: 100, State: 'running', Status: 'Up', Labels: { 'com.docker.compose.project': 'korean', 'com.docker.compose.service': 'redis' } }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(new OpsService().logs('redis', 800)).resolves.toMatchObject({ service: 'redis', tail: 500, logs: 'hello' })
    expect(fetch.mock.calls[1]?.[0]).toContain('tail=500')
  })

  it('отклоняет неизвестный сервис и сообщает о закрытом proxy', async () => {
    process.env.DOCKER_API_URL = 'http://docker-proxy:2375'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(new OpsService().logs('volumes')).rejects.toBeInstanceOf(NotFoundException)
    expect(fetch).not.toHaveBeenCalled()

    process.env.DOCKER_API_URL = ''
    await expect(new OpsService().services()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
