const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the real TypeScript modules with only platform/network boundaries replaced.
function loader(mocks = {}) {
  const cache = new Map();
  return function load(relative, extra = '') {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8') + extra;
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireFrom = name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), name + (path.extname(name) ? '' : '.ts'));
        return load(path.relative(path.resolve(__dirname, '..'), resolved));
      }
      return require(name);
    };
    new Function('require', 'module', 'exports', 'Deno', compiled)(requireFrom, module, module.exports, { serve() {} });
    return module.exports;
  };
}

function edgeInternals() {
  return loader({ 'npm:@supabase/supabase-js@2': { createClient() {} } })(
    'supabase/functions/submit-hand/index.ts',
    '\nmodule.exports = { evaluateBestHand, validatePayload, validateHand, validateEventTiming };'
  );
}

module.exports = { loader, edgeInternals };
