import type { AnimatedPatternID } from '../../../app/appearance/options'
import { createNoise, createRandom } from './noise'

/** Comma-separated RGB channels read from CSS, e.g. "238, 236, 230". */
export type PatternColors = { line: string; accent: string }
export type PatternPointer = { x: number; y: number; strength: number }
export type FrameOptions = {
  /** Multiplier that keeps strokes ~1 CSS px when a renderer is drawn scaled down. */
  lineScale: number
  /** Draw a settled still frame instead of advancing simulation state. */
  isStill: boolean
}

/** Complete inputs for one deterministic renderer frame. */
export type PatternFrame = {
  context: CanvasRenderingContext2D
  time: number
  pointer: PatternPointer
  colors: PatternColors
  options: FrameOptions
}

export type PatternRenderer = {
  resize: (width: number, height: number) => void
  reset?: () => void
  frame: (frame: PatternFrame) => void
}

const noise = createNoise(20261016)
const TAU = Math.PI * 2

// Marching-squares segments per corner case; edges are 0 top, 1 right, 2 bottom, 3 left.
const contourSegments: readonly (readonly number[])[] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 1, 3, 2],
  [0, 2],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 3, 1, 2],
  [0, 1],
  [3, 1],
  [1, 2],
  [3, 2],
  [],
]

function createContour(): PatternRenderer {
  let width = 0
  let height = 0
  let cell = 10
  let columns = 0
  let rows = 0
  let field = new Float32Array(0)

  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      cell = Math.max(7, Math.round(Math.sqrt((width * height) / 15000)))
      columns = Math.ceil(width / cell) + 2
      rows = Math.ceil(height / cell) + 2
      field = new Float32Array(columns * rows)
    },
    frame({ context, time, pointer, colors, options }) {
      context.clearRect(0, 0, width, height)
      const z = time * 0.00004
      const frequency = 0.0019
      const radius2 = 170 * 170
      for (let row = 0; row < rows; row++) {
        const y = row * cell
        for (let column = 0; column < columns; column++) {
          const x = column * cell
          let value =
            noise(x * frequency, y * frequency, z) * 0.72 +
            noise(x * frequency * 2.4 + 40, y * frequency * 2.4, z * 1.7) * 0.28
          if (pointer.strength > 0.01) {
            const dx = x - pointer.x
            const dy = y - pointer.y
            value += pointer.strength * 0.62 * Math.exp(-(dx * dx + dy * dy) / radius2)
          }
          field[row * columns + column] = value
        }
      }

      const minor = new Path2D()
      const major = new Path2D()
      const base = -1.2
      const step = 0.08
      for (let row = 0; row < rows - 1; row++) {
        const y0 = row * cell
        for (let column = 0; column < columns - 1; column++) {
          const x0 = column * cell
          const offset = row * columns + column
          const a = field[offset] ?? 0
          const b = field[offset + 1] ?? 0
          const c = field[offset + columns + 1] ?? 0
          const d = field[offset + columns] ?? 0
          const last = Math.floor((Math.max(a, b, c, d) - base) / step)
          for (
            let level = Math.ceil((Math.min(a, b, c, d) - base) / step);
            level <= last;
            level++
          ) {
            const threshold = base + level * step
            const index =
              (a > threshold ? 8 : 0) |
              (b > threshold ? 4 : 0) |
              (c > threshold ? 2 : 0) |
              (d > threshold ? 1 : 0)
            const segments = contourSegments[index] ?? []
            const path = level % 5 === 0 ? major : minor
            segments.forEach((edge, position) => {
              let ex: number
              let ey: number
              if (edge === 0) [ex, ey] = [x0 + (cell * (threshold - a)) / (b - a), y0]
              else if (edge === 1) [ex, ey] = [x0 + cell, y0 + (cell * (threshold - b)) / (c - b)]
              else if (edge === 2) [ex, ey] = [x0 + (cell * (threshold - d)) / (c - d), y0 + cell]
              else [ex, ey] = [x0, y0 + (cell * (threshold - a)) / (d - a)]
              if (position % 2 === 0) path.moveTo(ex, ey)
              else path.lineTo(ex, ey)
            })
          }
        }
      }
      context.lineWidth = 0.8 * options.lineScale
      context.strokeStyle = `rgba(${colors.line}, 0.13)`
      context.stroke(minor)
      context.lineWidth = 1.15 * options.lineScale
      context.strokeStyle = `rgba(${colors.accent}, 0.42)`
      context.stroke(major)
    },
  }
}

function createFlow(): PatternRenderer {
  let width = 0
  let height = 0
  let count = 0
  let particles = new Float32Array(0)
  let isNeedsClear = true
  let random = createRandom(1)

  const spawn = (index: number): void => {
    particles[index * 3] = random() * width
    particles[index * 3 + 1] = random() * height
    particles[index * 3 + 2] = 60 + random() * 220
  }

  const advance = (
    lines: Path2D,
    accents: Path2D,
    { time, pointer, speed }: { time: number; pointer: PatternPointer; speed: number },
  ): void => {
    const z = time * 0.000025
    const frequency = 0.0016
    const radius = 180
    for (let index = 0; index < count; index++) {
      let x = particles[index * 3] ?? 0
      let y = particles[index * 3 + 1] ?? 0
      const angle = noise(x * frequency, y * frequency, z) * Math.PI * 2.4
      let vx = Math.cos(angle) * speed
      let vy = Math.sin(angle) * speed
      if (pointer.strength > 0.01) {
        const dx = x - pointer.x
        const dy = y - pointer.y
        const distance = Math.hypot(dx, dy)
        if (distance < radius && distance > 1) {
          const swirl = (1 - distance / radius) * 2.6 * pointer.strength
          vx += (-dy / distance) * swirl
          vy += (dx / distance) * swirl
        }
      }
      const path = index % 13 === 0 ? accents : lines
      path.moveTo(x, y)
      x += vx
      y += vy
      path.lineTo(x, y)
      particles[index * 3] = x
      particles[index * 3 + 1] = y
      const life = (particles[index * 3 + 2] ?? 0) - 1
      particles[index * 3 + 2] = life
      if (x < -2 || x > width + 2 || y < -2 || y > height + 2 || life < 0) spawn(index)
    }
  }

  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      count = Math.round(Math.min(2800, (width * height) / 650))
      random = createRandom(1)
      particles = new Float32Array(count * 3)
      for (let index = 0; index < count; index++) spawn(index)
      isNeedsClear = true
    },
    reset() {
      isNeedsClear = true
    },
    frame({ context, time, pointer, colors, options }) {
      const lines = new Path2D()
      const accents = new Path2D()
      if (options.isStill) {
        context.clearRect(0, 0, width, height)
        random = createRandom(1)
        for (let index = 0; index < count; index++) spawn(index)
        for (let step = 0; step < 90; step++)
          advance(lines, accents, { time: time, pointer: pointer, speed: 1.2 })
        context.lineWidth = 0.6 * options.lineScale
        context.strokeStyle = `rgba(${colors.line}, 0.08)`
        context.stroke(lines)
        context.strokeStyle = `rgba(${colors.accent}, 0.2)`
        context.stroke(accents)
        isNeedsClear = true
        return
      }
      if (isNeedsClear) {
        context.clearRect(0, 0, width, height)
        isNeedsClear = false
      }
      // Fade previous trails towards transparency so the CSS backdrop shows through.
      context.globalCompositeOperation = 'destination-out'
      context.fillStyle = 'rgba(0, 0, 0, 0.075)'
      context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'source-over'
      advance(lines, accents, { time: time, pointer: pointer, speed: 1.15 })
      context.lineWidth = 0.9 * options.lineScale
      context.strokeStyle = `rgba(${colors.line}, 0.38)`
      context.stroke(lines)
      context.strokeStyle = `rgba(${colors.accent}, 0.8)`
      context.stroke(accents)
    },
  }
}

const guillocheBands = [
  { radius: 1.36, waves: 30, amplitude: 0.026, strands: 10, accent: false, alpha: 0.1 },
  { radius: 1.02, waves: 17, amplitude: 0.06, strands: 18, accent: false, alpha: 0.2 },
  { radius: 0.74, waves: 11, amplitude: 0.085, strands: 16, accent: true, alpha: 0.42 },
  { radius: 0.47, waves: 7, amplitude: 0.075, strands: 14, accent: false, alpha: 0.2 },
  { radius: 0.24, waves: 5, amplitude: 0.06, strands: 10, accent: true, alpha: 0.3 },
] as const

function createGuilloche(): PatternRenderer {
  let width = 0
  let height = 0
  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
    },
    frame({ context, time, pointer, colors, options }) {
      context.clearRect(0, 0, width, height)
      const isWide = width > 900
      const cx = isWide ? width * 0.73 : width * 0.5
      const cy = isWide ? Math.min(height * 0.42, 400) : height * 0.3
      const base = isWide ? Math.min(width * 0.2, height * 0.36, 340) : Math.min(width * 0.44, 210)
      const t = time * 0.0001
      const lean = pointer.strength * (pointer.x / width - 0.5) * 0.5
      for (const band of guillocheBands) {
        const path = new Path2D()
        const radius = band.radius * base
        const amplitude = band.amplitude * base * (1 + 0.22 * Math.sin(t * 2.2 + band.waves))
        const steps = Math.min(1100, 260 + band.waves * 34)
        const rotation = (t * 0.35 + lean) * (band.waves % 2 ? 1 : -1)
        for (let strand = 0; strand < band.strands; strand++) {
          const phase = (strand / band.strands) * TAU
          for (let step = 0; step <= steps; step++) {
            const q = (step / steps) * TAU
            const r =
              radius +
              amplitude * Math.sin(band.waves * q + phase + t * 1.6) +
              amplitude * 0.32 * Math.sin((band.waves * 2 + 1) * q - phase * 2 - t)
            const x = cx + r * Math.cos(q + rotation)
            const y = cy + r * Math.sin(q + rotation)
            if (step === 0) path.moveTo(x, y)
            else path.lineTo(x, y)
          }
        }
        context.lineWidth = 0.7 * options.lineScale
        context.strokeStyle = `rgba(${band.accent ? colors.accent : colors.line}, ${band.alpha})`
        context.stroke(path)
      }
    },
  }
}

type Star = {
  radius: number
  angle: number
  length: number
  alpha: number
  isWide: boolean
  isAccent: boolean
}

function createStars(): PatternRenderer {
  let width = 0
  let height = 0
  let stars: Star[] = []
  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      const count = Math.round(Math.min(760, (width * height) / 2000))
      const maximum = Math.hypot(width, height) * 1.05
      const random = createRandom(2)
      stars = Array.from({ length: count }, () => ({
        radius: 18 + Math.pow(random(), 0.8) * maximum,
        angle: random() * TAU,
        length: 0.05 + random() * random() * 0.75,
        alpha: 0.1 + Math.pow(random(), 2.2) * 0.75,
        isWide: random() < 0.25,
        isAccent: random() < 0.08,
      }))
    },
    frame({ context, time, pointer, colors, options }) {
      context.clearRect(0, 0, width, height)
      const isWide = width > 900
      const px =
        (isWide ? width * 0.8 : width * 0.66) + (pointer.x - width / 2) * 0.03 * pointer.strength
      const py =
        (isWide ? height * 0.17 : height * 0.12) +
        (pointer.y - height / 2) * 0.03 * pointer.strength
      const rotation = time * 0.000022
      const glow = context.createRadialGradient(px, py, 0, px, py, 220)
      glow.addColorStop(0, `rgba(${colors.accent}, 0.16)`)
      glow.addColorStop(1, `rgba(${colors.accent}, 0)`)
      context.fillStyle = glow
      context.fillRect(px - 220, py - 220, 440, 440)

      // Batch arcs by colour, width and quantised alpha to keep draw calls low.
      const buckets = new Map<
        string,
        { path: Path2D; isAccent: boolean; isWide: boolean; alpha: number }
      >()
      const heads = { line: new Path2D(), accent: new Path2D() }
      const segments = 4
      for (const star of stars) {
        const head = star.angle + rotation
        for (let segment = 0; segment < segments; segment++) {
          const start = head - star.length * (1 - segment / segments)
          const end = head - star.length * (1 - (segment + 1) / segments)
          const level = Math.min(
            9,
            Math.round(star.alpha * Math.pow((segment + 1) / segments, 1.6) * 12),
          )
          const key = `${star.isAccent ? 'a' : 'l'}${star.isWide ? 1 : 0}${level}`
          let bucket = buckets.get(key)
          if (bucket === undefined) {
            bucket = {
              path: new Path2D(),
              isAccent: star.isAccent,
              isWide: star.isWide,
              alpha: level / 12,
            }
            buckets.set(key, bucket)
          }
          bucket.path.moveTo(px + star.radius * Math.cos(start), py + star.radius * Math.sin(start))
          bucket.path.arc(px, py, star.radius, start, end)
        }
        if (star.alpha > 0.45) {
          const target = star.isAccent ? heads.accent : heads.line
          const hx = px + star.radius * Math.cos(head)
          const hy = py + star.radius * Math.sin(head)
          target.moveTo(hx + 1.3 * options.lineScale, hy)
          target.arc(hx, hy, 1.3 * options.lineScale, 0, TAU)
        }
      }
      for (const bucket of buckets.values()) {
        context.lineWidth = (bucket.isWide ? 1.4 : 0.7) * options.lineScale
        context.strokeStyle = `rgba(${bucket.isAccent ? colors.accent : colors.line}, ${bucket.alpha})`
        context.stroke(bucket.path)
      }
      context.fillStyle = `rgba(${colors.line}, 0.7)`
      context.fill(heads.line)
      context.fillStyle = `rgba(${colors.accent}, 0.9)`
      context.fill(heads.accent)
    },
  }
}

function createRidge(): PatternRenderer {
  let width = 0
  let height = 0
  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
    },
    frame({ context, time, pointer, colors, options }) {
      context.clearRect(0, 0, width, height)
      const isWide = width > 900
      const gap = Math.max(14, height / 46)
      const step = Math.max(5, width / 260)
      const cx = isWide ? width * 0.68 : width * 0.5
      const spread = width * (isWide ? 0.26 : 0.4)
      const amplitude = gap * 5.2
      const z = time * 0.00008
      const top = height * 0.08
      const count = Math.floor((height - top) / gap)
      for (let ridge = 0; ridge < count; ridge++) {
        const baseline = top + (ridge + 1) * gap
        const points: number[] = []
        for (let x = -step; x <= width + step; x += step) {
          const ex = (x - cx) / spread
          const envelope = Math.exp(-ex * ex)
          let lift =
            envelope * (0.5 + 0.5 * noise(x * 0.0035, ridge * 0.19, z)) +
            envelope * 0.45 * Math.max(0, noise(x * 0.011, ridge * 0.37, z * 1.6))
          lift = Math.max(0, lift) * amplitude
          if (pointer.strength > 0.01) {
            const px = (x - pointer.x) / 110
            const py = (baseline - pointer.y) / 150
            lift += pointer.strength * amplitude * 0.9 * Math.exp(-px * px - py * py)
          }
          points.push(x, baseline - lift)
        }
        const line = new Path2D()
        line.moveTo(points[0] ?? 0, points[1] ?? baseline)
        for (let index = 2; index < points.length; index += 2)
          line.lineTo(points[index] ?? 0, points[index + 1] ?? baseline)
        // Erase what lies behind this ridge so nearer ridges occlude farther ones.
        const mask = new Path2D(line)
        mask.lineTo(points.at(-2) ?? width, baseline + gap * 0.6)
        mask.lineTo(points[0] ?? 0, baseline + gap * 0.6)
        mask.closePath()
        context.globalCompositeOperation = 'destination-out'
        context.fillStyle = '#000'
        context.fill(mask)
        context.globalCompositeOperation = 'source-over'
        const depth = ridge / count
        const isAccent = ridge % 7 === 3
        context.lineWidth = (isAccent ? 1.15 : 0.85) * options.lineScale
        context.strokeStyle = isAccent
          ? `rgba(${colors.accent}, ${0.35 + depth * 0.4})`
          : `rgba(${colors.line}, ${0.1 + depth * 0.28})`
        context.stroke(line)
      }
    },
  }
}

export const patternRenderers: Record<
  AnimatedPatternID,
  { create: () => PatternRenderer; fps: number }
> = {
  contour: { create: createContour, fps: 30 },
  flow: { create: createFlow, fps: 60 },
  guilloche: { create: createGuilloche, fps: 30 },
  stars: { create: createStars, fps: 60 },
  ridge: { create: createRidge, fps: 30 },
}
