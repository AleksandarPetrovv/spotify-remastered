const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../hazy/hazy.js'), 'utf8');
const code = source.slice(source.indexOf('    remove.onclick = async () =>'), source.indexOf('    removalActions.append('));
async function scenario(hasLocalSongs) {
  const requests = [];
  const context = {
    remove: {}, removalStatus: {}, songWarning: { hidden: true }, openSongs: { hidden: true }, note: {},
    cancelRemoval: {}, confirmed: false, finishReady: false, running: false, session: undefined, tabs: { children: [] },
    requestRemoval: async url => { requests.push(url); return { url: 'http://worker', token: 'private', hasLocalSongs, status: 'running' }; },
    paintRemoval: () => {}, watchRemoval: () => {},
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  await context.remove.onclick();
  if (hasLocalSongs) {
    assert.equal(requests.length, 1);
    assert.equal(context.songWarning.hidden, false);
    assert.equal(context.openSongs.hidden, false);
    assert.equal(context.remove.textContent, 'Continue');
    await context.remove.onclick();
  }
  assert.equal(requests.length, 2);
  assert.ok(requests[1].includes('/check?token='));
  assert.ok(!requests[1].includes('/start'));
  assert.equal(context.running, true);
  assert.equal(context.songWarning.hidden, true);
  context.running = false;
  context.finishReady = true;
  await context.remove.onclick();
  assert.equal(requests.length, 3);
  assert.ok(requests[2].includes('/start?token='));
  assert.ok(requests[2].endsWith('&deleteSongs=1'));
}
(async () => { await scenario(true); await scenario(false); console.log('uninstall ui: warning and direct-start scenarios passed'); })().catch(error => { console.error(error); process.exitCode = 1; });
