export type ObjState = 'main' | 'bg'

/** Одно состояние объекта: исходные SVG-элементы без изменений + их рамка в координатах исходного файла. */
export interface Variant {
  x: number
  y: number
  w: number
  h: number
  count: number
  svg: string
}

export interface LibObject {
  id: string
  name: string
  tags: string[]
  main: Variant
  bg: Variant
}

export interface Library {
  objects: LibObject[]
  byId: Map<string, LibObject>
}

export async function loadLibrary(): Promise<Library> {
  const res = await fetch(`${import.meta.env.BASE_URL}library.json`)
  if (!res.ok) throw new Error(`Не удалось загрузить библиотеку: ${res.status}`)
  const { objects } = (await res.json()) as { objects: LibObject[] }
  return { objects, byId: new Map(objects.map(o => [o.id, o])) }
}

// ---- поиск по метафоре ----------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const words = (s: string) => norm(s).split(/[^a-zа-я0-9]+/).filter(w => w.length > 1)
const ENDINGS = /(ыми|ами|ого|его|ому|ему|ая|яя|ое|ее|ые|ие|ый|ий|ой|ом|ем|ах|ях|ов|ев|ей|ам|ям|а|я|у|ю|ы|и|о|е|ь|й)$/
/** Грубый стемминг: отбрасываем окончание и сравниваем по первым 5 буквам («идеи» = «идея»). */
const stem = (w: string) => {
  if (!/[а-я]/.test(w)) return w
  const cut = w.replace(ENDINGS, '')
  return (cut.length >= 3 ? cut : w).slice(0, 5)
}

export interface Match {
  obj: LibObject
  score: number
  hits: string[]
}

/** Оценивает, насколько каждый объект подходит заголовку/метафоре (по тегам и названию). */
export function matchObjects(lib: Library, query: string): Match[] {
  const qs = words(query)
  const res: Match[] = []
  for (const obj of lib.objects) {
    const pool = [obj.name, ...obj.tags].flatMap(t => words(t))
    let score = 0
    const hits: string[] = []
    for (const q of qs) {
      const qStem = stem(q)
      const exact = pool.includes(q)
      const partial = pool.some(t => stem(t) === qStem)
      if (exact || partial) {
        score += exact ? 2 : 1
        hits.push(q)
      }
    }
    // название объекта в запросе — сильный сигнал
    if (words(obj.name).some(n => qs.some(q => stem(q) === stem(n)))) score += 2
    if (score > 0) res.push({ obj, score, hits })
  }
  return res.sort((a, b) => b.score - a.score)
}

/** «телефон, монета и лампа» → найденные объекты в порядке упоминания. */
export function parseNames(lib: Library, text: string): { found: LibObject[]; unknown: string[] } {
  const found: LibObject[] = []
  const unknown: string[] = []
  for (const part of text.split(/[,;\n]| и | \+ /i).map(s => s.trim()).filter(Boolean)) {
    const ws = words(part)
    const obj = lib.objects.find(o => ws.some(w => words(o.name).some(n => stem(n) === stem(w))))
      ?? lib.objects.find(o => ws.some(w => o.tags.some(t => words(t).some(n => stem(n) === stem(w) && n.length > 3))))
    if (obj) found.push(obj)
    else unknown.push(part)
  }
  return { found, unknown }
}
