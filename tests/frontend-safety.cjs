const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'hazy/extensions/link-import.js'), 'utf8');
const notice = source.slice(source.indexOf('    function showImportNotice('), source.indexOf('    function sourceError('));
const closing = source.slice(source.indexOf('        async function close(cancelImport=false)'), source.indexOf('        function click(event)', source.indexOf('        async function close(cancelImport=false)')));

function importFixture(bridge) {
    const node = {style: {}, setAttribute(name, value) {this[name] = value;}, remove() {}};
    const env = {
        collection: null, bulkProgress: null, lastSavedId: null, closing: false, cancel: {disabled: false}, closed: false, open: true, timer: null, importing: true,
        cancelled: false, importId: 'test', title: {value: 'song'}, artist: {value: 'artist'}, name: 'playlist',
        job: {id: 'test', status: 'downloading'}, background: null, reduced: true, removed: [], hidden: 0,
        Spicetify: {PopupModal: {hide() {env.hidden++;}}},
        document: {getElementById() {return null;}, createElement() {return node;}, body: {appendChild() {}}},
        window: {SpotifyRemasteredDownloads: bridge, removeEventListener(name) {env.removed.push(name);}},
        overlay: {removeEventListener(name) {env.removed.push(name);}, animate() {return {finished: Promise.resolve()};}},
        root: {isConnected: true}, setTimeout() {}, clearTimeout() {}, request: async () => {throw new Error('folder failed');},
        keydown() {}, click() {}, pointerdown() {}, pointermove() {}, resetPress() {}
    };
    const functions = Function('env', 'with(env) {let noticeTimer; ' + notice + closing + '; return {close, showImportNotice};}')(env);
    return {env, node, ...functions};
}

(async () => {
    for (const bridge of [undefined, {backgroundImport() {throw new Error('bridge failed');}}]) {
        const fixture = importFixture(bridge);
        await fixture.close();
        assert.equal(fixture.env.hidden, 1);
        assert.equal(fixture.env.open, false);
        assert.ok(fixture.env.removed.includes('pointerdown'));
        assert.ok(fixture.env.removed.includes('keydown'));
        assert.equal(fixture.node.textContent, 'Import continues in the background.');
    }
    let task;
    const fixture = importFixture({backgroundImport(value) {task = value; return {};} });
    await fixture.close();
    await task.openFolder();
    assert.equal(fixture.node.textContent, 'folder failed');
    assert.equal(fixture.node.role, 'alert');
    fixture.showImportNotice('<img src=x onerror=alert(1)>');
    assert.equal(fixture.node.textContent, '<img src=x onerror=alert(1)>');

    let requests = 0;
    let cacheReads = 0;
    const context = {window: {}, CacheManager: {async get() {cacheReads++; return null;}, set() {}},
        Spicetify: {CosmosAsync: {async get(url) {requests++; assert.ok(url.endsWith('A'.repeat(22))); return {tempo: 120};}}}};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(repo, 'lyrics-plus/services/LyricsFetcher.js'), 'utf8'), context);
    const fetcher = context.window.LyricsFetcher;
    const local = await fetcher.fetchTempo('spotify:local:artist:album:title:180');
    assert.equal(local, '0.2s');
    assert.equal(requests, 0);
    assert.equal(cacheReads, 0);
    fetcher._currentRequestUri = 'spotify:track:' + 'A'.repeat(22);
    await fetcher.fetchTempo(fetcher._currentRequestUri);
    assert.equal(requests, 1);
    assert.equal(cacheReads, 1);
    console.log('frontend safety: 5 scenarios passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
