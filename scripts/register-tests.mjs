// Test-only TypeScript loader using the already installed compiler. No runtime dependency.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
registerHooks({
  resolve(specifier,context,next) {
    if(specifier==='next/headers'||specifier==='next/cache')specifier+='.js';
    if(specifier.startsWith('@/'))specifier=pathToFileURL(resolve(root,'src',specifier.slice(2))).href;
    if(specifier.startsWith('file:')||specifier.startsWith('.')) {
      const target=new URL(specifier,context.parentURL);
      if(!extname(target.pathname)){
        for(const suffix of ['.ts','/index.ts']) {
          const candidate=target.href+suffix;
          if(existsSync(fileURLToPath(candidate)))return {url:candidate,shortCircuit:true};
        }
      }
    }
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url.startsWith('file:')&&url.endsWith('.ts')&&!url.includes('/node_modules/')) {
      const source=readFileSync(fileURLToPath(url),'utf8');
      return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
    }
    return next(url,context);
  },
});
