// Cloudflare D1 驱动：实现与本地 node:sqlite 驱动相同的接口。
// db.prepare(sql).get/all/run(...args) 均返回 Promise，与业务代码的 await 写法一致。

export function createD1Driver(d1) {
  return {
    prepare(sql) {
      const stmt = d1.prepare(sql)
      return {
        async get(...args) {
          const row = await stmt.bind(...args).first()
          return row ?? undefined
        },
        async all(...args) {
          const res = await stmt.bind(...args).all()
          return res.results ?? []
        },
        async run(...args) {
          const res = await stmt.bind(...args).run()
          // 映射成 node:sqlite 的返回结构，业务代码依赖 result.changes
          const meta = res.meta ?? {}
          return {
            changes: meta.changes ?? 0,
            lastInsertRowid: meta.last_row_id ?? null
          }
        }
      }
    },
    async exec(sql) {
      return d1.exec(sql)
    }
  }
}
