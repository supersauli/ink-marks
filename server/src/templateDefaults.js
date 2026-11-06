export const TEMPLATE_KINDS = ['character', 'item']

export const DEFAULT_TEMPLATES = {
  character: {
    name: '人物属性卡',
    description: '角色当前的能力与状态。属性可以随时在模板里增删。',
    fields: [
      { label: '等级', fieldType: 'number', unit: '级', options: '' },
      { label: '体力', fieldType: 'number', unit: '', options: '' },
      { label: '智力', fieldType: 'number', unit: '', options: '' },
      { label: '精神', fieldType: 'number', unit: '', options: '' },
      { label: '幸运', fieldType: 'number', unit: '', options: '' }
    ]
  },
  item: {
    name: '物品属性卡',
    description: '物品的数值、效果与限制。属性可以随时在模板里增删。',
    fields: [
      { label: '稀有度', fieldType: 'select', unit: '', options: '普通,稀有,史诗,传说' },
      { label: '威力', fieldType: 'number', unit: '', options: '' },
      { label: '耐久', fieldType: 'number', unit: '', options: '' },
      { label: '使用次数', fieldType: 'number', unit: '次', options: '' },
      { label: '核心效果', fieldType: 'text', unit: '', options: '' }
    ]
  }
}
