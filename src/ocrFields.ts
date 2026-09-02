export type Vertex = { x?: number; y?: number }

export type Box = { x: number; y: number; w: number; h: number }

export type ParsedField = {
  label: string
  page: number | null
  box: Box | null
  vertices: number
  error: string
}

const asVertices = (value: unknown): Vertex[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const vertices = value.filter(
    (item): item is Vertex =>
      typeof item === 'object' && item !== null && ('x' in item || 'y' in item),
  )

  return vertices.length ? vertices : null
}

const findVertices = (value: unknown): Vertex[] | null => {
  const direct = asVertices(value)

  if (direct) {
    return direct
  }

  if (typeof value !== 'object' || value === null) {
    return null
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'normalizedVertices') {
      const found = asVertices(child)

      if (found) {
        return found
      }
    }

    const nested = findVertices(child)

    if (nested) {
      return nested
    }
  }

  return null
}

const findValue = (value: unknown, wanted: string): unknown => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === wanted) {
      return child
    }

    const nested = findValue(child, wanted)

    if (nested !== undefined) {
      return nested
    }
  }

  return undefined
}

const relaxedParse = (text: string): unknown => {
  const attempts = [text, `{${text}}`, `[${text}]`]

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt)
    } catch {
      continue
    }
  }

  const verticesMatch = /"normalizedVertices"\s*:\s*(\[[^\]]*\])/.exec(text)
  const pageMatch = /"page"\s*:\s*"?(\d+)"?/.exec(text)
  const mentionMatch = /"mentionText"\s*:\s*"([^"]*)"/.exec(text)

  if (!verticesMatch) {
    return undefined
  }

  try {
    return {
      normalizedVertices: JSON.parse(verticesMatch[1]),
      page: pageMatch?.[1],
      mentionText: mentionMatch?.[1],
    }
  } catch {
    return undefined
  }
}

export const boxFromVertices = (vertices: Vertex[]): Box => {
  const xs = vertices.map((vertex) => vertex.x ?? 0)
  const ys = vertices.map((vertex) => vertex.y ?? 0)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)

  return {
    x: minX * 100,
    y: minY * 100,
    w: (Math.max(...xs) - minX) * 100,
    h: (Math.max(...ys) - minY) * 100,
  }
}

export const parseField = (text: string): ParsedField => {
  const empty: ParsedField = {
    label: '',
    page: null,
    box: null,
    vertices: 0,
    error: '',
  }

  if (!text.trim()) {
    return empty
  }

  const parsed = relaxedParse(text)

  if (parsed === undefined) {
    return { ...empty, error: 'could not parse — expected JSON with normalizedVertices' }
  }

  const vertices = findVertices(parsed)

  if (!vertices) {
    return { ...empty, error: 'no normalizedVertices found' }
  }

  const rawPage = findValue(parsed, 'page')
  const pageIndex = Number(rawPage)
  const mention = findValue(parsed, 'mentionText')
  const type = findValue(parsed, 'type')

  return {
    label:
      (typeof mention === 'string' && mention) ||
      (typeof type === 'string' && type) ||
      'field',
    page: Number.isFinite(pageIndex) ? pageIndex + 1 : 1,
    box: boxFromVertices(vertices),
    vertices: vertices.length,
    error: '',
  }
}
