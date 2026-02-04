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
            disabled={!canStart}
            onClick={() =>
              onStart({
                companyId: companyId.trim(),
                customerPhone: normalizeDigits(customerPhone),
                customerName: customerName.trim() || undefined,
                apiBaseUrl,
              })
            }
          >
            Iniciar conversa
          </button>
        </div>
      </div>
    </div>
  )
}

