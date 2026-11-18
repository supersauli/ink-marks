// AST: 找 res.json(X) / .json(X)，X 是对「已知 async 函数」的调用但未被 await
const fs=require('fs'), path=require('path'), ts=require('typescript')
function walk(d){let o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())o.push(...walk(p));else if(e.name.endsWith('.js'))o.push(p)}return o}
// 收集所有 export async function 名
const asyncNames=new Set()
for(const f of walk('server/src')){
  const t=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,t,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const v=(n)=>{if(ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)&&n.name)asyncNames.add(n.name.text);if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isArrowFunction(n.initializer)&&n.initializer.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)&&ts.isIdentifier(n.name))asyncNames.add(n.name.text);ts.forEachChild(n,v)};v(sf)
}
let found=0
for(const f of walk('server/src')){
  const t=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,t,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const v=(n)=>{
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='json'&&n.arguments[0]){
      const arg=n.arguments[0]
      // 参数是 CallExpression 且调用的是已知 async 函数，且参数本身不是 await 表达式
      if(ts.isCallExpression(arg)&&ts.isIdentifier(arg.expression)&&asyncNames.has(arg.expression.text)){
        const lc=sf.getLineAndCharacterOfPosition(n.getStart(sf))
        console.log(`${f}:${lc.line+1}: res.json(${arg.expression.text}(...)) 未 await`)
        found++
      }
    }
    ts.forEachChild(n,v)
  };v(sf)
}
console.log('可疑点:',found)
