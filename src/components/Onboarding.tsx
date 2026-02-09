import { useEffect, useMemo, useState } from 'react'
import type { ChatSettings } from '../types'

type Props = {
  initial?: ChatSettings | null
  onStart: (settings: ChatSettings) => void
}

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, '')
}

type CompanyOption = { id: string; name: string | null }

const API_OPTIONS = [
  // DEV usa proxy do Vite (evita CORS). O proxy aponta para http://0.0.0.0:8008
  { id: 'DEV', label: 'DEV', baseUrl: '' },
  { id: 'PROD', label: 'PROD', baseUrl: 'https://api.zibb.com.br' },
] as const

export default function Onboarding({ initial, onStart }: Props) {
  const initialApi = useMemo(() => {
    const saved = (initial?.apiBaseUrl || '').trim()
    if (!saved) return 'DEV'
    if (saved.includes('api.zibb.com.br')) return 'PROD'
    return 'DEV'
  }, [initial?.apiBaseUrl])

  const [apiEnv, setApiEnv] = useState<'DEV' | 'PROD'>(initialApi)
  const [companyId, setCompanyId] = useState(initial?.companyId ?? '')
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? '')
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')

  const apiBaseUrl = useMemo(() => {
    const opt = API_OPTIONS.find((o) => o.id === apiEnv)
    return opt?.baseUrl ?? API_OPTIONS[0].baseUrl
  }, [apiEnv])

  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [companiesError, setCompaniesError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setCompaniesLoading(true)
      setCompaniesError(null)
      try {
        const base = (apiBaseUrl || '').trim().replace(/\/+$/, '')
        const url = base ? `${base}/v1/companies` : `/v1/companies`
        const resp = await fetch(url)
        const text = await resp.text()
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`)
        const json = JSON.parse(text) as CompanyOption[]
        if (cancelled) return
        setCompanies(Array.isArray(json) ? json : [])
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Erro ao carregar companies'
        setCompaniesError(msg)
        setCompanies([])
      } finally {
        if (!cancelled) setCompaniesLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [apiBaseUrl])

  const canStart = useMemo(() => {
    return companyId.trim().length > 0 && normalizeDigits(customerPhone).length >= 8
  }, [companyId, customerPhone])

  function setThreadIdInLocation(threadId: string | null) {
    try {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      if (threadId && threadId.trim()) url.searchParams.set('thread_id', threadId.trim())
      else url.searchParams.delete('thread_id')
      if (url.searchParams.has('threadId')) url.searchParams.delete('threadId')
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore
    }
  }

  async function resolveOpenThreadId(): Promise<string | null> {
    const cid = companyId.trim()
    const phone = normalizeDigits(customerPhone)
    if (!cid || !phone) return null
    const base = (apiBaseUrl || '').trim().replace(/\/+$/, '')
    const url = base ? `${base}/v1/threads/open?company_id=${encodeURIComponent(cid)}&customer_phone=${encodeURIComponent(phone)}` :
      `/v1/threads/open?company_id=${encodeURIComponent(cid)}&customer_phone=${encodeURIComponent(phone)}`
    const resp = await fetch(url)
    const text = await resp.text()
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`)
    const json = text ? (JSON.parse(text) as any) : null
    const tid = (json?.thread_id || '').trim()
    return tid || null
  }

  return (
    <div className="content">
      <div className="grid">
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Abrir conversa</div>
          <div className="helper">
            Preencha os dados mínimos para o `simple` do `ai-framework`.
          </div>
        </div>

        <div className="grid two">
          <div className="field">
            <label>API</label>
            <select value={apiEnv} onChange={(e) => setApiEnv(e.target.value as 'DEV' | 'PROD')}>
              {API_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} ({o.baseUrl || 'proxy → http://0.0.0.0:8008'})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={companiesLoading || companies.length === 0}
            >
              <option value="" disabled>
                {companiesLoading
                  ? 'Carregando...'
                  : companies.length
                    ? 'Selecione a company'
                    : 'Sem companies (verifique API)'}
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || '(sem nome)'} — {c.id}
                </option>
              ))}
            </select>
            {companiesError ? <div className="helper" style={{ color: 'rgba(255,255,255,0.8)' }}>{companiesError}</div> : null}
          </div>
        </div>

        <div className="grid two">
          <div className="field">
            <label>Telefone do usuário (somente dígitos)</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(normalizeDigits(e.target.value))}
              placeholder="ex: 5511999999999"
              autoComplete="off"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="grid two">
          <div className="field">
            <label>Nome do usuário (opcional)</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="ex: Victor"
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn primary"
            disabled={!canStart || starting}
            onClick={async () => {
              setStarting(true)
              setStartError(null)
              try {
                const tid = await resolveOpenThreadId()
                setThreadIdInLocation(tid)
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Erro ao resolver thread aberta'
                setStartError(msg)
                // Se falhar, ainda assim permite iniciar a conversa (sem thread_id)
                setThreadIdInLocation(null)
              } finally {
                setStarting(false)
              }

              onStart({
                companyId: companyId.trim(),
                customerPhone: normalizeDigits(customerPhone),
                customerName: customerName.trim() || undefined,
                apiBaseUrl,
              })
            }}
          >
            {starting ? 'Carregando…' : 'Iniciar conversa'}
          </button>
        </div>
        {startError ? <div className="helper" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 10 }}>{startError}</div> : null}
      </div>
    </div>
  )
}

