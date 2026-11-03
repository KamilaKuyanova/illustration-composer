import { useEffect, useReducer, useRef, useState } from 'react'
import { Art, Canvas } from './Canvas'
import { FORMATS, autoCompose, exportSvg, sortByDepth, switchSize, variantOf } from './lib/compose'
import { loadLibrary, matchObjects, parseNames, type LibObject, type Library, type ObjSize, type ObjState } from './lib/library'
import { SCHEMES, parsePalette, type Scheme } from './lib/palette'
import { parseSvgLibrary, withObjects } from './lib/customSvg'
import { initialState, reducer } from './state'
import './App.css'

const EXAMPLES = ['финансовая безопасность', 'идея для стартапа', 'обучение онлайн', 'командная работа над проектом']

function Thumb({ obj, state, scheme, size }: { obj: LibObject; state: ObjState; scheme: Scheme; size: ObjSize }) {
  const v = obj.sizes[size][state]
  return (
    <svg viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} className="thumb-svg" aria-hidden>
      <Art v={v} scheme={scheme} />
    </svg>
  )
}

export default function App() {
  const [lib, setLib] = useState<Library | null>(null)
  const [error, setError] = useState('')
  const [state, dispatch] = useReducer(reducer, initialState)
  const [metaphor, setMetaphor] = useState('')
  const [names, setNames] = useState('')
  const [note, setNote] = useState('')
  const [custom, setCustom] = useState<Scheme | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const { comp, selected } = state

  useEffect(() => {
    loadLibrary().then(setLib, e => setError(String(e.message ?? e)))
  }, [])

  // Стартовая композиция, чтобы холст не был пустым. Адрес может задать её сам:
  // ?q=метафора | ?names=телефон,лампа  &size=S|L  &scheme=violet|teal|peach  &format=og|sq|portrait|wide
  const started = useRef(false)
  useEffect(() => {
    if (!lib || started.current) return
    started.current = true
    const q = new URLSearchParams(location.search)
    const format = FORMATS.find(f => f.id === q.get('format')) ?? comp.format
    const scheme = SCHEMES.find(s => s.id === q.get('scheme')) ?? comp.scheme
    const size: ObjSize = q.get('size') === 'L' ? 'L' : 'S'
    let objs: LibObject[] = []
    if (q.get('q')) {
      setMetaphor(q.get('q')!)
      objs = matchObjects(lib, q.get('q')!).slice(0, 4).map(m => m.obj)
    } else if (q.get('names')) {
      setNames(q.get('names')!)
      objs = parseNames(lib, q.get('names')!).found
    }
    if (!objs.length) objs = ['Телефон', 'Пазлы', 'Монета', 'Лампа'].map(n => lib.objects.find(o => o.name === n)!)
    const c = autoCompose(objs, format, scheme, objs.length >= 4 ? 2 : Math.max(1, Math.ceil(objs.length / 2)), size)
    dispatch({ type: 'replace', comp: { ...c, items: sortByDepth(c.items) } })
  }, [lib, comp.format, comp.scheme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (mod && e.key.toLowerCase() === 'y') dispatch({ type: 'redo' })
      else if (!selected) return
      else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        dispatch({ type: 'duplicate', uid: selected })
      } else if (e.key === 'Delete' || e.key === 'Backspace') dispatch({ type: 'remove', uid: selected })
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const it = comp.items.find(i => i.uid === selected)
        if (!it) return
        const step = e.shiftKey ? 20 : 4
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        dispatch({ type: 'update', uid: selected, patch: { x: it.x + dx, y: it.y + dy } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, comp.items])

  if (error) return <p className="boot">{error}</p>
  if (!lib) return <p className="boot">Загрузка библиотеки…</p>

  const schemes = custom ? [...SCHEMES, custom] : SCHEMES

  const build = (objs: LibObject[], mains?: number) => {
    const c = autoCompose(objs, comp.format, comp.scheme, mains, comp.size)
    dispatch({ type: 'replace', comp: { ...c, items: sortByDepth(c.items) } })
  }

  const composeByMetaphor = (q = metaphor) => {
    const ranked = matchObjects(lib, q)
    if (!q.trim()) return setNote('Введите метафору или заголовок.')
    if (!ranked.length) {
      return setNote(`Ничего подходящего не нашлось. Попробуйте слова вроде: ${lib.objects.map(o => o.name.toLowerCase()).join(', ')}.`)
    }
    const top = ranked.slice(0, 4)
    build(top.map(m => m.obj), top.length >= 4 ? 2 : Math.min(2, Math.max(1, Math.ceil(top.length / 2))))
    setNote(`Подобрано: ${top.map(m => `${m.obj.name} (${[...new Set(m.hits)].join(', ') || 'название'})`).join(' · ')}. Первые — главные, остальные — фон.`)
  }

  const composeByNames = () => {
    const { found, unknown } = parseNames(lib, names)
    if (!found.length) return setNote('Не нашёл ни одного объекта с такими названиями. Доступны: ' + lib.objects.map(o => o.name.toLowerCase()).join(', ') + '.')
    build(found.slice(0, 8))
    setNote(`Собрано из: ${found.map(o => o.name).join(', ')}.` + (unknown.length ? ` Не найдено: ${unknown.join(', ')}.` : ''))
  }

  const addObj = (o: LibObject, st: ObjState) => {
    const n = comp.items.length
    dispatch({
      type: 'add',
      objId: o.id,
      state: st,
      at: { x: comp.format.w / 2 + (n % 5) * 24 - 48, y: comp.format.h / 2 + (n % 5) * 24 - 48 },
    })
  }

  const onPalette = async (file?: File) => {
    if (!file) return
    try {
      const s = parsePalette(await file.text(), file.name.replace(/\.[^.]+$/, ''))
      setCustom(s)
      dispatch({ type: 'patch', patch: { scheme: s } })
      setNote(`Палитра «${s.name}» применена: ${s.light}, ${s.mid}, ${s.dark}.`)
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const onLibrary = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      let next = lib
      let added = 0
      for (const f of files) {
        const objs = parseSvgLibrary(await f.text(), f.name, next.objects.length)
        next = withObjects(next, objs)
        added += objs.length
      }
      setLib(next)
      setNote(`В библиотеку добавлено объектов: ${added}. Их можно искать по названию (имя группы или файла).`)
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const download = () => {
    const blob = new Blob([exportSvg(lib, comp)], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `composition-${comp.format.w}x${comp.format.h}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sel = comp.items.find(i => i.uid === selected)
  const layers = [...comp.items].reverse()

  return (
    <div className="app">
      <header className="top">
        <h1>Сборщик иллюстраций</h1>
        <div className="top-actions">
          <button onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} title="Ctrl+Z">Отменить</button>
          <button onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} title="Ctrl+Shift+Z">Вернуть</button>
          <button onClick={() => dispatch({ type: 'clear' })} disabled={!comp.items.length}>Очистить</button>
          <button className="primary" onClick={download} disabled={!comp.items.length}>Скачать SVG</button>
        </div>
      </header>

      <aside className="left">
        <section>
          <h2>Сценарий 1 · по метафоре</h2>
          <textarea
            rows={2}
            placeholder="Заголовок или метафора, например: финансовая безопасность"
            value={metaphor}
            onChange={e => setMetaphor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), composeByMetaphor())}
          />
          <button className="primary" onClick={() => composeByMetaphor()}>Подобрать и собрать</button>
          <div className="chips">
            {EXAMPLES.map(x => (
              <button key={x} className="chip" onClick={() => (setMetaphor(x), composeByMetaphor(x))}>{x}</button>
            ))}
          </div>
        </section>

        <section>
          <h2>Сценарий 2 · по названиям</h2>
          <input
            placeholder="телефон, пазлы, монета"
            value={names}
            onChange={e => setNames(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && composeByNames()}
          />
          <button onClick={composeByNames}>Собрать</button>
        </section>

        {note && <p className="note" role="status">{note}</p>}

        <section>
          <h2>Библиотека · {lib.objects.length} объектов</h2>
          <label className="upload">
            Загрузить свои SVG
            <input type="file" accept=".svg,image/svg+xml" multiple onChange={e => (onLibrary(e.target.files), (e.target.value = ''))} />
          </label>
          <div className="lib">
            {lib.objects.map(o => (
              <div className="lib-card" key={o.id} style={{ background: comp.scheme.light }}>
                <Thumb obj={o} state="main" scheme={comp.scheme} size={comp.size} />
                <span>{o.name}</span>
                <div className="lib-btns">
                  <button onClick={() => addObj(o, 'main')} title="Добавить главный объект">главный</button>
                  <button onClick={() => addObj(o, 'bg')} title="Добавить фоновый объект">фоновый</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <label>Формат
            <select
              value={comp.format.id}
              onChange={e => {
                const f = FORMATS.find(x => x.id === e.target.value)!
                const kx = f.w / comp.format.w, ky = f.h / comp.format.h
                dispatch({
                  type: 'patch',
                  patch: {
                    format: f,
                    scale: comp.scale * Math.min(kx, ky),
                    items: comp.items.map(i => ({ ...i, x: i.x * kx, y: i.y * ky })),
                  },
                })
              }}
            >
              {FORMATS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label>Размер объектов
            <select value={comp.size} onChange={e => dispatch({ type: 'patch', patch: switchSize(lib, comp, e.target.value as ObjSize) })}>
              <option value="S">S · мелкие, упрощённые</option>
              <option value="L">L · крупные, с деталями</option>
            </select>
          </label>
          <label>Цвета
            <select
              value={comp.scheme.id}
              onChange={e => dispatch({ type: 'patch', patch: { scheme: schemes.find(s => s.id === e.target.value)! } })}
            >
              {schemes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="file">
            Загрузить палитру
            <input type="file" accept=".json,.txt,.css,.svg,.gpl,.csv" onChange={e => onPalette(e.target.files?.[0])} />
          </label>
          <label className="grow">Размер композиции
            <input
              type="range" min={0.1} max={3} step={0.01} value={comp.scale}
              onPointerDown={() => dispatch({ type: 'begin' })}
              onChange={e => dispatch({ type: 'patch', patch: { scale: +e.target.value }, record: false })}
            />
          </label>
        </div>
        <div className="canvas-wrap">
          <Canvas lib={lib} comp={comp} selected={selected} dispatch={dispatch} svgRef={svgRef} />
        </div>
        <p className="hint">Перетаскивайте объекты мышью. Стрелки — сдвиг, Delete — удалить, Ctrl+D — дубль. Пропорции объектов друг к другу фиксированы: масштабируется вся композиция целиком.</p>
      </main>

      <aside className="right">
        <section>
          <h2>Слои</h2>
          {!layers.length && <p className="muted">Пусто. Добавьте объекты из библиотеки или соберите композицию по сценарию.</p>}
          <ul className="layers">
            {layers.map(it => {
              const o = lib.byId.get(it.objId)!
              const lv = variantOf(lib, it, comp.size)
              return (
                <li key={it.uid} className={it.uid === selected ? 'on' : ''} onClick={() => dispatch({ type: 'select', uid: it.uid })}>
                  <svg style={{ background: comp.scheme.light }} viewBox={`${lv.x} ${lv.y} ${lv.w} ${lv.h}`}>
                    <Art v={lv} scheme={comp.scheme} />
                  </svg>
                  <span>{o.name}<small>{it.state === 'main' ? 'главный' : 'фоновый'}</small></span>
                </li>
              )
            })}
          </ul>
        </section>

        {sel && (
          <section>
            <h2>{lib.byId.get(sel.objId)!.name}</h2>
            <div className="seg">
              {(['main', 'bg'] as const).map(st => (
                <button
                  key={st}
                  className={sel.state === st ? 'on' : ''}
                  onClick={() => dispatch({ type: 'update', uid: sel.uid, patch: { state: st }, record: true })}
                >
                  {st === 'main' ? 'Главный' : 'Фоновый'}
                </button>
              ))}
            </div>
            <label className="row">Поворот {Math.round(sel.rot)}°
              <input
                type="range" min={-180} max={180} step={1} value={sel.rot}
                onPointerDown={() => dispatch({ type: 'begin' })}
                onChange={e => dispatch({ type: 'update', uid: sel.uid, patch: { rot: +e.target.value } })}
              />
            </label>
            <div className="btns">
              <button onClick={() => dispatch({ type: 'reorder', uid: sel.uid, dir: 1 })}>Выше</button>
              <button onClick={() => dispatch({ type: 'reorder', uid: sel.uid, dir: -1 })}>Ниже</button>
              <button onClick={() => dispatch({ type: 'duplicate', uid: sel.uid })}>Дублировать</button>
              <button className="danger" onClick={() => dispatch({ type: 'remove', uid: sel.uid })}>Удалить</button>
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}
