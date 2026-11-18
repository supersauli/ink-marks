const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const TARGET = process.argv[2] || 'http://127.0.0.1:8787/'

;(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1200))

  // 侧栏文本（点击前）
  const before = await page.evaluate(() => document.body.innerText.includes('模板'))
  console.log('侧栏含「模板」:', before ? '✓' : '✗')

  // 点击模板按钮
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const t = btns.find((b) => b.innerText.trim().includes('模板'))
    if (t) { t.click(); return true }
    return false
  })
  console.log('找到并点击模板按钮:', clicked ? '✓' : '✗')
  await new Promise((r) => setTimeout(r, 800))

  // 点击后：侧栏是否还在、模板区是否渲染、有无报错
  const after = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      hasSidebar: Boolean(document.querySelector('nav')) || text.includes('大纲'),
      hasTemplatePanel: text.includes('属性卡模板'),
      bodyLen: text.length,
      snippet: text.slice(0, 100).replace(/\n/g, ' | ')
    }
  })
  console.log('点击后侧栏仍在:', after.hasSidebar ? '✓' : '✗')
  console.log('模板面板已渲染:', after.hasTemplatePanel ? '✓' : '✗')
  console.log('页面文本长度:', after.bodyLen)
  console.log('片段:', after.snippet)
  console.log('JS 错误数:', errors.length)
  if (errors.length) console.log(errors.slice(0, 4).join('\n'))

  await browser.close()
  process.exit(!errors.length && after.hasSidebar && after.hasTemplatePanel ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
