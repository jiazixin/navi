import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mockCatalog } from './tests/fixtures/mockCatalog.ts'

function devAPI(): Plugin {
  const linksByRuntimeID = new Map(
    mockCatalog.pages.flatMap((page) =>
      page.groups.flatMap((group) => group.links.map((link) => [link.runtime_id, link] as const)),
    ),
  )

  return {
    name: 'navi-dev-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestURL = new URL(request.url ?? '/', 'http://127.0.0.1')

        // UI fixtures are pre-authenticated; production tests cover the actual login boundary.
        if (requestURL.pathname === '/api/auth/session') {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ authenticated: true, auth_required: true }))
          return
        }

        if (requestURL.pathname === '/api/catalog') {
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify(mockCatalog))
          return
        }

        if (requestURL.pathname === '/api/status') {
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({ health: 'ok', revision: mockCatalog.revision }))
          return
        }

        if (requestURL.pathname === '/api/events') {
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/event-stream')
          response.setHeader('Cache-Control', 'no-store')
          response.setHeader('Connection', 'keep-alive')
          response.flushHeaders()

          const heartbeat = setInterval(() => {
            response.write(': heartbeat\n\n')
          }, 15_000)

          request.on('close', () => {
            clearInterval(heartbeat)
          })
          return
        }

        if (requestURL.pathname.startsWith('/go/')) {
          const runtimeID = decodeURIComponent(requestURL.pathname.slice('/go/'.length))
          const link = linksByRuntimeID.get(runtimeID)
          const target = link?.public_url ?? link?.private_url

          if (target === undefined) {
            response.statusCode = 404
            response.setHeader('Content-Type', 'text/plain; charset=utf-8')
            response.setHeader('Cache-Control', 'no-store')
            response.end('Link not found.')
            return
          }

          response.statusCode = 302
          response.setHeader('Location', target)
          response.setHeader('Cache-Control', 'no-store')
          response.end()
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'serve' ? [devAPI()] : [])],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // The server CSP (default-src 'self') rejects data: URLs, so every asset must be a file.
    assetsInlineLimit: 0,
  },
}))
