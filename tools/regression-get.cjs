const BASE='http://127.0.0.1:8787/api'
let pass=0,fail=0
async function req(path){const r=await fetch(BASE+path);let d=null;try{d=await r.json()}catch(e){};return {status:r.status,data:d}}
;(async()=>{
  const projects=await req('/projects')
  const pid=projects.data?.[0]?.id
  const chs=await req('/chapters?projectId='+pid)
  const ch=chs.data?.[0]
  const chars=await req('/characters?projectId='+pid)
  const char=chars.data?.[0]
  const items=await req('/items?projectId='+pid)
  const item=items.data?.[0]
  const tmpls=await req('/card-templates?projectId='+pid)
  const tmpl=tmpls.data?.[0]

  const tests=[
    ['/projects', pid],
    ['/chapters?projectId='+pid, ch?.id],
    ['/chapters/search?projectId='+pid+'&q=', null],
    ['/chapters/'+ch?.id, null],
    ['/characters?projectId='+pid, char?.id],
    ['/characters/'+char?.id, null],
    ['/items?projectId='+pid, item?.id],
    ['/items/'+item?.id, null],
    ['/overview?projectId='+pid, null],
    ['/card-templates?projectId='+pid, tmpl?.id],
    ['/card-templates/'+tmpl?.id, null],
    ['/attributes?entityType=character&entityId='+char?.id, null],
    ['/chat/messages?projectId='+pid, null],
    ['/providers', null],
    ['/usage/stats', null],
    ['/usage/logs', null],
    ['/versions?projectId='+pid, null],
    ['/chapters/'+ch?.id+'/revisions', null]
  ]
  // 先验证页面主数据能加载，再测详情
  for(const [path] of tests){
    if(path.includes('undefined')){ console.log('  - 跳过(无ID): '+path); continue }
    try{
      const r=await req(path)
      const good=r.status>=200&&r.status<300
      if(good){console.log('  ✓ '+r.status+' '+path);pass++}
      else{console.log('  ✗ '+r.status+' '+path+' '+JSON.stringify(r.data).slice(0,80));fail++}
    }catch(e){console.log('  ✗ ERR '+path+' '+e.message);fail++}
  }
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
  process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
