import { boxFromVertices, type Box, type Vertex } from './ocrFields'

type TextSegment = { startIndex?: string | number; endIndex?: string | number }

type PageRef = {
  page?: string | number
  boundingPoly?: { normalizedVertices?: Vertex[] }
}

type Entity = {
  id?: string
  type?: string
  mentionText?: string
  confidence?: number
  normalizedValue?: { text?: string }
  textAnchor?: { textSegments?: TextSegment[] }
  pageAnchor?: { pageRefs?: PageRef[] }
  properties?: Entity[]
}

type DocAiDocument = {
  text?: string
  pages?: unknown[]
  entities?: Entity[]
}

export type Placement = { page: number; box: Box | null }

export type Match = {
  key: string
  id: string
  type: string
  text: string
  confidence: number | null
  normalized: string
  anchor: string
  placements: Placement[]
}

export type ParsedMatches = {
  matches: Match[]
  pageCount: number
  error: string
}

const anchorText = (source: string, segments: TextSegment[] = []) =>
  segments
    .map(({ startIndex = 0, endIndex = 0 }) => source.slice(Number(startIndex), Number(endIndex)))
    .join(' ')
    .trim()

const toMatch = (entity: Entity, source: string, key: string, prefix: string): Match[] => {
  const segments = entity.textAnchor?.textSegments ?? []
  const type = prefix ? `${prefix} › ${entity.type ?? '?'}` : (entity.type ?? '?')

  const placements = (entity.pageAnchor?.pageRefs ?? []).map((ref) => {
    const vertices = ref.boundingPoly?.normalizedVertices ?? []

    return {
      page: Number(ref.page ?? 0) + 1,
      box: vertices.length >= 2 ? boxFromVertices(vertices) : null,
    }
  })

  const self: Match = {
    key,
    id: entity.id ?? '',
    type,
    text: entity.mentionText || anchorText(source, segments),
    confidence: typeof entity.confidence === 'number' ? entity.confidence : null,
    normalized: entity.normalizedValue?.text ?? '',
    anchor: segments
      .map(({ startIndex = 0, endIndex = 0 }) => `${startIndex}–${endIndex}`)
      .join(', '),
    placements,
  }

  const children = (entity.properties ?? []).flatMap((child, index) =>
    toMatch(child, source, `${key}.${index}`, type),
  )

  return [self, ...children]
}

export const parseMatches = (raw: string): ParsedMatches => {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { matches: [], pageCount: 0, error: `not valid JSON — ${String(error).slice(0, 120)}` }
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as DocAiDocument).entities)) {
    return { matches: [], pageCount: 0, error: 'no "entities" array — is this a Document AI document?' }
  }

  const doc = parsed as DocAiDocument
  const source = doc.text ?? ''

  const matches = (doc.entities ?? []).flatMap((entity, index) =>
    toMatch(entity, source, String(index), ''),
  )

  matches.sort(
    (a, b) =>
      (a.placements[0]?.page ?? Infinity) - (b.placements[0]?.page ?? Infinity) ||
      a.type.localeCompare(b.type),
  )

  return { matches, pageCount: doc.pages?.length ?? 0, error: '' }
}
