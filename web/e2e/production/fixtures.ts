import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, expect } from '@playwright/test'

const icon = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQSFjwHwAD5AIge4YO3AAAAABJRU5ErkJggg==',
  'base64',
)

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture port')
  return address.port
}

type ProductionApp = {
  url: string
  directory: string
  targetURL: string
  state: {
    isPrivateReady: boolean
    isPublicReady: boolean
    isIconsReady: boolean
    privateProbes: number
    publicProbes: number
  }
  catalog: (title: string) => string
}

type Options = { isCatalogWatch: boolean; isAuthEnabled: boolean }

export const test = base.extend<{ app: ProductionApp } & Options>({
  isAuthEnabled: [true, { option: true }],
  isCatalogWatch: [true, { option: true }],
  app: async ({ isCatalogWatch, isAuthEnabled, context }, runTest) => {
    const binary = process.env.NAVI_TEST_BINARY
    if (binary === undefined) throw new Error('Production binary was not built')
    const directory = await mkdtemp(join(tmpdir(), 'navi-production-case-'))
    const state = {
      isPrivateReady: true,
      isPublicReady: true,
      isIconsReady: false,
      privateProbes: 0,
      publicProbes: 0,
    }
    const target = createServer((request, response) => {
      if (request.url === '/favicon.ico') {
        response.writeHead(state.isIconsReady ? 200 : 404, { 'Content-Type': 'image/png' })
        response.end(state.isIconsReady ? icon : undefined)
        return
      }
      const isPrivate = request.url === '/private'
      if (request.method === 'HEAD') {
        if (isPrivate) state.privateProbes++
        else state.publicProbes++
      }
      const isReady = isPrivate ? state.isPrivateReady : state.isPublicReady
      response.writeHead(isReady ? 200 : 503, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        `<html><title>Target</title><h1>${isPrivate ? 'Private' : 'Public'} destination</h1></html>`,
      )
    })
    const targetURL = `http://127.0.0.1:${await listen(target)}`
    const reservation = createServer()
    const port = await listen(reservation)
    await new Promise<void>((resolve, reject) =>
      reservation.close((err) => {
        if (err) reject(err)
        else resolve()
      }),
    )
    const url = `http://127.0.0.1:${port}`
    const catalog = (title: string): string =>
      JSON.stringify({
        version: 1,
        pages: [
          {
            id: 'release',
            title,
            urls: [
              {
                name: '部署测试',
                group: '服务',
                private_url: `${targetURL}/private`,
                public_url: `${targetURL}/public`,
              },
            ],
          },
        ],
      })
    await writeFile(join(directory, 'urls.yaml'), catalog('生产检查'))
    await writeFile(
      join(directory, 'config.local.yaml'),
      JSON.stringify({
        auth: isAuthEnabled
          ? {
              username: 'tester',
              password_hash: '$2a$10$x5UV.kUW13vcqk.TuL9OguoMZkBTXE0HsSXon0Y08VU5PhiZ.24my',
            }
          : { username: '', password_hash: '' },
        theme: 'celadon',
        background_pattern: 'none',
        storage: './.cache',
        server: { listen: '127.0.0.1', port, shutdown_timeout: '2s' },
        catalog: { watch: isCatalogWatch, reload_debounce: '30ms' },
        favicon: { refresh_interval: '200ms', fetch_timeout: '500ms' },
        navigation: { private_probe_timeout: '500ms', probe_cache_ttl: '30s' },
        logging: { access_log: false },
      }),
    )
    const child = spawn(binary, [], {
      env: { ...process.env, CONFIG_FILE: join(directory, 'config.local.yaml') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    child.stdout.on('data', (data: Buffer) => {
      logs = (logs + data.toString()).slice(-8000)
    })
    child.stderr.on('data', (data: Buffer) => {
      logs = (logs + data.toString()).slice(-8000)
    })
    let isExited = false
    const exit = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => {
        isExited = true
        resolve(code)
      })
    })
    try {
      await expect
        .poll(async () => {
          if (isExited) throw new Error(`Navi exited: ${logs}`)
          try {
            return (
              ((await (await fetch(`${url}/healthz`)).json()) as { status?: string }).status ?? ''
            )
          } catch {
            return ''
          }
        })
        .toBe('ok')
      await runTest({ url, directory, targetURL, state, catalog })
    } finally {
      // Close browser preconnect sockets before the deliberately short server shutdown deadline.
      // Persistent SSE shutdown itself is covered by the Go lifecycle tests.
      await context.close()
      child.kill('SIGTERM')
      const force = setTimeout(() => {
        if (!isExited) child.kill('SIGKILL')
      }, 5000)
      let code: number | null
      try {
        code = await exit
      } finally {
        clearTimeout(force)
        target.closeAllConnections()
        await new Promise<void>((resolve) =>
          target.close(() => {
            resolve()
          }),
        )
        await rm(directory, { recursive: true, force: true })
      }
      expect(code, `Navi shutdown: ${logs}`).toBe(0)
    }
  },
})
export { expect }
