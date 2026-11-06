import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newId, now } from './util.js'
import { DEFAULT_TEMPLATES, TEMPLATE_KINDS } from './templateDefaults.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.NOVEL_DATA_DIR || path.resolve(here, '../data')
fs.mkdirSync(dataDir, { recursive: true })

const dbFile = process.env.NOVEL_DB || path.join(dataDir, 'novel.db')

export const db = new DatabaseSync(dbFile)

db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS outline_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES outline_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_outline_project ON outline_items(project_id, sort_order);

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'outline',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chapter_project ON chapters(project_id, sort_order);

  CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    instruction TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_block_chapter ON blocks(chapter_id, sort_order);

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    alias TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    age TEXT NOT NULL DEFAULT '',
    appearance TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    relations TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_character_project ON characters(project_id, sort_order);

  CREATE TABLE IF NOT EXISTS character_stages (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    traits TEXT NOT NULL DEFAULT '',
    inner TEXT NOT NULL DEFAULT '',
    behavior TEXT NOT NULL DEFAULT '',
    speech TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL DEFAULT '',
    is_current INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stage_character ON character_stages(character_id, sort_order);

  CREATE TABLE IF NOT EXISTS character_status_logs (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'alive',
    period TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_status_character ON character_status_logs(character_id, created_at);

  CREATE TABLE IF NOT EXISTS character_skills (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_skill_character ON character_skills(character_id, sort_order);

  CREATE TABLE IF NOT EXISTS character_relations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    to_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT '陌生',
    period TEXT NOT NULL DEFAULT '',
    chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relation_pair ON character_relations(from_character_id, to_character_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_relation_project ON character_relations(project_id);

  CREATE TABLE IF NOT EXISTS card_templates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'character',
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, kind)
  );

  CREATE TABLE IF NOT EXISTS card_fields (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES card_templates(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    field_type TEXT NOT NULL DEFAULT 'text',
    unit TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_card_field_template ON card_fields(template_id, sort_order);

  CREATE TABLE IF NOT EXISTS attribute_values (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_id TEXT NOT NULL REFERENCES card_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, field_id)
  );
  CREATE INDEX IF NOT EXISTS idx_attribute_value_entity ON attribute_values(entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS attribute_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_id TEXT NOT NULL REFERENCES card_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    period TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attribute_log_entity ON attribute_logs(entity_type, entity_id, created_at);

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '物品',
    rarity TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    debut TEXT NOT NULL DEFAULT '',
    background TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'intact',
    current_holder TEXT NOT NULL DEFAULT '',
    is_destroyed INTEGER NOT NULL DEFAULT 0,
    destroyed_by TEXT NOT NULL DEFAULT '',
    destroyed_at TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_item_project ON items(project_id, sort_order);

  CREATE TABLE IF NOT EXISTS item_events (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    period TEXT NOT NULL DEFAULT '',
    holder TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    destroyed_by TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_item_event_item ON item_events(item_id, created_at);

  CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id TEXT,
    block_id TEXT,
    target_id TEXT,
    scope TEXT NOT NULL DEFAULT 'block',
    instruction TEXT NOT NULL DEFAULT '',
    original_text TEXT NOT NULL DEFAULT '',
    revised_text TEXT NOT NULL DEFAULT '',
    model_name TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_revision_chapter ON revisions(chapter_id, created_at);

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_version_target ON versions(target_type, target_id, created_at);

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    api_type TEXT NOT NULL DEFAULT 'openai',
    extra_headers TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_model_provider ON models(provider_id, sort_order);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    model_name TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id, created_at);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`)

// 旧库升级：给记录补上可选的「关联章节」
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

ensureColumn('characters', 'gender', "TEXT NOT NULL DEFAULT ''")
ensureColumn('characters', 'debut', "TEXT NOT NULL DEFAULT ''")
ensureColumn('characters', 'debut_chapter_id', 'TEXT REFERENCES chapters(id) ON DELETE SET NULL')
ensureColumn('character_stages', 'chapter_id', 'TEXT REFERENCES chapters(id) ON DELETE SET NULL')
ensureColumn('attribute_logs', 'chapter_id', 'TEXT REFERENCES chapters(id) ON DELETE SET NULL')
ensureColumn('item_events', 'chapter_id', 'TEXT REFERENCES chapters(id) ON DELETE SET NULL')

function seedProviders() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM providers').get().c
  if (count > 0) return

  const seeds = [
    {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      models: [
        { name: 'deepseek-chat', displayName: 'DeepSeek Chat', isDefault: 1 },
        { name: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', isDefault: 0 }
      ]
    },
    {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ name: 'gpt-4o-mini', displayName: 'GPT-4o mini', isDefault: 0 }]
    },
    {
      name: 'Ollama（本地）',
      baseUrl: 'http://localhost:11434/v1',
      models: [{ name: 'llama3.1', displayName: 'Llama 3.1', isDefault: 0 }]
    }
  ]

  for (const seed of seeds) {
    const providerId = newId()
    const t = now()
    db.prepare(
      'INSERT INTO providers (id, name, base_url, api_key, api_type, extra_headers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(providerId, seed.name, seed.baseUrl, '', 'openai', '{}', t, t)
    seed.models.forEach((model, index) => {
      db.prepare(
        'INSERT INTO models (id, provider_id, name, display_name, temperature, max_tokens, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), providerId, model.name, model.displayName, 0.7, 4096, model.isDefault, index * 10)
    })
  }
}

function seedDemoProject() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM projects').get().c
  if (count > 0) return

  const projectId = newId()
  const t = now()
  db.prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    projectId,
    '雾港来信（示例）',
    '一个关于记忆、潮汐与失踪者的悬疑故事。可随时改名或删除这个示例。',
    t,
    t
  )

  const outlines = [
    {
      title: '故事主线',
      content:
        '林岚在雨夜收到一封署名为「姐姐」的信，而姐姐已在十年前失踪。\n信件指向雾港旧码头的一座废弃灯塔。\n她循着线索回到故乡，发现镇上所有人都对那场海难讳莫如深。\n真相：姐姐并未死去，而是被卷入一场利用潮汐走私的秘密交易。\n结局：林岚在涨潮前救出姐姐，也揭开了父亲之死的真相。'
    },
    {
      title: '世界观设定',
      content:
        '雾港：北方沿海小城，常年有雾，旧码头在二十年前的一场海难后逐渐废弃。\n潮汐：镇上的老人相信，退潮时会露出「不该看见的东西」。\n记忆：主角林岚有轻微的失忆症，她关于姐姐的记忆并不完整。'
    },
    {
      title: '人物小传',
      content:
        '林岚：二十九岁，旧书店店主，冷静、固执，习惯用记录对抗遗忘。\n林雾：姐姐，十年前失踪，擅长潜水，性格比妹妹更冲动。\n老周：灯塔看守人，沉默寡言，似乎知道海难的真相。'
    }
  ]

  outlines.forEach((item, index) => {
    const itemId = newId()
    db.prepare(
      'INSERT INTO outline_items (id, project_id, parent_id, title, content, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(itemId, projectId, null, item.title, item.content, index * 10, t, t)
  })

  const chapters = [
    {
      title: '第一章 雨夜来信',
      summary:
        '雨夜，林岚收到十年未见的姐姐寄来的信。信纸带着海腥味，只有一句话：「别相信潮水退去时看到的东西。」她决定回雾港。',
      status: 'writing',
      blocks: [
        '雨是傍晚开始下的，到夜里已经下得很密。林岚关掉店里的灯，正准备拉下卷帘门，一封没有贴邮票的信从门缝里滑了进来。',
        '信封是旧的，边角泡过水，泛着淡淡的黄。她翻过来看，背面只有三个字：林岚收。字迹瘦长，最后一笔习惯性地向上挑——那是姐姐的字。',
        '十年前，姐姐林雾在雾港外海失踪。所有人都说她死了，只有林岚一直觉得，她只是去了一个很远的地方。她拆开信，里面只有一张纸，纸上还带着潮气：「别相信潮水退去时看到的东西。」'
      ]
    },
    {
      title: '第二章 旧码头',
      summary: '林岚回到雾港，在旧码头遇到灯塔看守人老周。老周劝她离开，却在她转身时说出姐姐的名字。',
      status: 'outline',
      blocks: []
    }
  ]

  chapters.forEach((chapter, index) => {
    const chapterId = newId()
    db.prepare(
      'INSERT INTO chapters (id, project_id, title, summary, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(chapterId, projectId, chapter.title, chapter.summary, chapter.status, index * 10, t, t)
    chapter.blocks.forEach((text, blockIndex) => {
      db.prepare(
        'INSERT INTO blocks (id, chapter_id, text, instruction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), chapterId, text, '', blockIndex * 10, t, t)
    })
  })
}

function seedDemoCharacters() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM characters').get().c
  if (count > 0) return
  const project = db
    .prepare("SELECT id FROM projects WHERE name LIKE '雾港来信%' ORDER BY created_at ASC LIMIT 1")
    .get()
  if (!project) return
  const t = now()

  const seeds = [
    {
      name: '林岚',
      alias: '阿岚',
      role: '主角',
      gender: '女',
      age: '29 岁',
      debut: '第一章 雨夜来信',
      appearance: '瘦，黑发总是随手扎起，左手虎口有一道被旧书页划出的浅疤。\n常年穿深色外套，口袋里塞着写满字的便签。',
      background:
        '雾港人，十岁时父亲死于外海「海难」，同年姐姐林雾失踪。\n此后独自离开雾港，在邻城开了一家旧书店，靠记录对抗逐渐模糊的记忆。',
      relations: '林雾（姐姐，失踪十年）：她既是最亲的人，也是她最不敢深想的名字。\n老周（灯塔看守人）：童年时见过几面，隐约觉得他知道些什么。',
      goal: '确认姐姐是否还活着，并查清父亲当年那场「海难」的真相。',
      notes: '口癖：情绪失控时会低声说「我记一下」，然后真的掏出本子。\n不要把她写成天生勇敢的人，她的行动力来自恐惧而不是热血。',
      stages: [
        {
          name: '妹妹',
          period: '十年前 · 童年回忆',
          traits: '依赖姐姐，怕水，容易相信别人；遇到争执时习惯先退一步。',
          inner: '只要跟着姐姐，去哪里都可以。',
          behavior: '被姐姐牵着手走过码头，不敢看黑色的海水。',
          speech: '话多，喜欢追问「为什么」。',
          event: '父亲出海未归；姐姐带她最后一次去灯塔。',
          isCurrent: 0
        },
        {
          name: '记录者',
          period: '第 1-6 章 · 现在',
          traits: '冷静、固执、克制；对细节异常敏感，对陌生人先设防再观察。\n表面理性，实际很容易被「姐姐」两个字击穿。',
          inner: '想确认姐姐还活着，又害怕真相会推翻自己这十年来的活法。',
          behavior: '把每一件不确定的事写进本子；紧张时会反复整理书页边缘。\n决定行动前会先一个人走一段路。',
          speech: '句子短，常打断别人：「先等一下，我记一下。」\n很少用感叹句，情绪越重说得越轻。',
          event: '雨夜收到姐姐笔迹的信；决定回雾港。',
          isCurrent: 1
        },
        {
          name: '涉水者',
          period: '第 12 章起 · 涨潮夜之后',
          traits: '仍然谨慎，但开始允许别人靠近；学会在信息不足时承担判断。\n固执变成了底线，而不是盔甲。',
          inner: '不再只想「找到姐姐」，而是想「让雾港不再吞掉下一个名字」。',
          behavior: '主动开口求助，愿意把手里的记录给别人看。\n遇到危险会先确认同伴的位置。',
          speech: '依然简短，但会加一句「你怎么看」。',
          event: '在灯塔里与老周摊牌；第一次主动牵住姐姐的手。',
          isCurrent: 0
        }
      ]
    },
    {
      name: '林雾',
      alias: '',
      role: '关键人物',
      gender: '女',
      age: '失踪时 24 岁（若仍在世应为 34 岁）',
      debut: '第一章 信件中的传闻',
      appearance: '比妹妹高半个头，肩背线条利落，常年潜水留下晒痕。\n据说笑起来时右眼角会先弯。',
      background: '雾港最好的自由潜水员，二十岁起替人打捞沉船货。\n十年前在一次夜潜后失踪，官方结论是溺亡，尸体未寻获。',
      relations: '林岚（妹妹）：她离开前答应过「一定回来」。\n老周：曾经的合作者，也是唯一知道那次夜潜真实目的的人。',
      goal: '活下来，并把潮汐走私链上的名字交出去。',
      notes: '她的「死」是全书的第一个谜面；性格转变要通过他人转述与信件笔迹呈现。',
      stages: [
        {
          name: '潜水员',
          period: '十年前 · 失踪前',
          traits: '冲动、爽快、护短；胆子大但不算鲁莽，下水前会把所有细节核对两遍。',
          inner: '想带妹妹离开雾港，去一个没有潮声的地方生活。',
          behavior: '说话时习惯拍别人的肩；答应事情从不讨价还价。',
          speech: '语速快，爱用「说定了」作为结尾。',
          event: '接下那次不该接的夜潜。',
          isCurrent: 0
        },
        {
          name: '失踪者',
          period: '第 1-9 章 · 传闻中的十年',
          traits: '在旁人叙述里被不断改写：有人说她狠，有人说她傻。\n真实的她沉默、耐心，学会了等待潮汐和时机。',
          inner: '不能回去，但必须让妹妹知道「别相信退潮时看到的东西」。',
          behavior: '只通过信件与第三人传话；每次出现都留下可被验证的小细节。',
          speech: '信里句子很短，落笔时习惯把最后一笔向上挑。',
          event: '寄出那封没有邮票的信。',
          isCurrent: 1
        },
        {
          name: '归来者',
          period: '第 14 章起 · 灯塔相认',
          traits: '不再替妹妹做决定；把冲动收进更冷静的计划里。\n仍然护短，但学会先道歉。',
          inner: '想弥补十年的空白，也清楚有些空白补不回来。',
          behavior: '先远远看着妹妹，确认她安全才现身。',
          speech: '开口第一句仍然是「说定了」，但语气轻了很多。',
          event: '涨潮前在灯塔顶层与林岚相认。',
          isCurrent: 0
        }
      ]
    },
    {
      name: '老周',
      alias: '周叔',
      role: '配角 / 知情人',
      gender: '男',
      age: '六十上下',
      debut: '第二章 旧码头',
      appearance: '背有些驼，手掌粗糙，左耳失聪。\n常年穿一件洗得发白的旧海员夹克。',
      background: '旧码头灯塔的看守人，年轻时跑过远洋船。\n二十年前那场海难后留在灯塔，再没离开过雾港。',
      relations: '林岚父亲：旧识，也是他心里过不去的那一关。\n林雾：曾经的合作者，他替她保守了十年的秘密。',
      goal: '在死之前把真相说给该听的人，又怕说出来会害了还活着的人。',
      notes: '他的沉默不是冷漠，是愧疚。台词尽量短，多用动作和环境代替解释。',
      stages: [
        {
          name: '沉默的看守人',
          period: '第 1-7 章',
          traits: '寡言、警觉、嘴硬心软；对陌生人有本能的排斥。',
          inner: '希望林岚尽快离开雾港，不要重复她父亲和姐姐的路。',
          behavior: '说话时盯着海面；赶人走却会在门口留一盏灯。',
          speech: '一句一停，常用「回去吧」结束对话。',
          event: '在旧码头第一次叫出「林雾」的名字。',
          isCurrent: 1
        },
        {
          name: '交代者',
          period: '第 13 章起 · 灯塔摊牌',
          traits: '仍然谨慎，但不再回避；把愧疚换成了具体的行动。',
          inner: '说完真相，才能有资格请求原谅。',
          behavior: '把保存十年的航海日志和钥匙一起交出来。',
          speech: '开始用完整的句子讲述往事。',
          event: '在灯塔里打开那间锁了十年的储物间。',
          isCurrent: 0
        }
      ]
    }
  ]

  const demoSkills = {
    林岚: [
      { name: '速记', level: '熟练', description: '能把听到的话几乎原样记下来，是她对抗遗忘的方式。' },
      { name: '旧书修复', level: '入门', description: '懂得处理受潮的纸张与字迹，常从旧物里读出时间。' }
    ],
    林雾: [
      { name: '自由潜水', level: '精通', description: '能在雾港外海无装备下潜，熟悉暗流与能见度变化。' },
      { name: '潮汐判读', level: '熟练', description: '看潮位和风向就能判断旧码头的水下通道。' }
    ],
    老周: [
      { name: '航海日志', level: '精通', description: '几十年的潮汐、货单和船号都记在脑子里。' },
      { name: '灯塔值守', level: '熟练', description: '熟悉灯塔每一层结构，也熟悉雾里来船的习惯。' }
    ]
  }

  const seededIds = {}
  seeds.forEach((character, index) => {
    const id = newId()
    seededIds[character.name] = id
    db.prepare(
      'INSERT INTO characters (id, project_id, name, alias, role, gender, age, debut, appearance, background, relations, goal, notes, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      project.id,
      character.name,
      character.alias,
      character.role,
      character.gender ?? '',
      character.age,
      character.debut ?? '',
      character.appearance,
      character.background,
      character.relations,
      character.goal,
      character.notes,
      index * 10,
      t,
      t
    )
    character.stages.forEach((stage, stageIndex) => {
      db.prepare(
        'INSERT INTO character_stages (id, character_id, name, period, traits, inner, behavior, speech, event, is_current, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        newId(),
        id,
        stage.name,
        stage.period,
        stage.traits,
        stage.inner,
        stage.behavior,
        stage.speech,
        stage.event,
        stage.isCurrent,
        stageIndex * 10,
        t,
        t
      )
    })
    demoSkills[character.name]?.forEach((skill, skillIndex) => {
      db.prepare(
        'INSERT INTO character_skills (id, character_id, name, level, description, chapter_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), id, skill.name, skill.level, skill.description, null, skillIndex * 10, t, t)
    })
  })

  // 林雾十年前失踪，总览里从一开始就显示「失踪」
  db.prepare(
    'INSERT INTO character_status_logs (id, character_id, status, period, chapter_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), seededIds['林雾'], 'missing', '十年前', null, '夜潜后失踪，官方结论为溺亡，尸体未寻获。', t)

  const demoRelations = [
    { a: '林岚', b: '林雾', relation: '亲情', period: '十年前', note: '姐姐失踪十年，是她所有行动的起点。' },
    { a: '林岚', b: '老周', relation: '陌生', period: '第一章', note: '童年见过几面，隐约觉得他知道什么。' },
    { a: '林雾', b: '老周', relation: '合作', period: '十年前的夜潜', note: '唯一知道那次夜潜真实目的的人。' }
  ]
  demoRelations.forEach((entry) => {
    const [fromId, toId] = seededIds[entry.a] < seededIds[entry.b]
      ? [seededIds[entry.a], seededIds[entry.b]]
      : [seededIds[entry.b], seededIds[entry.a]]
    db.prepare(
      'INSERT INTO character_relations (id, project_id, from_character_id, to_character_id, relation, period, chapter_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newId(), project.id, fromId, toId, entry.relation, entry.period, null, entry.note, t)
  })
}

function ensureSeedTemplates(projectId) {
  for (const kind of TEMPLATE_KINDS) {
    const existing = db
      .prepare('SELECT id FROM card_templates WHERE project_id = ? AND kind = ?')
      .get(projectId, kind)
    if (existing) continue
    const preset = DEFAULT_TEMPLATES[kind]
    const t = now()
    const templateId = newId()
    db.prepare(
      'INSERT INTO card_templates (id, project_id, kind, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(templateId, projectId, kind, preset.name, preset.description, t, t)
    preset.fields.forEach((field, index) => {
      db.prepare(
        'INSERT INTO card_fields (id, template_id, label, field_type, unit, options, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), templateId, field.label, field.fieldType, field.unit ?? '', field.options ?? '', index * 10, t, t)
    })
  }
}

function demoProjectId() {
  return db
    .prepare("SELECT id FROM projects WHERE name LIKE '雾港来信%' ORDER BY created_at ASC LIMIT 1")
    .get()?.id
}

function seedDemoItems() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM items').get().c
  if (count > 0) return
  const projectId = demoProjectId()
  if (!projectId) return
  ensureSeedTemplates(projectId)
  const t = now()

  const seeds = [
    {
      name: '姐姐的信',
      category: '信物',
      rarity: '稀有',
      origin: '十年前由林雾写下，寄自雾港旧码头。',
      reason: '把林岚引回雾港，也是全书的第一个谜面。',
      debut: '第一章 雨夜来信',
      background:
        '一封没有贴邮票的信，信封旧得发黄，边角泡过水，纸上带着潮气。\n背面只有「林岚收」三个字，字迹瘦长，最后一笔习惯性向上挑。',
      notes: '信上的话是：「别相信潮水退去时看到的东西。」',
      status: 'intact',
      currentHolder: '林岚',
      destroyedBy: '',
      destroyedAt: '',
      events: [
        { period: '十年前', holder: '林雾', status: 'intact', destroyedBy: '', note: '写好信，藏进旧码头储物间的铁盒里。' },
        {
          period: '第一章 雨夜来信',
          holder: '林岚',
          status: 'intact',
          destroyedBy: '',
          note: '信从门缝滑进来，落进林岚手里。'
        }
      ]
    },
    {
      name: '父亲的旧怀表',
      category: '遗物',
      rarity: '稀有',
      origin: '父亲二十年前出海时随身带着的旧表。',
      reason: '是林岚确认父亲那场「海难」真相的线索之一。',
      debut: '第一章 林岚的书桌抽屉',
      background: '表壳边缘有一道被海水泡出的白痕，表停在 03:17。\n父亲出海前说过，等他回来就把它修好。',
      notes: '表盖内侧刻着一串模糊的编号，暂未查到出处。',
      status: 'intact',
      currentHolder: '林岚',
      destroyedBy: '',
      destroyedAt: '',
      events: [
        {
          period: '二十年前 · 海难',
          holder: '林岚父亲',
          status: 'intact',
          destroyedBy: '',
          note: '随船出海。海难后只找回表壳，指针停在 03:17。'
        },
        { period: '第一章', holder: '林岚', status: 'intact', destroyedBy: '', note: '被林岚收在书桌抽屉最里层。' }
      ]
    },
    {
      name: '老周的航海日志',
      category: '证据',
      rarity: '史诗',
      origin: '老周跑远洋船时开始记录，后来用来记雾港的潮汐与货单。',
      reason: '记录着十年前那次夜潜的时间与货单，是揭开真相的关键。',
      debut: '第二章 旧码头（提及，尚未正式出现）',
      background: '封皮被海水泡得发硬，内页夹着几张手绘的潮汐表。\n最后十几页被人撕掉了。',
      notes: '老周把它锁在灯塔储物间，钥匙从不离身。',
      status: 'intact',
      currentHolder: '老周',
      destroyedBy: '',
      destroyedAt: '',
      events: [
        { period: '十年前的夜潜', holder: '老周', status: 'intact', destroyedBy: '', note: '记录下那晚的潮位与接货船只。' },
        { period: '第二章', holder: '老周', status: 'intact', destroyedBy: '', note: '锁进灯塔储物间，暂未交给林岚。' }
      ]
    },
    {
      name: '断裂的铜钥匙',
      category: '钥匙',
      rarity: '普通',
      origin: '旧码头储物间的备用钥匙。',
      reason: '本来可以打开藏信的铁盒，却被人为折断。',
      debut: '十年前回忆',
      background: '钥匙齿口断了一截，断面很新，像是被人用力掰断的。',
      notes: '折断它的人不想让任何人再打开那间储物间。',
      status: 'destroyed',
      currentHolder: '',
      destroyedBy: '老周',
      destroyedAt: '十年前的夜里',
      events: [
        { period: '十年前', holder: '老周', status: 'intact', destroyedBy: '', note: '还能打开储物间的铁盒。' },
        {
          period: '十年前的夜里',
          holder: '老周',
          status: 'destroyed',
          destroyedBy: '老周',
          note: '老周亲手把钥匙掰断，封死了储物间。'
        }
      ]
    }
  ]

  seeds.forEach((item, index) => {
    const id = newId()
    db.prepare(
      'INSERT INTO items (id, project_id, name, category, rarity, origin, reason, debut, background, notes, status, current_holder, is_destroyed, destroyed_by, destroyed_at, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      projectId,
      item.name,
      item.category,
      item.rarity,
      item.origin,
      item.reason,
      item.debut,
      item.background,
      item.notes,
      item.status,
      item.currentHolder,
      item.status === 'destroyed' ? 1 : 0,
      item.destroyedBy,
      item.destroyedAt,
      index * 10,
      t,
      t
    )
    item.events.forEach((event) => {
      db.prepare(
        'INSERT INTO item_events (id, item_id, period, holder, status, destroyed_by, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), id, event.period, event.holder, event.status, event.destroyedBy, event.note, t, t)
    })
  })
}

function seedDemoAttributes() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM attribute_values').get().c
  if (count > 0) return
  const projectId = demoProjectId()
  if (!projectId) return
  ensureSeedTemplates(projectId)
  const t = now()

  const templateOf = (kind) =>
    db.prepare('SELECT id FROM card_templates WHERE project_id = ? AND kind = ?').get(projectId, kind)
  const fieldsOf = (templateId) =>
    db
      .prepare('SELECT id, label FROM card_fields WHERE template_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(templateId)
  const character = db.prepare("SELECT id FROM characters WHERE project_id = ? AND name = '林岚'").get(projectId)
  const item = db.prepare("SELECT id FROM items WHERE project_id = ? AND name = '姐姐的信'").get(projectId)

  const characterTemplate = templateOf('character')
  const itemTemplate = templateOf('item')
  if (!characterTemplate || !itemTemplate) return
  const characterFields = fieldsOf(characterTemplate.id)
  const itemFields = fieldsOf(itemTemplate.id)
  const fieldId = (fields, label) => fields.find((field) => field.label === label)?.id

  const setValue = (entityType, entityId, field, value) => {
    const id = newId()
    db.prepare(
      'INSERT INTO attribute_values (id, entity_type, entity_id, field_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, entityType, entityId, field, value, t, t)
  }
  const addLog = (entityType, entityId, field, value, period, note) => {
    db.prepare(
      'INSERT INTO attribute_logs (id, entity_type, entity_id, field_id, value, period, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newId(), entityType, entityId, field, value, period, note, t)
  }

  if (character) {
    const level = fieldId(characterFields, '等级')
    const stamina = fieldId(characterFields, '体力')
    const intellect = fieldId(characterFields, '智力')
    const spirit = fieldId(characterFields, '精神')
    const luck = fieldId(characterFields, '幸运')
    if (level) setValue('character', character.id, level, '3')
    if (stamina) setValue('character', character.id, stamina, '7')
    if (intellect) setValue('character', character.id, intellect, '8')
    if (spirit) setValue('character', character.id, spirit, '6')
    if (luck) setValue('character', character.id, luck, '2')

    if (level) {
      addLog('character', character.id, level, '1', '第 1 章', '还只是个被旧书和记忆困住的人。')
      addLog('character', character.id, level, '2', '第 6 章', '进入雾港后被迫开始行动。')
      addLog('character', character.id, level, '3', '第 12 章', '涨潮夜之后，学会承担判断。')
    }
    if (stamina) {
      addLog('character', character.id, stamina, '5', '第 1 章', '长期缺乏体力训练。')
      addLog('character', character.id, stamina, '7', '第 12 章', '连续奔走与落水后反而更能撑住。')
    }
  }

  if (item) {
    const rarity = fieldId(itemFields, '稀有度')
    const effect = fieldId(itemFields, '核心效果')
    const durability = fieldId(itemFields, '耐久')
    if (rarity) setValue('item', item.id, rarity, '稀有')
    if (effect) setValue('item', item.id, effect, '指向旧码头储物间的铁盒')
    if (durability) setValue('item', item.id, durability, '4')
  }
}

seedProviders()
seedDemoProject()
seedDemoCharacters()
seedDemoItems()
seedDemoAttributes()

export default db
