/** Базовая схема исходных иллюстраций (фиолетовая): светлый, средний и тёмный тон. */
export interface Scheme {
  id: string
  name: string
  light: string
  mid: string
  dark: string
}

const SOURCE = { light: '#D7CDF5', mid: '#AA9BF0', dark: '#7864D7' }

export const SCHEMES: Scheme[] = [
  { id: 'violet', name: 'Фиолетовая', ...SOURCE },
  { id: 'teal', name: 'Бирюзовая', light: '#BEEBEB', mid: '#80DADA', dark: '#5ABEBE' },
  { id: 'peach', name: 'Персиковая', light: '#FDD7B9', mid: '#FAC896', dark: '#D27532' },
]

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g

function expand(c: string) {
  c = c.toUpperCase()
  return c.length === 4 ? '#' + [...c.slice(1)].map(x => x + x).join('') : c
}

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}

/**
 * Загрузка палитры: из любого текста (JSON, CSS, TXT, SVG) берутся hex-цвета.
 * Самый светлый становится светлым тоном и фоном, самый тёмный — тёмным, средний по яркости — средним.
 * Чёрный и белый (контуры и блики) из палитры не берутся и в иллюстрациях не меняются.
 */
export function parsePalette(text: string, name = 'Своя палитра'): Scheme {
  const colors = [...new Set((text.match(HEX) ?? []).map(expand))]
    .filter(c => c !== '#FFFFFF' && c !== '#000000')
    .sort((a, b) => lightness(b) - lightness(a))
  if (colors.length < 3) throw new Error('В палитре нужно минимум 3 цвета (hex, например #D7CDF5).')
  return {
    id: 'custom',
    name,
    light: colors[0],
    mid: colors[Math.floor(colors.length / 2)],
    dark: colors[colors.length - 1],
  }
}

/** Перекраска только трёх тонов схемы; контуры, блики и акценты остаются как в оригинале. */
export function recolor(svg: string, scheme: Scheme): string {
  if (scheme.id === 'violet') return svg
  const map: Record<string, string> = {
    [SOURCE.light]: scheme.light,
    [SOURCE.mid]: scheme.mid,
    [SOURCE.dark]: scheme.dark,
  }
  return svg.replace(/(fill|stroke)="(#[0-9A-Fa-f]{6})"/g, (m, attr: string, c: string) => {
    const to = map[c.toUpperCase()]
    return to ? `${attr}="${to}"` : m
  })
}
