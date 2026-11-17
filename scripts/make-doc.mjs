// README.md → docs/Сборщик-иллюстраций.docx
// Текст берётся из README. Композиции из examples/ вставляются как SVG (с PNG-запасным вариантом
// для старых версий Word), скриншоты интерфейса остаются растровыми (PNG), так как это снимки экрана.
import fs from 'node:fs'
import path from 'node:path'
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'

const md = fs.readFileSync('README.md', 'utf8').replace(/\r\n/g, '\n')
const OUT = 'docs/Сборщик-иллюстраций.docx'
const FONT = 'Calibri'
const MONO = 'Consolas'
const MAX_W = 600 // ширина картинки в пикселях при 96 dpi (≈ 15,9 см)

// ---- картинки ---------------------------------------------------------------
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

function image(src, alt) {
  const png = fs.readFileSync(src)
  const { w, h } = pngSize(png)
  const width = Math.min(MAX_W, w)
  const transformation = { width, height: Math.round((width * h) / w) }
  const svgPath = src.replace(/\.png$/, '.svg')
  const run = fs.existsSync(svgPath) && src.startsWith('examples/')
    ? new ImageRun({ type: 'svg', data: fs.readFileSync(svgPath), fallback: { type: 'png', data: png }, transformation, altText: { title: alt, description: alt, name: alt } })
    : new ImageRun({ type: 'png', data: png, transformation, altText: { title: alt, description: alt, name: alt } })
  return new Paragraph({ children: [run], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true })
}

// ---- текст с оформлением ----------------------------------------------------
/** **жирный**, `код`, [ссылка](url), голые https://… */
function inline(text, base = {}) {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<]+)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }))
    const t = m[0]
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, ...base }))
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, shading: { type: ShadingType.CLEAR, fill: 'EFEDF7' }, ...base, size: base.size ? base.size - 2 : 20 }))
    else {
      const link = t.startsWith('[') ? t.match(/\[([^\]]+)\]\(([^)]+)\)/) : [t, t, t]
      const target = /^https?:/.test(link[2]) ? link[2] : null
      if (target) out.push(new ExternalHyperlink({ link: target, children: [new TextRun({ text: link[1], style: 'Hyperlink', font: FONT, ...base })] }))
      else out.push(new TextRun({ text: link[1], font: MONO, ...base })) // ссылка на файл репозитория
    }
    last = m.index + t.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }))
  return out
}

// ---- разбор Markdown --------------------------------------------------------
const children = []
const lines = md.split('\n')
const HEADINGS = { 1: HeadingLevel.TITLE, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2 }
const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9C4DD' }
const borders = { top: border, bottom: border, left: border, right: border }

let i = 0
while (i < lines.length) {
  const line = lines[i]
  if (!line.trim()) { i++; continue }

  // блок кода
  if (line.startsWith('```')) {
    const code = []
    i++
    while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
    i++
    code.forEach((c, k) => children.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'F3F1FA' },
      spacing: { before: k === 0 ? 80 : 0, after: k === code.length - 1 ? 120 : 0, line: 260 },
      indent: { left: 120, right: 120 },
      children: [new TextRun({ text: c || ' ', font: MONO, size: 19 })],
    })))
    continue
  }

  // заголовок
  const h = line.match(/^(#{1,3}) (.*)/)
  if (h) {
    children.push(new Paragraph({ heading: HEADINGS[h[1].length], children: inline(h[2]), spacing: { before: h[1].length === 1 ? 0 : 280, after: 120 }, keepNext: true }))
    i++
    continue
  }

  // картинка
  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
  if (img) {
    children.push(image(decodeURI(img[2]), img[1]))
    if (img[1]) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: img[1], italics: true, color: '6C6A78', size: 20, font: FONT })] }))
    i++
    continue
  }

  // таблица
  if (line.startsWith('|')) {
    const rows = []
    while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
    const cells = rows.filter(r => !/^\|[\s|:-]+\|?$/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    const cols = cells[0].length
    const total = 9360
    children.push(new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: Array(cols).fill(Math.floor(total / cols)),
      rows: cells.map((r, ri) => new TableRow({
        tableHeader: ri === 0,
        children: r.map(c => new TableCell({
          borders,
          width: { size: Math.floor(total / cols), type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: ri === 0 ? { type: ShadingType.CLEAR, fill: 'E9E4FA' } : undefined,
          children: [new Paragraph({ children: inline(c, ri === 0 ? { bold: true, size: 20 } : { size: 20 }) })],
        })),
      })),
    }))
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
    continue
  }

  // список
  const li = line.match(/^(\s*)(-|\d+\.) (.*)/)
  if (li) {
    const numbered = /\d/.test(li[2])
    let text = li[3]
    i++
    while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(-|\d+\.) /.test(lines[i])) text += ' ' + lines[i++].trim()
    children.push(new Paragraph({
      numbering: { reference: numbered ? 'num' : 'bul', level: 0 },
      spacing: { after: 60 },
      children: inline(text),
    }))
    continue
  }

  // обычный абзац (склеиваем соседние строки)
  let text = line.trim()
  i++
  while (i < lines.length && lines[i].trim() && !/^(#|```|\||!\[|\s*(-|\d+\.) )/.test(lines[i])) text += ' ' + lines[i++].trim()
  children.push(new Paragraph({ children: inline(text), spacing: { after: 120 } }))
}

const doc = new Document({
  creator: 'Камила Куянова',
  title: 'Сборщик иллюстраций',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 44, bold: true, font: FONT, color: '2B2250' }, paragraph: { spacing: { after: 200 } } },
      { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: FONT, color: '4B3BA8' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: FONT, color: '4B3BA8' }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
    children,
  }],
})

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, await Packer.toBuffer(doc))
console.log(OUT, (fs.statSync(OUT).size / 1024) | 0, 'КБ')
