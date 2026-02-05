import { useMemo, useState } from 'react'

type Props = {
  value: unknown
  defaultExpandedDepth?: number
}

type NodeProps = {
  value: unknown
  depth: number
  defaultExpandedDepth: number
  keyLabel?: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b))
}

function renderPrimitive(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function getNamedArrayLabel(item: unknown, index: number): string {
  // Prefer "name" when item is an object with { name: string }
  try {
    if (isPlainObject(item)) {
      const nm = item.name
      if (typeof nm === 'string' && nm.trim()) return `[${nm.trim()}]`
      const id = item.id
      if (typeof id === 'string' && id.trim()) return `[${id.trim()}]`
    }
  } catch {
    // ignore
  }
  return `[${index}]`
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="jtCopySvg">
      <path
        d="M7.5 3H14.6C16.8402 3 17.9603 3 18.816 3.43597C19.5686 3.81947 20.1805 4.43139 20.564 5.18404C21 6.03969 21 7.15979 21 9.4V16.5M6.2 21H14.3C15.4201 21 15.9802 21 16.408 20.782C16.7843 20.5903 17.0903 20.2843 17.282 19.908C17.5 19.4802 17.5 18.9201 17.5 17.8V9.7C17.5 8.57989 17.5 8.01984 17.282 7.59202C17.0903 7.21569 16.7843 6.90973 16.408 6.71799C15.9802 6.5 15.4201 6.5 14.3 6.5H6.2C5.0799 6.5 4.51984 6.5 4.09202 6.71799C3.71569 6.90973 3.40973 7.21569 3.21799 7.59202C3 8.01984 3 8.57989 3 9.7V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.0799 21 6.2 21Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Node({ value, depth, defaultExpandedDepth, keyLabel }: NodeProps) {
  const expandable = Array.isArray(value) || isPlainObject(value)
  const [open, setOpen] = useState(() => depth < defaultExpandedDepth)
  const [copied, setCopied] = useState(false)

  const indentStyle = useMemo(() => ({ paddingLeft: `${depth * 14}px` }), [depth])

  async function handleCopy() {
    try {
      const text =
        typeof value === 'object' && value !== null
          ? JSON.stringify(value, null, 2)
          : typeof value === 'string'
            ? value
            : String(value)
      await copyToClipboard(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  // Primitive line
  if (!expandable) {
    return (
      <div className="jtLine jtLineWithCopy" style={indentStyle}>
        <span className="jtSpacer" />
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">{renderPrimitive(value)}</span>
        <button
          type="button"
          className="jtCopy"
          onClick={() => void handleCopy()}
          title="Copiar"
          aria-label="Copiar"
        >
          {copied ? '✓' : <CopyIcon />}
        </button>
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const openCh = isArr ? '[' : '{'
  const closeCh = isArr ? ']' : '}'
  const count = isArr ? value.length : Object.keys(value).length

  // Collapsed line
  if (!open) {
    return (
      <div className="jtLine jtLineWithCopy" style={indentStyle}>
        <button
          className="jtToggleInline"
          onClick={() => setOpen(true)}
          aria-label="Expandir"
          title="Expandir"
        >
          ▸
        </button>
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">
          {openCh}…{closeCh} <span className="jtDim">({count})</span>
        </span>
        <button
          type="button"
          className="jtCopy"
          onClick={(e) => {
            e.stopPropagation()
            void handleCopy()
          }}
          title="Copiar bloco"
          aria-label="Copiar bloco"
        >
          {copied ? '✓' : <CopyIcon />}
        </button>
      </div>
    )
  }

  // Expanded
  const entries: Array<{ key: string; value: unknown; label: string }> = isArr
    ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v, label: getNamedArrayLabel(v, i) }))
    : sortKeys(Object.keys(value as Record<string, unknown>)).map((k) => ({
        key: k,
        value: (value as any)[k],
        label: k,
      }))

  return (
    <div className="jtBlock">
      <div className="jtLine jtLineWithCopy" style={indentStyle}>
        <button
          className="jtToggleInline"
          onClick={() => setOpen(false)}
          aria-label="Recolher"
          title="Recolher"
        >
          ▾
        </button>
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">{openCh}</span>
        <button
          type="button"
          className="jtCopy"
          onClick={() => void handleCopy()}
          title="Copiar bloco"
          aria-label="Copiar bloco"
        >
          {copied ? '✓' : <CopyIcon />}
        </button>
      </div>

      {entries.map((e) => (
        <Node
          key={`${depth}-${e.key}`}
          value={e.value}
          depth={depth + 1}
          defaultExpandedDepth={defaultExpandedDepth}
          keyLabel={e.label}
        />
      ))}

      <div className="jtLine" style={indentStyle}>
        <span className="jtSpacer" />
        <span className="jtValue">{closeCh}</span>
      </div>
    </div>
  )
}

export default function JsonTree({ value, defaultExpandedDepth = 2 }: Props) {
  return <Node value={value} depth={0} defaultExpandedDepth={defaultExpandedDepth} />
}

