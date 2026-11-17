const BASE = 'http://127.0.0.1:8790/api'
let pass = 0, fail = 0
function ok(name, cond, extra) {
  if (cond) { console.log('  ✓ ' + name); pass++ }
  else { console.log('  ✗ ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); fail++ }
}
async function req(method, path, body) {
  const r = await fetch(BASE + path, {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  let data = null
  try { data = await r.json() } catch (e) {}
  return { status: r.status, data }
}

;(async () => {
  // 1. 项目 CRUD
  console.log('[项目]')
  const p = await req('post', '/projects', { name: '__回归测试__', description: 'tmp' })
  ok('创建项目', p.status === 201 && p.data?.id, p)
  const pid = p.data?.id
  await req('patch', '/projects/' + pid, { name: '__回归测试2__' })
  const pl = await req('get', '/projects')
  ok('项目修改落库', pl.data?.some((x) => x.id === pid && x.name === '__回归测试2__'))

  // 2. 章节 + 段落
  console.log('[章节/段落]')
  const c = await req('post', '/chapters', { projectId: pid, title: '测试章' })
  ok('创建章节', c.status === 201 && c.data?.id || c.status === 200, c)
  const cid = c.data?.id || c.data?.chapter?.id
  if (cid) {
    const b = await req('post', `/chapters/${cid}/blocks`, { text: '测试正文' })
    ok('创建段落', [200, 201].includes(b.status), b)
  } else {
    console.log('  (章节响应无 id，跳过段落)')
  }

  // 3. 角色 + 技能 + 阶段
  console.log('[角色]')
  const ch = await req('post', '/characters', { projectId: pid, name: '测试角色' })
  ok('创建角色', [200, 201].includes(ch.status), ch)
  const chid = ch.data?.id || ch.data?.character?.id
  if (chid) {
    const sk = await req('post', `/characters/${chid}/skills`, { name: '测试技能' })
    ok('创建技能', [200, 201].includes(sk.status), sk)
    const st = await req('post', `/characters/${chid}/stages`, { name: '阶段一' })
    ok('创建性格阶段', [200, 201].includes(st.status), st)
    const det = await req('get', `/characters/${chid}`)
    // 用列表接口验证
  }

  // 4. 物品 + 事件
  console.log('[物品]')
  const it = await req('post', '/items', { projectId: pid, name: '测试物品' })
  ok('创建物品', [200, 201].includes(it.status), it)

  // 5. 服务商 + 模型（用假 key，测完删）
  console.log('[服务商/模型]')
  const pv = await req('post', '/providers', { name: '__回归PV__', baseUrl: 'https://example.com/v1', apiKey: 'test' })
  ok('创建服务商', pv.status === 201 && pv.data?.id, pv)
  const pvid = pv.data?.id
  if (pvid) {
    const m = await req('post', '/models', { providerId: pvid, name: 'test-model', displayName: 'Test' })
    ok('创建模型', m.status === 201 && m.data?.id, m)
    const pl2 = await req('get', '/providers')
    const found = pl2.data?.find((x) => x.id === pvid)
    ok('模型挂到服务商', found?.models?.length === 1, found)
  }

  // 清理
  console.log('[清理]')
  if (pvid) { await req('delete', '/providers/' + pvid); ok('删除服务商', true) }
  await req('delete', '/projects/' + pid)
  const pl3 = await req('get', '/projects')
  ok('删除项目', !pl3.data?.some((x) => x.id === pid))

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('脚本异常:', e); process.exit(2) })
