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

  const listRef = useRef<HTMLDivElement | null>(null)

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
        trace: {
          request: {
            url: request.url,
            method: 'POST',
            payload: request.payload,
          },
          response: {
            status,
            ok,
            json: raw,
            rawText,
          },
          timingMs: measuredTimingMs,
        },
      }
      setMessages((prev) => [...prev, assistantMsg])
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
    const tid = activeCtx?.threadId
    if (!tid) return
    setInspectLoading(true)
    setInspectError(null)
    try {
      const url = buildApiUrl(`/v1/threads/${encodeURIComponent(tid)}/messages`)
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
      setInspected({ title: `threads: ${tid}`, value: json })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar thread'
      setInspectError(msg)
      setInspected({ title: `threads: ${tid}`, value: { error: msg } })
    } finally {
      setInspectLoading(false)
    }
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

  const openAiThreadUrl = useMemo(() => {
    if (!activeCtx) return null
    if ((activeCtx.platform || '').toLowerCase() !== 'openai') return null
    const asst = activeCtx.assistantExternalId
    const thread = activeCtx.threadAssistantExternalId
    if (!asst || !thread) return null
    return `https://platform.openai.com/assistants/edit?assistant=${encodeURIComponent(asst)}&thread=${encodeURIComponent(thread)}`
  }, [activeCtx])

  async function copySelectedJson() {
    if (!traceValue) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(traceValue, null, 2))
    } catch {
      // ignore
    }
  }

  return (
    <div className="split">
      <div className="leftPane">
        <div className="content">
          <div className="chatWrap">
            <div className="messages" ref={listRef}>
              {messages.map((m) => {
                const isSelected = m.id === selectedId
                const timeStr = formatHms(m.createdAt)
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
                        {m.text}
                      </div>
                      <div className={`msgMeta ${m.role === 'user' ? 'user' : ''}`}>
                        {timeStr}
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
                disabled={loading}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void copySelectedJson()} disabled={!traceValue}>
              Copiar JSON
            </button>
          </div>
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

