const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..', 'lyrics-plus');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = [...manifest.subfiles.filter(file => file !== 'index.js'), 'index.js'];
const bundle = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const result = spawnSync(process.execPath, ['--check', '-'], {input: bundle, encoding: 'utf8'});
if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error));
    process.exit(1);
}
console.log('lyrics bundle: ' + files.length + ' files validated in manifest order');
