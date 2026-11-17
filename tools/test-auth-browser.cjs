const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  // 带 token 访问首页
  await page.goto('http://127.0.0.1:8787/?token=testtoken123', { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 1500))

  // 检查页面是否加载了作品（说明 API 带令牌成功）
  const bodyText = await page.evaluate(() => document.body.innerText)
  const hasProject = bodyText.includes('未命名作品') || bodyText.includes('裂隙回响')
  const has401 = bodyText.includes('需要访问令牌')
  console.log('带 token 打开:')
  console.log('  显示作品列表:', hasProject ? '✓' : '✗')
  console.log('  出现401错误:', has401 ? '✗ 是' : '✓ 否')
  console.log('  页面文字片段:', bodyText.slice(0, 120).replace(/\n/g, ' | '))

  // 检查 sessionStorage 是否记住了 token
  const stored = await page.evaluate(() => sessionStorage.getItem('novel_access_token'))
  console.log('  token 已缓存:', stored === 'testtoken123' ? '✓' : '✗ ' + stored)

  // 不带 token 打开（新 context，sessionStorage 为空）
  const page2 = await browser.newPage()
  const errors2 = []
  page2.on('pageerror', (e) => errors2.push(e.message))
  // 清掉可能的继承
  await page2.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 1200))
  const body2 = await page2.evaluate(() => document.body.innerText)
  console.log('\n不带 token 打开:')
  console.log('  页面正常渲染(静态):', body2.length > 20 ? '✓' : '✗')
  console.log('  JS错误数:', errors2.length)

  console.log('\n带token页面 JS 错误:', errors.length)
  if (errors.length) console.log(errors.slice(0, 5).join('\n'))

  await browser.close()
  process.exit(hasProject && !has401 && stored === 'testtoken123' ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
