import type { AiFrameworkResponse, ChatSettings, DisparoAnswerItem } from '../types'

function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

export function buildMessagesUrl(settings: ChatSettings): string {
  const base = normalizeBaseUrl(settings.apiBaseUrl)
  // Quando base === '', usa proxy do Vite (mesma origin): /v1/...
  return `${base}/v1/messages/simple/${encodeURIComponent(settings.companyId)}`
}

export async function sendMessage(
  settings: ChatSettings,
  message: string,
): Promise<{
  answerText: string
  answerItems: DisparoAnswerItem[]
  raw: AiFrameworkResponse
  status: number
  ok: boolean
  request: { url: string; payload: Record<string, unknown> }
  rawText: string | null
  timingMs: number
}> {
  const url = buildMessagesUrl(settings)
  const payload: Record<string, unknown> = {
    message,
    customer_phone: settings.customerPhone,
  }
  if (settings.customerName?.trim()) payload.customer_name = settings.customerName.trim()

  const t0 = performance.now()
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const t1 = performance.now()

  let data: AiFrameworkResponse
  let rawText: string | null = null
  try {
    rawText = await resp.text()
    data = JSON.parse(rawText) as AiFrameworkResponse
  } catch {
    data = { success: false, provider: 'simple', error: `Resposta inválida (${resp.status})` }
  }

  if (!resp.ok || data.success === false) {
    const msg = data.error || `Erro HTTP ${resp.status}`
    const err = new Error(msg)
    ;(err as any).response = data
    ;(err as any).status = resp.status
    ;(err as any).rawText = rawText
    ;(err as any).request = { url, payload }
    ;(err as any).timingMs = Math.max(0, t1 - t0)
    throw err
  }

  const answerItems = extractDisparoItems(data)
  const answerText = itemsToText(answerItems) || extractAssistantAnswerText(data) || ''

  return {
    answerText,
    answerItems,
    raw: data,
    status: resp.status,
    ok: resp.ok,
    request: { url, payload },
    rawText,
    timingMs: Math.max(0, t1 - t0),
  }
}

function toAnswerItems(raw: unknown): DisparoAnswerItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x): DisparoAnswerItem | null => {
        if (typeof x === 'string') return { type: 'text', message: x }
        if (x && typeof x === 'object') return x as DisparoAnswerItem
        return null
      })
      .filter((x): x is DisparoAnswerItem => Boolean(x))
  }
  if (typeof raw === 'string' && raw.trim()) return [{ type: 'text', message: raw }]
  if (raw && typeof raw === 'object') return [raw as DisparoAnswerItem]
  return []
}

function extractDisparoItems(data: AiFrameworkResponse): DisparoAnswerItem[] {
  const d = data.data
  let items = toAnswerItems(d?.disparo?.answer)
  if (items.length) return items
  items = toAnswerItems(d?.assistant_response?.answer)
  return items
}

function itemsToText(items: DisparoAnswerItem[]): string {
  const texts = items
    .map((it) => {
      if (it && typeof it === 'object' && 'type' in it && (it as any).type === 'text') {
        const m = (it as any).message
        return typeof m === 'string' ? m : ''
      }
      return ''
    })
    .filter(Boolean)
  return texts.join('\n\n').trim()
}

function extractAssistantAnswerText(data: AiFrameworkResponse): string | null {
  const raw = data.data?.assistant_response?.answer
  if (typeof raw === 'string') return raw
  if (raw == null) return null
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

