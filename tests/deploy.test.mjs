import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('../scripts/deploy.sh', import.meta.url))

let tmp, origin, work, srv, port, httpServer
const sh = (cwd, cmd) => run('bash', ['-c', cmd], { cwd }).then(r => r.stdout.trim())
const calls = () => (existsSync(path.join(tmp, 'calls.log')) ? readFileSync(path.join(tmp, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean) : [])
const resetCalls = () => writeFileSync(path.join(tmp, 'calls.log'), '')

/** Выпускает новую версию в «GitHub»: меняет файлы и пушит из рабочей копии. */
async function release(files) {
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(work, f)), { recursive: true })
    writeFileSync(path.join(work, f), text)
  }
  await sh(work, 'git add -A && git commit -q -m release && git push -q origin main')
}

/** Запуск deploy.sh на «сервере» с подставными командами вместо npm и systemctl. */
async function deploy(args = [], env = {}) {
  try {
    const r = await run('bash', [path.join(srv, 'scripts/deploy.sh'), ...args], {
      cwd: srv,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        HEALTH_URL: `http://127.0.0.1:${port}/health`,
        HEALTH_TRIES: '2',
        INSTALL_ROOT_CMD: `${tmp}/call.sh root-install`,
        INSTALL_SERVER_CMD: `${tmp}/call.sh server-install`,
        BUILD_SERVER_CMD: `${tmp}/call.sh server-build`,
        BUILD_SITE_CMD: `${tmp}/call.sh site-build`,
        RESTART_CMD: `${tmp}/restart.sh`,
        ...env,
      },
    })
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

before(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'deploy-test-'))
  origin = path.join(tmp, 'origin.git')
  work = path.join(tmp, 'work')
  srv = path.join(tmp, 'srv')
  // подставные команды: пишут в calls.log; «перезапуск» делает сервер нездоровым, если в server/a.txt есть BAD
  writeFileSync(path.join(tmp, 'call.sh'), '#!/bin/bash\necho "$1" >> "$(dirname "$0")/calls.log"\n')
  writeFileSync(
    path.join(tmp, 'restart.sh'),
    `#!/bin/bash\necho restart >> ${tmp}/calls.log\nif grep -q BAD ${srv}/server/a.txt; then echo down > ${tmp}/health.state; else echo up > ${tmp}/health.state; fi\n`,
  )
  chmodSync(path.join(tmp, 'call.sh'), 0o755)
  chmodSync(path.join(tmp, 'restart.sh'), 0o755)
  writeFileSync(path.join(tmp, 'health.state'), 'up')
  httpServer = http.createServer((req, res) => {
    const up = readFileSync(path.join(tmp, 'health.state'), 'utf8').trim() === 'up'
    res.statusCode = up ? 200 : 503
    res.end(up ? '{"ok":true}' : '{"ok":false}')
  })
  await new Promise(r => httpServer.listen(0, '127.0.0.1', r))
  port = httpServer.address().port

  await sh(tmp, `git init -q --bare -b main ${origin}`)
  mkdirSync(path.join(work, 'scripts'), { recursive: true })
  await sh(tmp, `git init -q -b main ${work}`)
  await sh(work, 'git config user.email t@t && git config user.name t')
  copyFileSync(SCRIPT, path.join(work, 'scripts/deploy.sh'))
  for (const [f, t] of Object.entries({ 'src/a.txt': '1', 'server/a.txt': '1', 'package.json': '{}', 'package-lock.json': '{}', 'server/package-lock.json': '{}' })) {
    mkdirSync(path.dirname(path.join(work, f)), { recursive: true })
    writeFileSync(path.join(work, f), t)
  }
  await sh(work, `git add -A && git commit -q -m first && git remote add origin ${origin} && git push -q origin main`)
  await sh(tmp, `git clone -q ${origin} ${srv}`)
  await sh(srv, 'git config user.email t@t && git config user.name t')
})
after(() => {
  httpServer?.close()
  rmSync(tmp, { recursive: true, force: true })
})

describe('скрипт обновления на сервере (scripts/deploy.sh)', () => {
  test('нет новых изменений: ничего не собирается и не перезапускается', async () => {
    resetCalls()
    const r = await deploy()
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /Новых изменений нет/)
    assert.deepEqual(calls(), [])
  })

  test('изменился только сайт: собирается сайт, сервер и пакеты не трогаются, перезапуска нет', async () => {
    await release({ 'src/a.txt': '2' })
    resetCalls()
    const r = await deploy()
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(calls(), ['site-build'])
    assert.match(r.out, /перезапуск не нужен/)
  })

  test('изменился сервер: ставятся пакеты сервера, собирается сервер и сайт, служба перезапускается, сервер отвечает', async () => {
    await release({ 'server/a.txt': '2' })
    resetCalls()
    const r = await deploy()
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(calls(), ['server-install', 'server-build', 'site-build', 'restart'])
    assert.match(r.out, /Сервер отвечает/)
  })

  test('изменились пакеты сайта: сначала ставятся они', async () => {
    await release({ 'package-lock.json': '{"v":2}' })
    resetCalls()
    const r = await deploy()
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(calls(), ['root-install', 'site-build'])
  })

  test('неудачный выпуск: сервер не ответил, скрипт сам откатывается на прошлую версию и заканчивается ошибкой', async () => {
    const before = await sh(srv, 'git rev-parse HEAD')
    await release({ 'server/a.txt': 'BAD' })
    resetCalls()
    const r = await deploy()
    assert.notEqual(r.code, 0, 'должна быть ошибка')
    assert.match(r.out, /ОТКАТ/)
    assert.match(r.out, /сервер не ответил/)
    assert.equal(await sh(srv, 'git rev-parse HEAD'), before, 'код вернулся на прошлую версию')
    assert.equal(calls().filter(c => c === 'restart').length, 2, 'служба перезапущена и после отката')
    assert.match(r.out, /Откат выполнен, сервер отвечает/)
    // после отката следующий выпуск (исправленный) ставится нормально
    await release({ 'server/a.txt': '3' })
    resetCalls()
    const ok = await deploy()
    assert.equal(ok.code, 0, ok.out)
  })

  test('сборка сайта не удалась: откат, ошибка', async () => {
    const before = await sh(srv, 'git rev-parse HEAD')
    await release({ 'src/a.txt': '5' })
    const r = await deploy([], { BUILD_SITE_CMD: 'false' })
    assert.notEqual(r.code, 0)
    assert.match(r.out, /не удалось собрать сайт/)
    assert.equal(await sh(srv, 'git rev-parse HEAD'), before)
  })

  test('файл блокировки, переписанный npm на сервере, возвращается как в git, и обновление идёт дальше', async () => {
    writeFileSync(path.join(srv, 'package-lock.json'), '{"переписал":"npm"}')
    writeFileSync(path.join(srv, 'server/package-lock.json'), '{"переписал":"npm"}')
    await release({ 'src/c.txt': 'y' })
    resetCalls()
    const r = await deploy()
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /Возвращаю package-lock\.json как в git/)
    assert.ok(calls().includes('site-build'))
    assert.equal(await sh(srv, 'git status --porcelain'), '', 'рабочая папка снова чистая')
  })

  test('в папке проекта несохранённые правки: скрипт отказывается и ничего не делает', async () => {
    writeFileSync(path.join(srv, 'src/a.txt'), 'правка на сервере')
    await release({ 'src/b.txt': 'x' })
    resetCalls()
    const r = await deploy()
    assert.notEqual(r.code, 0)
    assert.match(r.out, /несохранённые правки/)
    assert.deepEqual(calls(), [])
    await sh(srv, 'git checkout -q -- src/a.txt')
  })

  test('--force собирает и перезапускает, даже если изменений нет', async () => {
    await deploy() // подтянуть всё
    resetCalls()
    const r = await deploy(['--force'])
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(calls(), ['root-install', 'server-install', 'server-build', 'site-build', 'restart'])
  })

  test('неизвестный параметр отклоняется', async () => {
    const r = await deploy(['--что-то'])
    assert.equal(r.code, 2)
    assert.match(r.out, /Неизвестный параметр/)
  })
})
