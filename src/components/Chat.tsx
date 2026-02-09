import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatSettings, DisparoAnswerItem } from '../types'
import { sendMessage } from '../api/client'
import JsonTree from './JsonTree'

type Props = {
  settings: ChatSettings
  onReset: () => void
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function tryParseCtaUrl(text: string): DisparoAnswerItem | null {
  if (!text || typeof text !== 'string') return null
  const t = text.trim()
  if (!t.startsWith('{') || !t.includes('"type"') || !t.includes('cta_url')) return null
  try {
    const o = JSON.parse(t) as { type?: string; url?: string; display?: string }
    if (o && o.type === 'cta_url' && typeof o.url === 'string' && o.url) {
      return { type: 'cta_url', url: o.url, display: o.display }
    }
  } catch {
    // ignore
  }
  return null
}

function tryParseDisparoItemsFromText(text: string): DisparoAnswerItem[] | null {
  if (!text || typeof text !== 'string') return null
  const t = text.trim()
  if (!t) return null
  // aceita JSON objeto ou array
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  if (!t.includes('"type"')) return null
  try {
    const parsed = JSON.parse(t) as any
    if (Array.isArray(parsed)) {
      const out: DisparoAnswerItem[] = []
      for (const it of parsed) {
        if (typeof it === 'string') out.push({ type: 'text', message: it })
        else if (it && typeof it === 'object') out.push(it as DisparoAnswerItem)
      }
      return out.length ? out : null
    }
    if (parsed && typeof parsed === 'object') {
      return [parsed as DisparoAnswerItem]
    }
  } catch {
    // ignore
  }
  return null
}

function withRedirectUrlParam(href: string, redirectUrl: string): string {
  try {
    if (!href || typeof href !== 'string') return href
    const base =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost'
    const url = new URL(href, base)
    // Se já existe redirect_url, respeita (não sobrescreve)
    if (url.searchParams.has('redirect_url')) return url.toString()
    url.searchParams.set('redirect_url', redirectUrl)
    return url.toString()
  } catch {
    return href
  }
}

function getThreadIdFromLocation(): string | null {
  try {
    if (typeof window === 'undefined') return null
    const sp = new URLSearchParams(window.location.search || '')
    const tid = (sp.get('thread_id') || sp.get('threadId') || '').trim()
    return tid || null
  } catch {
    return null
  }
}

function setThreadIdInLocation(threadId: string | null) {
  try {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const tid = (threadId || '').trim()
    const prev = (url.searchParams.get('thread_id') || '').trim()
    if (tid) url.searchParams.set('thread_id', tid)
    else url.searchParams.delete('thread_id')
    if (url.searchParams.has('threadId')) url.searchParams.delete('threadId')
    // Evitar re-renderizações inúteis
    if ((prev || '') === (tid || '') && String(window.location.href) === String(url.toString())) return
    window.history.replaceState({}, '', url.toString())
    try {
      window.dispatchEvent(new CustomEvent('chatweb:thread_id_changed', { detail: { thread_id: tid || null } }))
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function FormattedText({ text }: { text: string }) {
  // Interpreta *texto* como <strong>texto</strong> (formatação simples).
  // Regras:
  // - Só aplica quando encontra pares de '*'
  // - Se não houver par, mantém literal
  // - Não usa HTML (evita XSS)
  const nodes: React.ReactNode[] = []
  let i = 0
  let k = 0
  while (i < text.length) {
    const start = text.indexOf('*', i)
    if (start === -1) {
      const tail = text.slice(i)
      if (tail) nodes.push(<span key={`t_${k++}`}>{tail}</span>)
      break
    }
    const end = text.indexOf('*', start + 1)
    if (end === -1) {
      const tail = text.slice(i)
      if (tail) nodes.push(<span key={`t_${k++}`}>{tail}</span>)
      break
    }

    const before = text.slice(i, start)
    if (before) nodes.push(<span key={`t_${k++}`}>{before}</span>)

    const content = text.slice(start + 1, end)
    if (content.trim().length === 0) {
      // Mantém literal para não “sumir” com asteriscos vazios
      nodes.push(<span key={`t_${k++}`}>{text.slice(start, end + 1)}</span>)
    } else {
      nodes.push(<strong key={`b_${k++}`}>{content}</strong>)
    }
    i = end + 1
  }
  return <>{nodes}</>
}

function MessageContent({ items }: { items: DisparoAnswerItem[] }) {
  return (
    <div className="msgContent">
      {items.map((it, i) => {
        if (!it || typeof it !== 'object') return null
        const t = (it as { type?: string }).type
        if (t === 'text') {
          const msg = (it as { message?: string }).message
          if (typeof msg === 'string' && msg) {
            const parsedItems = tryParseDisparoItemsFromText(msg)
            if (parsedItems?.length) return <MessageContent key={i} items={parsedItems} />
            return (
              <div key={i} className="msgContentItem">
                <FormattedText text={msg} />
              </div>
            )
          }
          return null
        }
        if (t === 'cta_url') {
          const url = (it as { url?: string }).url
          const msg = (it as { message?: string }).message
          const redirectUrl = typeof window !== 'undefined' ? window.location.href : ''
          const href = redirectUrl && typeof url === 'string' && url ? withRedirectUrlParam(url, redirectUrl) : url
          const display = (it as { display?: string }).display || 'Abrir link'
          if (typeof href === 'string' && href) {
            return (
              <div key={i} className="msgContentItem">
                {typeof msg === 'string' && msg.trim() ? (
                  <div style={{ marginBottom: 8 }}>
                    <FormattedText text={msg} />
                  </div>
                ) : null}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="msgCtaBtn"
                  onClick={(e) => e.stopPropagation()}
                >
                  {display}
                </a>
              </div>
            )
          }
        }
        try {
          return <div key={i} className="msgContentItem">{JSON.stringify(it, null, 2)}</div>
        } catch {
          return null
        }
      })}
    </div>
  )
}

function itemsToRenderableText(items: DisparoAnswerItem[]): string {
  if (!items.length) return ''
  const parts: string[] = []
  for (const it of items) {
    if (it && typeof it === 'object' && (it as any).type === 'text' && typeof (it as any).message === 'string') {
      parts.push((it as any).message)
    } else {
      try {
        parts.push(JSON.stringify(it, null, 2))
      } catch {
        parts.push(String(it))
      }
    }
  }
  return parts.join('\n\n').trim()
}

function formatHms(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatSeconds(ms: number): string {
  const s = ms / 1000
  if (!Number.isFinite(s) || s < 0) return '0.00'
  return s.toFixed(2)
}

function formatDeltaFromPrev(curMs: number, prevMs: number | null): string | null {
  if (prevMs == null) return null
  const d = curMs - prevMs
  if (!Number.isFinite(d) || d <= 0) return null
  return `${formatSeconds(d)}s`
}

type ConversationContext = {
  assistantId?: string
  customerId?: string
  companyId?: string
  threadId?: string
  platform?: string
  assistantExternalId?: string
  threadAssistantExternalId?: string
}

function getString(obj: any, key: string): string | undefined {
  try {
    const v = obj?.[key]
    if (v == null) return undefined
    return typeof v === 'string' ? v : String(v)
  } catch {
    return undefined
  }
}

function extractConversationContextFromResponseJson(json: unknown): ConversationContext | null {
  if (!json || typeof json !== 'object') return null
  const root: any = json
  const data: any = root.data
  if (!data || typeof data !== 'object') return null

  const ctx: ConversationContext = {
    assistantId: getString(data, 'assistant_id') || getString(data, 'thread_current_assistant_id'),
    customerId: getString(data, 'customer_id'),
    companyId: getString(data, 'company_id'),
    threadId: getString(data, 'thread_id'),
    platform: (getString(data, 'platform') || '').toLowerCase() || undefined,
    assistantExternalId: getString(data, 'external_id'),
    threadAssistantExternalId: getString(data, 'thread_assistant_external_id'),
  }

  const hasAny = Boolean(
    ctx.assistantId ||
      ctx.customerId ||
      ctx.companyId ||
      ctx.platform ||
      ctx.assistantExternalId ||
      ctx.threadAssistantExternalId,
  )
  return hasAny ? ctx : null
}

function extractOpenMessagesFromSteps(rawResponse: unknown): Array<{ text: string; createdAt: number }> {
  try {
    const steps = (rawResponse as any)?.steps
    if (!Array.isArray(steps)) return []
    const out: Array<{ text: string; createdAt: number }> = []
    for (const s of steps) {
      const name = typeof s?.name === 'string' ? s.name : ''
      if (!name.startsWith('tool_open_message.') && !name.startsWith('assistant_open_message.')) continue
      const msg = s?.request?.message
      if (typeof msg === 'string' && msg.trim()) {
        const startIso = typeof s?.start === 'string' ? s.start : ''
        const ms = startIso ? Date.parse(startIso) : NaN
        out.push({ text: msg.trim(), createdAt: Number.isFinite(ms) ? ms : Date.now() })
      }
    }
    // garantir ordem cronológica (mais antigo -> mais novo)
    out.sort((a, b) => a.createdAt - b.createdAt)
    return out
  } catch {
    return []
  }
}

export default function Chat({ settings, onReset }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uuid(),
      role: 'system',
      text:
        'Conversa iniciada. Envie uma mensagem para o ai-framework (provider: simple).',
      createdAt: Date.now(),
    },
  ])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ title: string; value: unknown } | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [loadedThreadId, setLoadedThreadId] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const suppressNextUrlSyncRef = useRef(false)
  const sseRef = useRef<EventSource | null>(null)
  const lastOpenMsgRef = useRef<{ threadId: string; text: string; ts: number } | null>(null)

  function resetConversation(systemText?: string) {
    const now = Date.now()
    setMessages([
      {
        id: uuid(),
        role: 'system',
        text:
          systemText ||
          'Conversa iniciada. Envie uma mensagem para o ai-framework (provider: simple).',
        createdAt: now,
      },
    ])
    setSelectedId(null)
    setInspected(null)
    setInspectError(null)
    setError(null)
  }

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  const headerMeta = useMemo(() => {
    const base = (settings.apiBaseUrl || '').trim()
    const apiEnv = base && base.includes('api.zibb.com.br') ? 'PROD' : 'DEV'
    return {
      companyId: settings.companyId,
      customerPhone: settings.customerPhone,
      customerName: settings.customerName,
      apiEnv,
    }
  }, [settings])

  async function onSend() {
    const text = draft.trim()
    if (!text || loading) return
    setDraft('')
    setError(null)

    const prevThreadId = getThreadIdFromLocation()

    const sentAt = Date.now()
    const userMsg: ChatMessage = { id: uuid(), role: 'user', text, createdAt: sentAt }
    setMessages((prev) => [...prev, userMsg])
    setSelectedId(userMsg.id)

    setLoading(true)
    try {
      const res = await sendMessage(settings, text)
      const { answerItems, answerText, raw, status, ok, request, rawText, timingMs } = res
      const assistantText = (itemsToRenderableText(answerItems) || answerText || '').trim() || '[sem resposta]'

      const receivedAt = Date.now()
      const measuredTimingMs = Number.isFinite(timingMs) && timingMs > 0 ? timingMs : receivedAt - sentAt
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        text: assistantText,
        createdAt: receivedAt,
        answerItems,
        trace: {
          request: { url: request.url, method: 'POST', payload: request.payload },
          response: { status, ok, json: raw, rawText },
          timingMs: measuredTimingMs,
        },
      }

      // Se houve "open_message" durante tools, mas o SSE ainda não estava conectado,
      // reexibe essas mensagens no chat com base no array "steps" da resposta.
      const openEvents = extractOpenMessagesFromSteps(raw)
      const openMsgs: ChatMessage[] = []
      if (openEvents.length) {
        const tidForDedup = (extractConversationContextFromResponseJson(raw)?.threadId || prevThreadId || '').trim()
        const now = Date.now()
        for (const ev of openEvents) {
          const t = ev.text
          const ts = typeof ev.createdAt === 'number' && Number.isFinite(ev.createdAt) ? ev.createdAt : now
          // dedup simples (evita repetir em refresh/retry rápido)
          const last = lastOpenMsgRef.current
          if (
            last &&
            last.threadId === tidForDedup &&
            last.text === t &&
            (now - last.ts < 10_000 || Math.abs(ts - last.ts) < 10_000)
          ) {
            continue
          }
          lastOpenMsgRef.current = { threadId: tidForDedup, text: t, ts }
          openMsgs.push({ id: uuid(), role: 'assistant', text: t, createdAt: ts })
        }
      }

      // 1) Comandos especiais (#close/#delete-user): limpar conversa e "sair" da thread atual.
      try {
        const cmd = String((raw as any)?.data?.command || '').trim().toLowerCase()
        const action = String((raw as any)?.data?.action || '').trim().toLowerCase()
        if (cmd === '#close' || cmd === '#delete-user' || action === 'close_threads' || action === 'delete_user') {
          suppressNextUrlSyncRef.current = true
          setThreadIdInLocation(null)
          setLoadedThreadId(null)
          setMessages([
            {
              id: uuid(),
              role: 'system',
              text: 'Conversa encerrada. Você já pode iniciar uma nova conversa.',
              createdAt: Date.now(),
            },
            userMsg,
            ...openMsgs,
            assistantMsg,
          ])
          setSelectedId(assistantMsg.id)
          setInspected(null)
          setInspectError(null)
          return
        }
      } catch {
        // ignore
      }

      // 2) Persistir thread_id na URL; se mudou, limpar histórico anterior e carregar histórico da nova thread.
      try {
        const ctx = extractConversationContextFromResponseJson(raw)
        const nextThreadId = (ctx?.threadId || '').trim() || null
        if (nextThreadId) {
          if (prevThreadId && prevThreadId !== nextThreadId) {
            // Troca de thread: limpa o histórico anterior, mas mantém o trace real desta requisição.
            suppressNextUrlSyncRef.current = true
            setThreadIdInLocation(nextThreadId)
            setLoadedThreadId(nextThreadId)
            setMessages([
              {
                id: uuid(),
                role: 'system',
                text: `Thread: ${nextThreadId}`,
                createdAt: Date.now(),
              },
              userMsg,
              ...openMsgs,
              assistantMsg,
            ])
            setSelectedId(assistantMsg.id)
            setInspected(null)
            setInspectError(null)
            return
          }
          suppressNextUrlSyncRef.current = true
          setThreadIdInLocation(nextThreadId)
          setLoadedThreadId(nextThreadId)
        }
      } catch {
        // ignore
      }
      setMessages((prev) => [...prev, ...openMsgs, assistantMsg])
      setSelectedId(assistantMsg.id)
      setInspected(null)
      setInspectError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(msg)
      const anyErr = e as any
      const status = typeof anyErr?.status === 'number' ? anyErr.status : 0
      const raw = anyErr?.response
      const rawText = typeof anyErr?.rawText === 'string' ? anyErr.rawText : null
      const receivedAt = Date.now()
      const measuredTimingMs = receivedAt - sentAt
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        text: `Erro ao chamar o backend: ${msg}`,
        createdAt: receivedAt,
        trace: {
          request: {
            url: anyErr?.request?.url || '(desconhecido)',
            method: 'POST',
            payload: anyErr?.request?.payload || { message: text, customer_phone: settings.customerPhone },
          },
          response: {
            status,
            ok: false,
            json: raw ?? null,
            rawText,
          },
          timingMs: measuredTimingMs,
        },
      }
      setMessages((prev) => [...prev, assistantMsg])
      setSelectedId(assistantMsg.id)
      setInspected(null)
    } finally {
      setLoading(false)
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void onSend()
    }
  }

  const selected = useMemo(() => messages.find((m) => m.id === selectedId) || null, [messages, selectedId])

  const traceValue = useMemo(() => {
    if (!selected?.trace) return null
    return selected.trace
  }, [selected])

  function buildApiUrl(path: string): string {
    const base = (settings.apiBaseUrl || '').trim().replace(/\/+$/, '')
    if (!base) return path.startsWith('/') ? path : `/${path}`
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
  }

  function parseDateToMs(v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const ms = Date.parse(v)
      if (Number.isFinite(ms)) return ms
    }
    return Date.now()
  }

  function buildSyntheticTraceFromThreadMessage(thread: any, row: any, timingMs: number) {
    try {
      const ta = row?.thread_assistant || null
      const asst = ta?.assistant || null
      const payload = {
        success: true,
        provider: 'simple',
        data: {
          assistant_id: ta?.assistant_id ?? undefined,
          thread_current_assistant_id: ta?.assistant_id ?? undefined,
          customer_id: thread?.customer_id ?? undefined,
          company_id: thread?.company_id ?? undefined,
          thread_id: thread?.id ?? undefined,
          platform: asst?.platform ?? undefined,
          external_id: asst?.external_id ?? undefined,
          thread_assistant_external_id: ta?.external_id ?? undefined,
        },
      }
      return {
        request: {
          url: buildApiUrl(`/v1/threads/${encodeURIComponent(String(thread?.id || ''))}/messages`),
          method: 'POST' as const,
          payload: {},
        },
        response: {
          status: 200,
          ok: true,
          json: payload,
          rawText: null,
        },
        timingMs,
      }
    } catch {
      return undefined
    }
  }

  async function loadThreadToChat(threadId: string) {
    const tid = (threadId || '').trim()
    if (!tid) return
    if (inspectLoading) return
    setInspectLoading(true)
    setInspectError(null)
    setError(null)
    try {
      const url = buildApiUrl(`/v1/threads/${encodeURIComponent(tid)}/messages`)
      const resp = await fetch(url)
      const text = await resp.text()
      const json = text ? JSON.parse(text) : null
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }

      const thread = (json as any)?.thread
      const rows = ((json as any)?.messages || []) as any[]

      const nextMessages: ChatMessage[] = [
        {
          id: uuid(),
          role: 'system',
          text: `Thread carregada: ${tid}`,
          createdAt: Date.now(),
        },
      ]

      for (const row of rows) {
        const createdAt = parseDateToMs(row?.created_at)
        const repliedAt = row?.replied_at != null ? parseDateToMs(row?.replied_at) : null
        const input = row?.input
        const output = row?.output

        if (typeof input === 'string' && input.trim()) {
          nextMessages.push({
            id: uuid(),
            role: 'user',
            text: input,
            createdAt,
          })
        }

        if (typeof output === 'string' && output.trim()) {
          const timingMs = repliedAt != null ? Math.max(0, repliedAt - createdAt) : 0
          nextMessages.push({
            id: uuid(),
            role: 'assistant',
            text: output,
            createdAt: repliedAt ?? createdAt,
            trace: buildSyntheticTraceFromThreadMessage(thread, row, timingMs),
          })
        }
      }

      setMessages(nextMessages)
      setSelectedId(nextMessages[nextMessages.length - 1]?.id || null)
      setInspected(null)
      setLoadedThreadId(tid)
      setThreadIdInLocation(tid)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar thread'
      setInspectError(msg)
      setInspected({ title: `threads: ${tid}`, value: { error: msg } })
    } finally {
      setInspectLoading(false)
    }
  }

  async function inspectAssistant() {
    if (!activeCtx?.assistantId) return
    setInspectLoading(true)
    setInspectError(null)
    try {
      const url = buildApiUrl(`/v1/assistants/${encodeURIComponent(activeCtx.assistantId)}`)
      const resp = await fetch(url)
      const text = await resp.text()
      const json = text ? JSON.parse(text) : null
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }
      setInspected({ title: `assistants: ${activeCtx.assistantId}`, value: json })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar assistant'
      setInspectError(msg)
      setInspected({ title: `assistants: ${activeCtx.assistantId}`, value: { error: msg } })
    } finally {
      setInspectLoading(false)
    }
  }

  async function inspectCustomer() {
    if (!activeCtx?.customerId) return
    setInspectLoading(true)
    setInspectError(null)
    try {
      const url = buildApiUrl(`/v1/customers/${encodeURIComponent(activeCtx.customerId)}`)
      const resp = await fetch(url)
      const text = await resp.text()
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = { raw: text }
      }
      setInspected({ title: `customers: ${activeCtx.customerId}`, value: json })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar customer'
      setInspectError(msg)
      setInspected({ title: `customers: ${activeCtx.customerId}`, value: { error: msg } })
    } finally {
      setInspectLoading(false)
    }
  }

  async function inspectCompany() {
    const cid = activeCtx?.companyId || settings.companyId
    if (!cid) return
    setInspectLoading(true)
    setInspectError(null)
    try {
      const url = buildApiUrl(`/v1/companies/${encodeURIComponent(cid)}`)
      const resp = await fetch(url)
      const text = await resp.text()
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text}`)
      }
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = { raw: text }
      }
      setInspected({ title: `companies: ${cid}`, value: json })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar company'
      setInspectError(msg)
      setInspected({ title: `companies: ${cid}`, value: { error: msg } })
    } finally {
      setInspectLoading(false)
    }
  }

  async function inspectThread() {
    const tid = activeCtx?.threadId || getThreadIdFromLocation()
    if (!tid) return
    await loadThreadToChat(tid)
  }

  const selectedIndex = useMemo(() => messages.findIndex((m) => m.id === selectedId), [messages, selectedId])

  const activeCtx = useMemo(() => {
    // Contexto deve refletir a mensagem selecionada (ou a mais próxima acima que tenha response.data)
    if (selectedIndex >= 0) {
      for (let i = selectedIndex; i >= 0; i--) {
        const m = messages[i]
        const j = m.trace?.response?.json
        const ctx = extractConversationContextFromResponseJson(j)
        if (ctx) return ctx
      }
    }
    // Fallback: último response conhecido
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      const j = m.trace?.response?.json
      const ctx = extractConversationContextFromResponseJson(j)
      if (ctx) return ctx
    }
    return null
  }, [messages, selectedIndex])

  useEffect(() => {
    function syncFromUrl() {
      if (suppressNextUrlSyncRef.current) {
        suppressNextUrlSyncRef.current = false
        return
      }
      const tid = getThreadIdFromLocation()
      if (!tid) {
        // Sem thread_id: iniciar conversa "limpa"
        setLoadedThreadId(null)
        resetConversation()
        return
      }
      if (loadedThreadId === tid) return
      resetConversation(`Carregando thread: ${tid}...`)
      void loadThreadToChat(tid)
    }

    // Inicial
    syncFromUrl()

    // Mudança por back/forward ou por replaceState (evento custom)
    window.addEventListener('popstate', syncFromUrl)
    window.addEventListener('chatweb:thread_id_changed', syncFromUrl as any)
    return () => {
      window.removeEventListener('popstate', syncFromUrl)
      window.removeEventListener('chatweb:thread_id_changed', syncFromUrl as any)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedThreadId, settings.apiBaseUrl])

  useEffect(() => {
    const tid = (loadedThreadId || getThreadIdFromLocation() || '').trim()

    // Close SSE if no thread
    if (!tid) {
      try {
        sseRef.current?.close()
      } catch {
        // ignore
      }
      sseRef.current = null
      return
    }

    // Reconnect only if thread changed
    const curUrl = (() => {
      const base = (settings.apiBaseUrl || '').trim().replace(/\/+$/, '')
      const path = `/v1/stream?session_id=${encodeURIComponent(tid)}`
      return base ? `${base}${path}` : path
    })()

    try {
      // Se já existe e está no mesmo thread, mantém
      // (EventSource não expõe url de forma consistente; guardamos pela nossa ref)
      sseRef.current?.close()
    } catch {
      // ignore
    }

    const es = new EventSource(curUrl)
    sseRef.current = es

    es.onmessage = (ev) => {
      try {
        const data = ev?.data
        if (typeof data !== 'string' || !data.trim()) return
        const msg = JSON.parse(data) as any
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'open_message' && typeof msg.text === 'string' && msg.text.trim()) {
          const text = msg.text.trim()
          const now = Date.now()
          const last = lastOpenMsgRef.current
          if (last && last.threadId === tid && last.text === text && now - last.ts < 5000) return
          lastOpenMsgRef.current = { threadId: tid, text, ts: now }
          setMessages((prev) => [
            ...prev,
            {
              id: uuid(),
              role: 'assistant',
              text,
              createdAt: now,
            },
          ])
        }
      } catch {
        // ignore
      }
    }

    es.onerror = () => {
      // EventSource faz retry automático; não spammar UI.
    }

    return () => {
      try {
        es.close()
      } catch {
        // ignore
      }
      if (sseRef.current === es) sseRef.current = null
    }
  }, [loadedThreadId, settings.apiBaseUrl])

  const openAiThreadUrl = useMemo(() => {
    if (!activeCtx) return null
    if ((activeCtx.platform || '').toLowerCase() !== 'openai') return null
    const asst = activeCtx.assistantExternalId
    const thread = activeCtx.threadAssistantExternalId
    if (!asst || !thread) return null
    return `https://platform.openai.com/assistants/edit?assistant=${encodeURIComponent(asst)}&thread=${encodeURIComponent(thread)}`
  }, [activeCtx])

  return (
    <div className="split">
      <div className="leftPane">
        <div className="content">
          <div className="chatWrap">
            <div className="messages" ref={listRef}>
              {messages.map((m, idx) => {
                const isSelected = m.id === selectedId
                const timeStr = formatHms(m.createdAt)
                const prev = idx > 0 ? messages[idx - 1] : null
                const deltaStr =
                  m.role === 'assistant' ? formatDeltaFromPrev(m.createdAt, prev?.createdAt ?? null) : null
                const latencyStr =
                  m.role === 'assistant' && m.trace ? ` (${formatSeconds(m.trace.timingMs)}s)` : ''
                return (
                  <div key={m.id} className={`bubbleRow ${m.role === 'user' ? 'user' : ''}`}>
                    <div>
                      <div
                        className={`bubble clickable ${isSelected ? 'selected' : ''} ${
                          m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : ''
                        }`}
                        onClick={() => {
                          setSelectedId(m.id)
                          setInspected(null)
                          setInspectError(null)
                        }}
                        title="Clique para ver detalhes à direita"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedId(m.id)
                            setInspected(null)
                            setInspectError(null)
                          }
                        }}
                      >
                        {m.role === 'assistant' ? (
                          m.answerItems?.length ? (
                            <MessageContent items={m.answerItems} />
                          ) : (() => {
                            const parsedItems = tryParseDisparoItemsFromText(m.text)
                            if (parsedItems?.length) return <MessageContent items={parsedItems} />
                            const parsed = tryParseCtaUrl(m.text)
                            return parsed ? <MessageContent items={[parsed]} /> : <FormattedText text={m.text} />
                          })()
                        ) : (
                          <FormattedText text={m.text} />
                        )}
                      </div>
                      <div className={`msgMeta ${m.role === 'user' ? 'user' : ''}`}>
                        {timeStr}
                        {deltaStr ? ` (${deltaStr})` : ''}
                        {m.role === 'assistant' ? latencyStr : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
              {loading ? (
                <div className="bubbleRow">
                  <div className="bubble assistant muted">IA pensando…</div>
                </div>
              ) : null}
            </div>

            <div className="composer">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter nova linha)"
              />
              <button className="btn primary" onClick={() => void onSend()} disabled={loading || !draft.trim()}>
                Enviar
              </button>
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="pill pillBtn" onClick={() => void inspectCompany()} disabled={inspectLoading}>
              company: {headerMeta.companyId}
            </button>
            <div className="pill">user: {headerMeta.customerPhone}</div>
            {headerMeta.customerName ? <div className="pill">nome: {headerMeta.customerName}</div> : null}
            <div className="pill">{headerMeta.apiEnv}</div>
            {activeCtx?.threadId ? (
              <button className="pill pillBtn" onClick={() => void inspectThread()} disabled={inspectLoading}>
                thread: {activeCtx.threadId}
              </button>
            ) : null}
            {activeCtx?.assistantId ? (
              <button className="pill pillBtn" onClick={() => void inspectAssistant()} disabled={inspectLoading}>
                Assistente: {activeCtx.assistantId}
              </button>
            ) : null}
            {activeCtx?.customerId ? (
              <button className="pill pillBtn" onClick={() => void inspectCustomer()} disabled={inspectLoading}>
                Customer: {activeCtx.customerId}
              </button>
            ) : null}
            {openAiThreadUrl ? (
              <a className="pill" href={openAiThreadUrl} target="_blank" rel="noreferrer">
                Thread OpenAi
              </a>
            ) : null}
            <div style={{ flex: 1 }} />
            <button className="btn danger" onClick={onReset} disabled={loading}>
              Trocar dados
            </button>
          </div>
        </div>
      </div>

      <div className="rightPane">
        <div className="panelHeader">
          <div className="panelHeaderTitle">{inspected ? `Detalhes (${inspected.title})` : 'Detalhes (request/response)'}</div>
        </div>
        <div className="panelBody">
          {inspectError ? <div className="error">{inspectError}</div> : null}
          {inspected ? (
            <JsonTree value={inspected.value} defaultExpandedDepth={3} />
          ) : !selected ? (
            <div className="selectHint">Selecione uma mensagem no chat.</div>
          ) : !traceValue ? (
            <div className="selectHint">
              Esta mensagem não tem trace de API. Clique numa mensagem de resposta (assistant) para ver o retorno bruto.
            </div>
          ) : (
            <JsonTree value={traceValue} defaultExpandedDepth={3} />
          )}
        </div>
      </div>
    </div>
  )
}

