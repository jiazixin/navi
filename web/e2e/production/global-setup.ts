import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

export default function setup(): () => void {
  const directory = mkdtempSync(resolve(tmpdir(), 'navi-production-build-'))
  const binary = resolve(directory, 'navi')
  try {
    execFileSync('go', ['build', '-trimpath', '-buildvcs=false', '-o', binary, './cmd/navi'], {
      cwd: resolve(import.meta.dirname, '../../..'),
      env: { ...process.env, CGO_ENABLED: '0' },
      stdio: 'pipe',
      timeout: 120_000,
    })
    process.env.NAVI_TEST_BINARY = binary
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  return () => {
    rmSync(directory, { recursive: true, force: true })
  }
}
