// 数据库统一入口（运行时无关）。
// 业务代码 import { db } from './db.js'，不感知底层是本地 node:sqlite 还是云端 D1。
// 真正的驱动由入口文件注入：
//   - 本地：src/index.js 会 import './db-local.js' 注入本地驱动
//   - 云端：worker 入口会 setDriver(createD1Driver(env.DB)) 注入 D1 驱动
export { db, setDriver, hasDriver } from './db-adapter.js'
export { db as default } from './db-adapter.js'
