// 把 server/src 下所有 db.prepare(...).get/all/run(...) 加 await，
// 并给宿主函数加 async。正确处理 export 修饰符顺序。
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const SRC = path.resolve(__dirname, '../server/src')
const OUT = process.argv[2]

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

const files = walk(SRC)
const texts = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))
const sources = new Map(files.map((f) => [f, ts.createSourceFile(f, texts.get(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)]))

function isDbCall(node) {
  if (!ts.isCallExpression(node)) return false
  const expr = node.expression
  if (!ts.isPropertyAccessExpression(expr)) return false
  if (!['get', 'all', 'run'].includes(expr.name.text)) return false
  const inner = expr.expression
  if (!ts.isCallExpression(inner)) return false
  const innerExpr = inner.expression
  if (!ts.isPropertyAccessExpression(innerExpr)) return false
  return innerExpr.name.text === 'prepare' && ts.isIdentifier(innerExpr.expression) && innerExpr.expression.text === 'db'
}

function enclosingFunction(node) {
  let cur = node.parent
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) return cur
    if (ts.isSourceFile(cur)) return null
    cur = cur.parent
  }
  return null
}

const awaitPositions = new Map()
const asyncFuncs = new Map()
const asyncNames = new Set()

function addAwait(file, pos) {
  if (!awaitPositions.has(file)) awaitPositions.set(file, new Set())
  awaitPositions.get(file).add(pos)
}
function addAsync(file, node) {
  if (!asyncFuncs.has(file)) asyncFuncs.set(file, new Set())
  asyncFuncs.get(file).add(node)
  if (node.name && ts.isIdentifier(node.name)) asyncNames.add(node.name.text)
  // 具名箭头函数 / 函数表达式赋值给变量：const xxx = async (...) => {}
  const p = node.parent
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p))) {
    const n = p.name
    if (n && ts.isIdentifier(n)) asyncNames.add(n.text)
  }
}

for (const f of files) {
  const sf = sources.get(f)
  const visit = (node) => {
    if (isDbCall(node)) {
      addAwait(f, node.getStart(sf))
      const fn = enclosingFunction(node)
      if (fn) addAsync(f, fn)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

let changed = true
let round = 0
while (changed && round < 30) {
  changed = false
  round++
  for (const f of files) {
    const sf = sources.get(f)
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && asyncNames.has(node.expression.text)) {
        if (!node.parent || !ts.isAwaitExpression(node.parent)) {
          const pos = node.getStart(sf)
          if (!awaitPositions.get(f)?.has(pos)) {
            addAwait(f, pos)
            const fn = enclosingFunction(node)
            if (fn) addAsync(f, fn)
            changed = true
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}

// 收集需要 Promise.all 包裹的 .forEach(async)/.map(async) 调用节点（按文件）
const iterCalls = new Map() // file -> Set<node>
function collectIterCalls() {
  for (const f of files) {
    const sf = sources.get(f)
    const set = new Set()
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text
        if ((name === 'forEach' || name === 'map') && node.arguments[0]) {
          const cb = node.arguments[0]
          if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
            // 回调体内是否含 db 调用或对 async 函数的调用
            let need = false
            const scan = (n) => {
              if (isDbCall(n)) need = true
              if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && asyncNames.has(n.expression.text)) need = true
              ts.forEachChild(n, scan)
            }
            scan(cb)
            if (need) set.add(node)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    iterCalls.set(f, set)
  }
}
collectIterCalls()

function applyEdits(file) {
  let text = texts.get(file)
  const sf = sources.get(file)
  const edits = []
  for (const pos of awaitPositions.get(file) || []) edits.push({ start: pos, end: pos, rep: 'await ' })
  // forEach(async) -> map；map(async) 保持；两者都包 await Promise.all(...)
  for (const node of iterCalls.get(file) || []) {
    const nameNode = node.expression.name
    if (nameNode.text === 'forEach') edits.push({ start: nameNode.getStart(sf), end: nameNode.getEnd(), rep: 'map' })
    // 在「独立语句」或「return」场景自动包 await Promise.all；链式/对象内场景留给手工
    let wrapExpr = null
    if (node.parent && ts.isExpressionStatement(node.parent)) wrapExpr = node.parent.expression
    else if (node.parent && ts.isReturnStatement(node.parent)) wrapExpr = node.parent.expression
    if (wrapExpr && !ts.isAwaitExpression(wrapExpr)) {
      edits.push({ start: node.getStart(sf), end: node.getStart(sf), rep: 'await Promise.all(' })
      edits.push({ start: node.getEnd(), end: node.getEnd(), rep: ')' })
    }
  }
  for (const node of asyncFuncs.get(file) || []) {
    if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) continue
    const exp = node.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (exp) {
      // export 之后插 ' async '（前后都要空格）
      edits.push({ start: exp.getEnd(sf), end: exp.getEnd(sf), rep: ' async ', after: true })
    } else {
      // 无 export：在 getStart 前插 'async '（尾部空格）
      edits.push({ start: node.getStart(sf), end: node.getStart(sf), rep: 'async ', after: false })
    }
  }
  // 同位置：export 后的 ' async' 要先于其它插入；简单处理：按 start 降序，start 相同按 after 降序
  edits.sort((a, b) => (b.start - a.start) || ((b.after ? 1 : 0) - (a.after ? 1 : 0)))
  for (const e of edits) text = text.slice(0, e.start) + e.rep + text.slice(e.end)
  return text
}

// 已知特殊场景的精确修复（在 AST 转换后做字符串替换）
const FIXUPS = {
  'db.js': [
    // 可选链 map 可能返回 undefined，Promise.all 需要数组
    ['await Promise.all(demoSkills[character.name]?.map(', 'await Promise.all((demoSkills[character.name] ?? []).map(']
  ],
  'cards.js': [
    ['export function listTemplates(projectId) {\n  return await Promise.all(', 'export async function listTemplates(projectId) {\n  return await Promise.all(']
  ],
  'routes/chapters.js': [
    // 链式 map(async).map(mapBlock) -> await Promise.all(第一个 map) 再 .map
    [
      /const blocks = createdIds\s*\.map\(async \(id\) => await db\.prepare\('SELECT \* FROM blocks WHERE id = \?'\)\.get\(id\)\)\s*\.map\(mapBlock\)/,
      `const blocks = (await Promise.all(createdIds.map((id) => db.prepare('SELECT * FROM blocks WHERE id = ?').get(id)))).map(mapBlock)`
    ],
    // async helper 返回 Promise 后再 .map 的优先级修正
    ['await listChapters(projectId).map(mapChapter)', '(await listChapters(projectId)).map(mapChapter)'],
    ['await listBlocks(chapter.id).map(mapBlock)', '(await listBlocks(chapter.id)).map(mapBlock)']
  ],
  'routes/revisions.js': [
    [
      /blocks: created\.map\(async \(id\) => mapBlock\(await db\.prepare\('SELECT \* FROM blocks WHERE id = \?'\)\.get\(id\)\)\),/,
      `blocks: (await Promise.all(created.map((id) => db.prepare('SELECT * FROM blocks WHERE id = ?').get(id)))).map(mapBlock),`
    ]
  ],
  'routes/outlines.js': [
    ['await listByProject(projectId).map(mapOutline)', '(await listByProject(projectId)).map(mapOutline)']
  ],
  'routes/providers.js': [
    ['res.json(rows.map(providerWithModels))', 'res.json(await Promise.all(rows.map(providerWithModels)))']
  ]
}

for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/')
  let out = applyEdits(f)
  for (const [from, to] of FIXUPS[rel] || []) {
    if (from instanceof RegExp) {
      if (!from.test(out)) console.error(`WARN fixup 未命中: ${rel} -> ${from}`)
      out = out.replace(from, to)
    } else {
      if (!out.includes(from)) console.error(`WARN fixup 未命中: ${rel} -> ${from.slice(0, 40)}`)
      out = out.split(from).join(to)
    }
  }
  const dest = path.join(OUT, path.relative(SRC, f))
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, out, 'utf8')
}
console.log(`处理 ${files.length} 文件，传播 ${round} 轮`)
console.log(`await: ${[...awaitPositions.values()].reduce((s, x) => s + x.size, 0)}, async函数: ${[...asyncFuncs.values()].reduce((s, x) => s + x.size, 0)}`)
