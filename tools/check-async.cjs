const fs=require('fs'), path=require('path'), ts=require('typescript');
function walk(d){let o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())o.push(...walk(p));else if(e.name.endsWith('.js'))o.push(p)}return o}
for(const f of walk('server/src')){
  const text=fs.readFileSync(f,'utf8');
  const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const visit=(node)=>{
    let fn=null;
    if(ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)) fn=node;
    if(fn){
      const isAsync=fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword);
      let hasAwait=false;
      const scan=(n)=>{if(ts.isAwaitExpression(n))hasAwait=true;ts.forEachChild(n,scan)};
      // 只扫描函数体内，跳过嵌套函数
      const body=fn.body;
      if(body){const scanBody=(n)=>{if(ts.isAwaitExpression(n))hasAwait=true;if(n!==fn&&(ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)))return;ts.forEachChild(n,scanBody)};scanBody(body)}
      if(hasAwait&&!isAsync){
        const pos=sf.getLineAndCharacterOfPosition(fn.getStart(sf));
        console.log(`${f}:${pos.line+1}: ${fn.name?.text||'(anonymous)'} 含 await 但非 async`);
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(sf);
}
