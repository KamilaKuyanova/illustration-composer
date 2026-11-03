// Разбирает плоский SVG-экспорт из Figma ("Размер S") на отдельные объекты.
// В экспорте нет групп и имён слоёв, поэтому объекты выделяются по порядку путей:
// каждый объект — непрерывный диапазон элементов (проверено по bbox-кластеризации).
import fs from 'node:fs'
import { svgPathBbox } from 'svg-path-bbox'

const src = fs.readFileSync('source/S.svg', 'utf8')
const els = [...src.matchAll(/<(path|rect)\b([^>]*?)\/?>/g)].map((m, i) => ({ i, tag: m[0], kind: m[1], attrs: m[2] }))

const attr = (a, n) => a.match(new RegExp(String.raw`\s${n}="([^"]*)"`))?.[1]
function bbox(e) {
  if (e.kind === 'path') return svgPathBbox(attr(e.attrs, 'd'))
  const t = attr(e.attrs, 'transform')?.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/)
  const x = t ? +t[1] : +(attr(e.attrs, 'x') ?? 0), y = t ? +t[2] : +(attr(e.attrs, 'y') ?? 0)
  return [x, y, x + +attr(e.attrs, 'width'), y + +attr(e.attrs, 'height')]
}
els.forEach(e => (e.bb = bbox(e)))

// диапазоны индексов объектов (см. анализ кластеров): блок A и блок B, по 10 объектов
const RANGES = {
  A: [[2, 132], [312, 362], [363, 458], [459, 515], [516, 645], [646, 724], [725, 751], [752, 771], [772, 795], [796, 878]],
  B: [[133, 263], [879, 932], [933, 1087], [1088, 1144], [1145, 1280], [1281, 1364], [1365, 1391], [1392, 1413], [1414, 1437], [1438, 1523]],
}
const CFG = JSON.parse(fs.readFileSync("scripts/names.json", "utf8")); const NAMES = Object.assign([...CFG.names], { mainBlock: CFG.mainBlock })

function build(r) {
  const part = els.filter(e => e.i >= r[0] && e.i <= r[1])
  const good = part.filter(e => e.bb[2] - e.bb[0] > 0.01 || e.bb[3] - e.bb[1] > 0.01)
  const x0 = Math.min(...good.map(e => e.bb[0])), y0 = Math.min(...good.map(e => e.bb[1]))
  const x1 = Math.max(...good.map(e => e.bb[2])), y1 = Math.max(...good.map(e => e.bb[3]))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, count: part.length, svg: part.map(e => e.tag).join('') }
}

const objects = RANGES.A.map((ra, k) => {
  const a = build(ra), b = build(RANGES.B[k])
  return { id: `obj-${k + 1}`, ...(NAMES[k] ?? { name: `Объект ${k + 1}`, tags: [] }), variants: { [NAMES.mainBlock]: a, [NAMES.mainBlock === 'A' ? 'B' : 'A']: b } }
})
// "A"/"B" -> main/bg
const out = objects.map(o => ({
  id: o.id, name: o.name, tags: o.tags,
  main: o.variants[NAMES.mainBlock], bg: o.variants[NAMES.mainBlock === 'A' ? 'B' : 'A'],
}))
fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/library.json', JSON.stringify({ objects: out }))
console.log(out.map(o => `${o.id} ${o.name} main ${o.main.w | 0}x${o.main.h | 0} (${o.main.count}) bg ${o.bg.w | 0}x${o.bg.h | 0} (${o.bg.count})`).join('\n'))
