// UI-only test loader; production modules never import these mocks.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
const harness=pathToFileURL(resolve(root,'scripts/ui-harness.mjs')).href;
registerHooks({
  resolve(specifier,context,next) {
    if(['next/navigation','next/link','@/features/auth/actions'].includes(specifier)||specifier==='./clinic-provider'||specifier==='@/components/clinic-provider')return {url:harness,shortCircuit:true};
    if(specifier.startsWith('@/'))specifier=pathToFileURL(resolve(root,'src',specifier.slice(2))).href;
    if(specifier.startsWith('file:')||specifier.startsWith('.')) {
      const target=new URL(specifier,context.parentURL);
      if(!extname(target.pathname))for(const suffix of ['.ts','.tsx','/index.ts'])if(existsSync(fileURLToPath(target.href+suffix)))return {url:target.href+suffix,shortCircuit:true};
    }
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url.startsWith('file:')&&/\.tsx?$/.test(url)&&!url.includes('/node_modules/'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText};
    return next(url,context);
  },
});
