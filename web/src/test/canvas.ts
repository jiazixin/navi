import { vi } from 'vitest'
// Minimal 2D canvas doubles: jsdom implements neither CanvasRenderingContext2D nor Path2D.
class RecordingPath2D {
  readonly commands: string[] = []

  constructor(source?: RecordingPath2D) {
    if (source !== undefined) this.commands.push(...source.commands)
  }

  moveTo(): void {
    this.commands.push('moveTo')
  }

  lineTo(): void {
    this.commands.push('lineTo')
  }

  arc(): void {
    this.commands.push('arc')
  }

  closePath(): void {
    this.commands.push('closePath')
  }
}

export function createRecordingContext() {
  const gradient = { addColorStop: vi.fn() }
  return {
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '' as unknown,
    globalCompositeOperation: 'source-over',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn<(path: RecordingPath2D) => void>(),
    fill: vi.fn<(path: RecordingPath2D) => void>(),
    createRadialGradient: vi.fn(() => gradient),
  }
}

export function installPath2D(): void {
  vi.stubGlobal('Path2D', RecordingPath2D)
}
