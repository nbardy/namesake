import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dist = new URL('./dist/', import.meta.url)
const index = new URL('index.html', dist)
const html = readFileSync(index, 'utf8').replaceAll(
  'https://nbardy.github.io/wave-physics-0to1/',
  'https://physics.nicholasbardy.com/',
)
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)]
if (assets.length === 0) throw new Error('The build has no root-relative assets.')
for (const [, asset] of assets) {
  if (!existsSync(new URL(asset.slice(1), dist))) {
    throw new Error(`The build references a missing asset: ${asset}`)
  }
}
if (html.includes('/wave-physics-0to1/')) {
  throw new Error('The page still references the old GitHub Pages base path.')
}
writeFileSync(index, html)
console.log(`Verified ${assets.length} entry assets and domain metadata in ${fileURLToPath(index)}`)
