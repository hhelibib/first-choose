/**
 * 本机 Application Control 会拦截 rollup/esbuild 原生程序。
 * 开发服务器改用 esbuild-wasm + vue/compiler-sfc。
 */
import http from 'node:http'
import { watch } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild-wasm'
import { compileScript, compileStyle, compileTemplate, parse } from 'vue/compiler-sfc'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, '../..')
const aliases = {
  '@battle/shared': path.join(repo, 'packages/shared/src/index.ts'),
  '@battle/sim': path.join(repo, 'packages/sim/src/index.ts'),
  '@battle/ai': path.join(repo, 'packages/ai/src/index.ts'),
}

function scopeId(filename) {
  let hash = 2166136261
  for (const ch of filename) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `data-v-${(hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)}`
}

function vuePlugin() {
  return {
    name: 'vue-sfc',
    setup(build) {
      build.onLoad({ filter: /\.vue$/ }, async (args) => {
        const source = await fs.readFile(args.path, 'utf8')
        const id = scopeId(args.path)
        const { descriptor, errors } = parse(source, { filename: args.path })
        if (errors.length) {
          return { errors: errors.map((error) => ({ text: error.message })) }
        }
        const hasScoped = descriptor.styles.some((style) => style.scoped)
        const script = compileScript(descriptor, { id, genDefaultAs: '_sfc_main' })
        const template = compileTemplate({
          id,
          filename: args.path,
          source: descriptor.template?.content ?? '',
          scoped: hasScoped,
          compilerOptions: {
            bindingMetadata: script.bindings,
            scopeId: hasScoped ? id : undefined,
          },
        })
        const css = descriptor.styles
          .map((style) => compileStyle({ source: style.content, filename: args.path, id, scoped: style.scoped }).code)
          .join('\n')
        const injected = css
          ? `\nconst __css = ${JSON.stringify(css)};\nif (typeof document !== 'undefined') { let el = document.getElementById(${JSON.stringify(id)}); if (!el) { el = document.createElement('style'); el.id = ${JSON.stringify(id)}; document.head.appendChild(el); } el.textContent = __css; }\n`
          : ''
        const contents = `${script.content}\n${template.code}\n_sfc_main.render = render\n${injected}\nexport default _sfc_main`
        return {
          contents,
          loader: script.lang === 'ts' || !script.lang ? 'ts' : 'js',
          resolveDir: path.dirname(args.path),
        }
      })
    },
  }
}

function aliasPlugin() {
  return {
    name: 'workspace-alias',
    setup(build) {
      const filter = /^(?:@battle\/(?:shared|sim|ai))$/
      build.onResolve({ filter }, (args) => ({ path: aliases[args.path] }))
    },
  }
}

const ctx = await esbuild.context({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  format: 'esm',
  sourcemap: true,
  outfile: 'app.js',
  write: false,
  logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [aliasPlugin(), vuePlugin()],
  loader: { '.css': 'css' },
})

async function bundle() {
  const result = await ctx.rebuild()
  /** @type {Record<string, Uint8Array | string>} */
  const files = {}
  for (const file of result.outputFiles ?? []) {
    const name = path.basename(file.path)
    files[name] = file.contents
    if (name.endsWith('.js') || name.endsWith('.css') || name.endsWith('.map')) {
      files[name] = file.text
    }
  }
  return { files, errors: result.errors }
}

let latest = await bundle()
if (latest.errors.length) {
  console.error(latest.errors)
  process.exit(1)
}

const watchDirs = [
  path.join(root, 'src'),
  path.join(repo, 'packages/shared/src'),
  path.join(repo, 'packages/sim/src'),
  path.join(repo, 'packages/ai/src'),
]
for (const dir of watchDirs) {
  watch(dir, { recursive: true }, async () => {
    try {
      latest = await bundle()
      if (latest.errors.length) {
        console.error(latest.errors)
      } else {
        console.log('rebuilt')
      }
    } catch (error) {
      console.error(error)
    }
  })
}

const indexHtml = await fs.readFile(path.join(root, 'index.html'), 'utf8')

const mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(indexHtml)
    return
  }
  const file = url.pathname.slice(1)
  const body = latest.files[file]
  if (body !== undefined) {
    res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' })
    res.end(body)
    return
  }
  res.writeHead(404)
  res.end('not found')
})

const port = 5173
server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}/`)
})
