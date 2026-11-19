// Pulumi serializes each dynamic provider into the state when a resource is created.
// A provider that captures something unserializable only fails during `pulumi up`,
// so serialize the compiled providers here exactly as Pulumi does, then load the
// result in a fresh module scope and check it still has its methods.
const pulumi = require('@pulumi/pulumi');
const { join } = require('node:path');
const Module = require('node:module');

const names = ['sync', 'serverless', 'sip', 'number', 'geo', 'usage'];

(async () => {
  for (const name of names) {
    const { provider } = require(join(__dirname, '..', 'dist', 'resources', `${name}.js`));
    const sf = await pulumi.runtime.serializeFunction(() => provider, {
      allowSecrets: false,
      isFactoryFunction: true,
    });
    const body = sf.text.replace(/exports\.handler = __f0\(\);\s*$/, '');
    if (/\bexports\./.test(body))
      throw new Error(`${name}: serialized code references module exports`);
    const m = new Module(`serialized-${name}`);
    m.paths = Module._nodeModulePaths(__dirname);
    m._compile(sf.text, join(__dirname, `serialized-${name}.js`));
    const loaded = m.exports[sf.exportName];
    for (const method of ['create', 'diff', 'update', 'delete']) {
      if (typeof loaded[method] !== 'function') throw new Error(`${name}: ${method} missing`);
    }
    console.log(`ok  ${name} (${sf.text.length} bytes)`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
