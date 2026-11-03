// Разбирает плоский SVG-экспорт из Figma ("Размер S" и "Размер L") на отдельные объекты.
// В экспорте нет групп и имён слоёв, поэтому объекты выделяются по порядку путей:
// каждый объект — непрерывный диапазон элементов (границы найдены кластеризацией рамок
// и проверены глазами по галерее). Порядок объектов в таблицах совпадает с scripts/names.json.
import fs from 'node:fs'
import { svgPathBbox } from 'svg-path-bbox'

const attr = (a, n) => a.match(new RegExp(String.raw`\s${n}="([^"]*)"`))?.[1]

function parse(file) {
  const src = fs.readFileSync(file, 'utf8')
  const els = [...src.matchAll(/<(path|rect)\b([^>]*?)\/?>/g)].map((m, i) => ({ i, tag: m[0], kind: m[1], attrs: m[2] }))
  for (const e of els) {
    if (e.kind === 'path') e.bb = svgPathBbox(attr(e.attrs, 'd'))
    else {
      const t = attr(e.attrs, 'transform')?.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/)
      const x = t ? +t[1] : +(attr(e.attrs, 'x') ?? 0), y = t ? +t[2] : +(attr(e.attrs, 'y') ?? 0)
      e.bb = [x, y, x + +attr(e.attrs, 'width'), y + +attr(e.attrs, 'height')]
    }
  }
  return els
}

/** Объект = набор диапазонов индексов элементов (включительно). */
function build(els, ranges) {
  const part = els.filter(e => ranges.some(([a, b]) => e.i >= a && e.i <= b))
  const good = part.filter(e => e.bb[2] - e.bb[0] > 0.01 || e.bb[3] - e.bb[1] > 0.01)
  const x0 = Math.min(...good.map(e => e.bb[0])), y0 = Math.min(...good.map(e => e.bb[1]))
  const x1 = Math.max(...good.map(e => e.bb[2])), y1 = Math.max(...good.map(e => e.bb[3]))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, count: part.length, svg: part.map(e => e.tag).join('') }
}

// Порядок: цветы, блокнот, телефон, пазлы, монета, наушники, лампа, папка, ручка, кошелёк.
const SETS = {
  S: {
    file: 'source/S.svg',
    // верхний блок на листе — главные (цветные, с чёрным контуром), нижний — фоновые (монохромные)
    main: [[[2, 132]], [[312, 362]], [[363, 458]], [[459, 515]], [[516, 645]], [[646, 724]], [[725, 751]], [[752, 771]], [[772, 795]], [[796, 878]]],
    bg: [[[133, 263]], [[879, 932]], [[933, 1087]], [[1088, 1144]], [[1145, 1280]], [[1281, 1364]], [[1365, 1391]], [[1392, 1413]], [[1414, 1437]], [[1438, 1523]]],
  },
  L: {
    file: 'source/L.svg',
    // так же: верхний блок — главные (белые), нижний — фоновые (#D7CDF5)
    main: [[[1348, 1478]], [[164, 164], [166, 218]], [[272, 426]], [[26, 82]], [[1068, 1203]], [[582, 665]], [[750, 776]], [[1024, 1045]], [[976, 999]], [[804, 889]]],
    bg: [[[1479, 1609]], [[165, 165], [219, 271]], [[427, 581]], [[83, 139]], [[1204, 1339]], [[666, 749]], [[777, 803]], [[1046, 1067]], [[1000, 1023]], [[890, 975]]],
  },
}

const NAMES = JSON.parse(fs.readFileSync('scripts/names.json', 'utf8')).names
const sizes = {}
for (const [size, def] of Object.entries(SETS)) {
  const els = parse(def.file)
  sizes[size] = NAMES.map((_, k) => ({ main: build(els, def.main[k]), bg: build(els, def.bg[k]) }))
}

const out = NAMES.map((n, k) => ({
  id: `obj-${k + 1}`,
  name: n.name,
  tags: n.tags,
  sizes: { S: sizes.S[k], L: sizes.L[k] },
}))
fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/library.json', JSON.stringify({ objects: out }))
for (const o of out) {
  const f = v => `${v.w | 0}x${v.h | 0} (${v.count})`
  console.log(`${o.id} ${o.name}: S main ${f(o.sizes.S.main)} bg ${f(o.sizes.S.bg)} | L main ${f(o.sizes.L.main)} bg ${f(o.sizes.L.bg)}`)
}
