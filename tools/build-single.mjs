// Gera DaviTheDriver.html: arquivo único e autossuficiente (CSS + JS minificado + foto opcional inline).
// Uso: npm run build:single   (também chamado por npm run build)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');

// 1) bundle minificado em memória (não depende de dist/ estar atualizado)
const res = await build({
  entryPoints: [join(root, 'src/main.js')], bundle: true, format: 'iife', target: 'es2019',
  minify: true, legalComments: 'none', write: false, charset: 'utf8',
});
let js = res.outputFiles[0].text;
// 2) sequências que quebrariam um <script> inline
js = js.replace(/<\/(script)/gi, (_, s) => '<\\/' + s).replace(/<!--/g, '<\\!--')
  .replaceAll(String.fromCharCode(0x2028), '\\u2028').replaceAll(String.fromCharCode(0x2029), '\\u2029');

// 3) foto opcional: a UI sonda 'assets/davi.png' via new Image().src; no arquivo único
//    interceptamos esse src e devolvemos o data URI (sem rede, sem editar src/).
let photoShim = '';
const photoPath = join(root, 'assets/davi.png');
if (existsSync(photoPath)) {
  const uri = 'data:image/png;base64,' + readFileSync(photoPath).toString('base64');
  photoShim = `<script>(function(){var U=${JSON.stringify(uri)},d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
if(!d||!d.set)return;Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:d.enumerable,get:d.get,
set:function(v){d.set.call(this,/(^|\\/)assets\\/davi\\.png(\\?|$)/.test(String(v))?U:v)}})})();</script>\n  `;
  console.log('foto embutida: assets/davi.png');
} else console.log('sem assets/davi.png: o menu usa o avatar desenhado');

// 4) monta o HTML a partir de index.html
const tag = '<script src="dist/game.js"></script>';
let html = rd('index.html');
if (!html.includes(tag)) throw new Error('index.html: tag do bundle não encontrada');
html = html.replace(tag, () => `${photoShim}<script>\n${js}\n</script>`);
if (/<(script|link|img)[^>]+(src|href)=["'](?!data:|#)/i.test(html)) throw new Error('referência externa restante no HTML');
const out = join(root, 'DaviTheDriver.html');
writeFileSync(out, html);
console.log(`DaviTheDriver.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
