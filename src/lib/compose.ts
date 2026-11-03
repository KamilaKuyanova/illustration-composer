import { recolor, type Scheme } from './palette'
import type { LibObject, Library, ObjState, Variant } from './library'

export interface Format {
  id: string
  name: string
  w: number
  h: number
}

export const FORMATS: Format[] = [
  { id: 'og', name: '1200×630 · превью', w: 1200, h: 630 },
  { id: 'sq', name: '1080×1080 · квадрат', w: 1080, h: 1080 },
  { id: 'portrait', name: '1080×1350 · вертикаль', w: 1080, h: 1350 },
  { id: 'wide', name: '1920×1080 · широкий', w: 1920, h: 1080 },
]

/** Экземпляр объекта на холсте: копия библиотечного объекта без изменений формы. x, y — центр. */
export interface Item {
  uid: string
  objId: string
  state: ObjState
  x: number
  y: number
  rot: number
}

export interface Composition {
  items: Item[] // порядок массива = порядок слоёв, последний — сверху
  /** Один масштаб на всю композицию: пропорции объектов относительно друг друга не меняются. */
  scale: number
  format: Format
  scheme: Scheme
}

let counter = 0
export const newUid = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`

export const variantOf = (lib: Library, it: Pick<Item, 'objId' | 'state'>): Variant =>
  lib.byId.get(it.objId)![it.state]

export const itemTransform = (it: Item, v: Variant, scale: number) =>
  `translate(${r(it.x)} ${r(it.y)}) rotate(${r(it.rot)}) scale(${r(scale, 4)}) translate(${r(-(v.x + v.w / 2))} ${r(-(v.y + v.h / 2))})`

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** Рамка экземпляра на холсте (с учётом масштаба; поворот не учитывается). */
export function itemSize(v: Variant, scale: number) {
  return { w: v.w * scale, h: v.h * scale }
}

// ---- автосборка -----------------------------------------------------------

/**
 * Раскладывает объекты по сетке кадра. Масштаб общий для всех: самый крупный объект
 * вписывается в свою ячейку, остальные сохраняют реальное соотношение размеров.
 * `mains` — сколько первых объектов сделать «главными» (остальные — фоновые).
 */
export function autoCompose(
  objs: LibObject[],
  format: Format,
  scheme: Scheme,
  mains = Math.max(1, Math.ceil(objs.length / 2)),
): Composition {
  const n = objs.length
  const landscape = format.w >= format.h
  const cols = n <= 1 ? 1 : landscape ? Math.ceil(Math.sqrt((n * format.w) / format.h)) : Math.max(1, Math.round(Math.sqrt(n / 2)))
  const rowObjs: LibObject[][] = []
  for (let i = 0; i < n; i += cols) rowObjs.push(objs.slice(i, i + cols))

  // общий масштаб: ряды целиком должны поместиться в кадр с полями и зазорами
  const gap = format.w * 0.03
  const fill = 0.9
  const sumW = rowObjs.map(r => r.reduce((a, o) => a + o.main.w, 0))
  const maxH = rowObjs.map(r => Math.max(...r.map(o => o.main.h)))
  let scale = ((format.h * fill - gap * (rowObjs.length - 1)) / maxH.reduce((a, b) => a + b, 0))
  rowObjs.forEach((r, i) => (scale = Math.min(scale, (format.w * fill - gap * (r.length - 1)) / sumW[i])))
  scale = Math.min(scale, 1.6)

  const totalH = maxH.reduce((a, b) => a + b * scale, 0) + gap * (rowObjs.length - 1)
  let y = (format.h - totalH) / 2
  const items: Item[] = []
  rowObjs.forEach((r, ri) => {
    const rowW = sumW[ri] * scale + gap * (r.length - 1)
    let x = (format.w - rowW) / 2
    const rowH = maxH[ri] * scale
    for (const o of r) {
      const idx = items.length
      items.push({
        uid: newUid(),
        objId: o.id,
        state: idx < mains ? 'main' : 'bg',
        x: x + (o.main.w * scale) / 2,
        y: y + rowH / 2,
        rot: 0,
      })
      x += o.main.w * scale + gap
    }
    y += rowH + gap
  })
  return { items, scale, format, scheme }
}

/** Главные объекты поверх фоновых, как в образцах. */
export const sortByDepth = (items: Item[]) => [...items].sort((a, b) => +(a.state === 'main') - +(b.state === 'main'))

// ---- экспорт --------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Итоговый SVG: векторный, каждый объект — отдельная группа с именем и id,
 * внутри — исходные path без изменений (кроме перекраски по схеме).
 */
export function exportSvg(lib: Library, comp: Composition): string {
  const { format, scheme, scale } = comp
  const groups = comp.items
    .map((it, i) => {
      const obj = lib.byId.get(it.objId)!
      const v = obj[it.state]
      return (
        `<g id="${esc(obj.name)}-${i + 1}" data-name="${esc(obj.name)}" data-state="${it.state === 'main' ? 'главный' : 'фоновый'}" ` +
        `transform="${itemTransform(it, v, scale)}">${recolor(v.svg, scheme)}</g>`
      )
    })
    .join('\n')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${format.w}" height="${format.h}" viewBox="0 0 ${format.w} ${format.h}" fill="none">\n` +
    `<rect id="background" width="${format.w}" height="${format.h}" fill="${scheme.light}"/>\n${groups}\n</svg>\n`
  )
}
