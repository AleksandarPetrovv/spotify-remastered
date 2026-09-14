const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../hazy/extensions/link-import.js'), 'utf8');
const code = source.slice(source.indexOf('    let indexingQueue ='), source.indexOf('    let open ='));
const calls = [];
let active = 0;
const queue = Function('addIndexed', code + ';return addIndexedQueued;')(async job => {
    assert.equal(active++, 0);
    calls.push(job.id);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (job.fail) throw new Error('index failure');
    return job.id;
});
(async () => {
    const result = await Promise.allSettled([
        queue({id: 'first', fail: true}, 'playlist', {}),
        queue({id: 'cancelled'}, 'playlist', {}, () => true),
        queue({id: 'second'}, 'playlist', {}),
    ]);
    assert.deepEqual(calls, ['first', 'second']);
    assert.deepEqual(result.map(item => item.status), ['rejected', 'rejected', 'fulfilled']);
    assert.equal(result[2].value, 'second');
    console.log('concurrent import: insertion isolation, cancellation and failure recovery passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
