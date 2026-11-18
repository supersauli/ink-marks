// 校验所有「应返回数组」的 GET 接口确实返回数组，防止 async 化遗漏 await 导致 res.json(Promise) => {}
const BASE = 'http://127.0.0.1:8787/api'
;(async () => {
  const j = async (p) => { const r = await fetch(BASE + p); let d; try { d = await r.json() } catch { d = null }; return { s: r.status, d } }
  const projects = await j('/projects')
  const pid = projects.d?.[0]?.id
  const chapters = await j('/chapters?projectId=' + pid)
  const cid = chapters.d?.[0]?.id
  const chars = await j('/characters?projectId=' + pid)
  const chid = chars.d?.[0]?.id
  const items = await j('/items?projectId=' + pid)
  const iid = items.d?.[0]?.id
  const tmpls = await j('/card-templates?projectId=' + pid)
  const tid = tmpls.d?.[0]?.id

  // [路径, 是否应为数组]
  const cases = [
    ['/projects', true],
    ['/chapters?projectId=' + pid, true],
    ['/chapters/search?projectId=' + pid + '&q=', false], // 返回 {query,results} 对象，前端按对象解析
    ['/characters?projectId=' + pid, true],
    ['/items?projectId=' + pid, true],
    ['/card-templates?projectId=' + pid, true],
    ['/card-templates/' + tid, false],
    ['/chat/messages?projectId=' + pid, true],
    ['/providers', true],
    ['/usage/logs', true],
    ['/versions?targetType=character&targetId=' + chid, true],
    ['/chapters/' + cid + '/revisions', true],
    ['/characters/' + chid, false],
    ['/items/' + iid, false],
    ['/overview?projectId=' + pid, false],
    ['/usage/stats', false]
  ]
  let fail = 0
  for (const [path, wantArray] of cases) {
    if (path.includes('undefined')) { console.log('  跳过(无ID): ' + path); continue }
    const { s, d } = await j(path)
    const isArr = Array.isArray(d)
    const typeOk = wantArray ? isArr : !isArr && typeof d === 'object' && d !== null
    const emptyObj = JSON.stringify(d) === '{}'
    const bad = s !== 200 || !typeOk || (wantArray && emptyObj)
    if (bad) { console.log(`  ✗ ${s} wantArray=${wantArray} gotArray=${isArr} ${emptyObj ? '空对象!' : ''} ${path} -> ${JSON.stringify(d).slice(0, 90)}`); fail++ }
    else console.log(`  ✓ ${wantArray ? '数组' : '对象'} ${path}`)
  }
  console.log('\n失败 ' + fail + ' 项')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
