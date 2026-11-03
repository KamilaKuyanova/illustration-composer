import { FORMATS, newUid, type Composition, type Item } from './lib/compose'
import { SCHEMES } from './lib/palette'
import type { ObjState } from './lib/library'

export interface State {
  comp: Composition
  selected: string | null
  past: Composition[]
  future: Composition[]
}

export const initialState: State = {
  comp: { items: [], scale: 0.5, format: FORMATS[0], scheme: SCHEMES[0] },
  selected: null,
  past: [],
  future: [],
}

export type Action =
  | { type: 'replace'; comp: Composition }
  | { type: 'patch'; patch: Partial<Composition>; record?: boolean }
  | { type: 'add'; objId: string; state: ObjState; at: { x: number; y: number } }
  | { type: 'update'; uid: string; patch: Partial<Item>; record?: boolean }
  | { type: 'remove'; uid: string }
  | { type: 'duplicate'; uid: string }
  | { type: 'reorder'; uid: string; dir: 1 | -1 }
  | { type: 'select'; uid: string | null }
  | { type: 'begin' } // начало перетаскивания: запоминаем состояние для отмены
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }

const LIMIT = 60
const push = (s: State): Pick<State, 'past' | 'future'> => ({ past: [...s.past, s.comp].slice(-LIMIT), future: [] })

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'replace':
      return { ...s, ...push(s), comp: a.comp, selected: null }
    case 'patch':
      return { ...s, ...(a.record === false ? {} : push(s)), comp: { ...s.comp, ...a.patch } }
    case 'add': {
      const uid = newUid()
      const item: Item = { uid, objId: a.objId, state: a.state, x: a.at.x, y: a.at.y, rot: 0 }
      return { ...s, ...push(s), comp: { ...s.comp, items: [...s.comp.items, item] }, selected: uid }
    }
    case 'update':
      return {
        ...s,
        ...(a.record ? push(s) : {}),
        comp: { ...s.comp, items: s.comp.items.map(i => (i.uid === a.uid ? { ...i, ...a.patch } : i)) },
      }
    case 'remove':
      return {
        ...s,
        ...push(s),
        comp: { ...s.comp, items: s.comp.items.filter(i => i.uid !== a.uid) },
        selected: s.selected === a.uid ? null : s.selected,
      }
    case 'duplicate': {
      const src = s.comp.items.find(i => i.uid === a.uid)
      if (!src) return s
      const copy = { ...src, uid: newUid(), x: src.x + 30, y: src.y + 30 }
      const idx = s.comp.items.indexOf(src)
      const items = [...s.comp.items]
      items.splice(idx + 1, 0, copy)
      return { ...s, ...push(s), comp: { ...s.comp, items }, selected: copy.uid }
    }
    case 'reorder': {
      const items = [...s.comp.items]
      const i = items.findIndex(x => x.uid === a.uid)
      const j = i + a.dir
      if (i < 0 || j < 0 || j >= items.length) return s
      ;[items[i], items[j]] = [items[j], items[i]]
      return { ...s, ...push(s), comp: { ...s.comp, items } }
    }
    case 'select':
      return { ...s, selected: a.uid }
    case 'begin':
      return { ...s, ...push(s) }
    case 'undo': {
      const prev = s.past[s.past.length - 1]
      if (!prev) return s
      return { comp: prev, selected: null, past: s.past.slice(0, -1), future: [s.comp, ...s.future] }
    }
    case 'redo': {
      const next = s.future[0]
      if (!next) return s
      return { comp: next, selected: null, past: [...s.past, s.comp], future: s.future.slice(1) }
    }
    case 'clear':
      return { ...s, ...push(s), comp: { ...s.comp, items: [] }, selected: null }
  }
}
