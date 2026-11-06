export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface WritingContext {
  projectName?: string
  styleText?: string
  outlineText?: string
  charactersText?: string
  chapterTitle?: string
  chapterSummary?: string
  bodyText?: string
  selectionText?: string
  beforeText?: string
  afterText?: string
}

const EDITOR_SYSTEM = `你是一位资深的中文小说编辑与写手，擅长在保留作者原意与叙事风格的前提下改写文字。

必须遵守：
1. 只输出改写后的正文本身，不要任何解释、前言、标题，也不要用 Markdown 代码块包裹；
2. 保持人称、叙述视角、时态、人物姓名与情节前后一致；
3. 除非要求中明确说明，不要新增会改变剧情走向的关键情节；
4. 若提供了角色设定，人物的言行必须符合其中「当前阶段」的性格、动机与语言习惯，不要提前写出后续阶段的成长结果；
5. 若提供了【写作风格】，其中关于视角、人称、句式、语气与禁忌的要求优先级高于你自己的默认文风，必须严格遵守；
6. 使用简体中文，标点符合中文规范，不要出现明显的 AI 腔套话。`

const CHAT_SYSTEM = `你是一位陪伴作者写小说的中文创作助手。你可以讨论情节、人物动机、节奏与文风，也可以按作者要求给出改写建议。

要求：
1. 回答具体、简洁，优先给出可执行的建议或示例文字；
2. 若作者提供的上下文不足以判断，先提出一个关键问题，不要凭空编造设定；
3. 讨论人物时，先确认其「当前阶段」的性格与动机，再判断行为是否成立；
4. 涉及改写时，先给思路，再给一小段示例；
5. 若提供了【写作风格】，讨论与示例文字也要符合其中的视角、语气与禁忌；
6. 使用简体中文。`

function contextBlock(context: WritingContext): string {
  const parts: string[] = []
  if (context.projectName) parts.push(`【作品】${context.projectName}`)
  if (context.styleText) parts.push(`【写作风格】\n${context.styleText}`)
  if (context.outlineText) parts.push(`【全书大纲】\n${context.outlineText}`)
  if (context.charactersText) parts.push(`【角色设定】\n${context.charactersText}`)
  if (context.chapterTitle) parts.push(`【当前章节】${context.chapterTitle}`)
  if (context.chapterSummary) parts.push(`【章节大纲】\n${context.chapterSummary}`)
  if (context.bodyText) parts.push(`【章节正文（节选）】\n${context.bodyText}`)
  if (context.selectionText) parts.push(`【当前选中的文字】\n${context.selectionText}`)
  if (context.beforeText) parts.push(`【前文片段】\n${context.beforeText}`)
  if (context.afterText) parts.push(`【后文片段】\n${context.afterText}`)
  return parts.join('\n\n')
}

export function buildSnippetMessages(options: {
  instruction: string
  paragraph: string
  snippet: string
  context: WritingContext
}): PromptMessage[] {
  const context = contextBlock(options.context)
  const prompt = `${context ? context + '\n\n' : ''}【所在段落原文】\n${options.paragraph}

【需要改写的片段】
<<<${options.snippet}>>>

【改写要求】
${options.instruction}

【输出要求】
只输出用来替换 <<<...>>> 中片段的新文字，不要动片段之外的任何内容，不要保留 <<< >>> 标记。`

  return [
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: prompt }
  ]
}

export function buildBlockMessages(options: {
  instruction: string
  text: string
  index: number
  total: number
  context: WritingContext
}): PromptMessage[] {
  const context = contextBlock(options.context)
  const prompt = `${context ? context + '\n\n' : ''}【需要改写的段落${options.total > 1 ? `（第 ${options.index + 1}/${options.total} 段）` : ''}】\n${options.text}

【改写要求】
${options.instruction}

【输出要求】
只输出改写后的完整段落，保持段落的叙事作用不变。`

  return [
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: prompt }
  ]
}

export function buildChapterSummaryMessages(options: {
  instruction: string
  chapterTitle: string
  currentSummary: string
  context: WritingContext
}): PromptMessage[] {
  const context = contextBlock(options.context)
  const prompt = `${context ? context + '\n\n' : ''}【任务】为章节《${options.chapterTitle}》撰写章节大纲。
${
  options.currentSummary.trim()
    ? `【现有章节大纲（请在其基础上优化，不要另起炉灶）】\n${options.currentSummary}\n`
    : ''
}
【补充要求】
${options.instruction}

【写作要求】
1. 写成像作家给自己看的节拍表：场景、人物行动、冲突、转折、结尾钩子；
2. 与全书大纲衔接，不提前泄露后续章节的关键信息；
3. 300-600 字，可以用短句分条，不要写成正文。`

  return [
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: prompt }
  ]
}

export function buildOutlineMessages(options: {
  instruction: string
  title: string
  content: string
  projectDescription?: string
  context: WritingContext
}): PromptMessage[] {
  const context = contextBlock(options.context)
  const prompt = `${context ? context + '\n\n' : ''}【大纲条目】${options.title}
${options.projectDescription ? `【作品简介】${options.projectDescription}\n` : ''}
【现有内容】
${options.content || '（暂无内容，请从零撰写）'}

【修改要求】
${options.instruction}

【输出要求】
只输出修改后的该条目内容，保持条理清晰，可分点叙述；不要输出条目名称以外的标题。`

  return [
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: prompt }
  ]
}

export function buildContinueMessages(options: {
  instruction: string
  chapterTitle: string
  context: WritingContext
  tail: string
}): PromptMessage[] {
  const context = contextBlock(options.context)
  const prompt = `${context ? context + '\n\n' : ''}【任务】续写章节《${options.chapterTitle}》的正文。
【已有正文结尾】
${options.tail || '（未附带已有正文，请依据章节大纲与角色设定续写）'}

【续写要求】
${options.instruction}

【输出要求】
1. 只输出新写的正文，接着已有情节往下写，不要重复已有内容；
2. 分 2-4 个自然段，段落之间用空行分隔；
3. 保持原文的叙述视角、语感和细节密度。`

  return [
    { role: 'system', content: EDITOR_SYSTEM },
    { role: 'user', content: prompt }
  ]
}

export function buildChatSystemPrompt(context: WritingContext): string {
  const block = contextBlock(context)
  return block ? `${CHAT_SYSTEM}\n\n【当前创作上下文】\n${block}` : CHAT_SYSTEM
}
