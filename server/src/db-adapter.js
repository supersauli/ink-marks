// 数据库适配层：业务代码只依赖这里导出的 db，底层驱动由运行时注入。
// 本地 = node:sqlite（同步，包成 Promise）；云端 = Cloudflare D1（原生异步）。
// 两个驱动的 prepare(sql) 都返回带 get/all/run 的对象，方法均返回 Promise。

let driver = null

export function setDriver(next) {
  driver = next
}

export function hasDriver() {
  return driver !== null
}

function ensureDriver() {
  if (!driver) throw new Error('数据库驱动未初始化：请先调用 setDriver()')
  return driver
}

export const db = {
  prepare(sql) {
    return ensureDriver().prepare(sql)
  },
  exec(sql) {
    return ensureDriver().exec(sql)
  }
}

export default db
