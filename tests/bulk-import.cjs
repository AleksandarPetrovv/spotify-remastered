const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../hazy/extensions/link-import.js'), 'utf8');
const metadataCode=source.slice(source.indexOf('    function songMetadata('),source.indexOf('    async function addIndexed('));
const songMetadata=Function(metadataCode+';return songMetadata;')();
assert.deepEqual(songMetadata('Artist - Song (Official Music Video) [HD]','Uploader'),{title:'Song',artist:'Artist'});
assert.deepEqual(songMetadata('Song [Official Audio]','Uploader'),{title:'Song',artist:'Uploader'});
assert.deepEqual(songMetadata('Artist - Song (Live at Tokyo)','Uploader'),{title:'Song (Live at Tokyo)',artist:'Artist'});
const code = source.slice(source.indexOf('        async function runBulk()'), source.indexOf('        primary.onclick='));
async function scenario(failSecond, cancelAfterFirst) {
  const order = [];
  let index = -1;
  const env = {songMetadata,collection:{id:'collection',entries:[1,2,3].map(n=>({url:'song'+n,title:'song'+n,...(n===1?{titleEdit:'edited title',artistEdit:'edited artist'}:{})}))}, importing:false, cancelled:false,
    bulkProgress:null, lastSavedId:null, job:null, status:{}, primary:{}, another:{}, uri:'playlist', name:'test',
    renderBulk(){}, stopped(){return env.cancelled;}, background:{update(){},finish(status){env.finished=status;}},
    async request(route,body){
      if(route==='link-preview'){index++;order.push(body.url);return {id:String(index),status:'previewing'};}
      if(route==='link-download' && index===0){assert.equal(body.title,'edited title');assert.equal(body.artist,'edited artist');}
      if(route==='link-download')return {id:String(index),status:'downloading'};
      return {};
    },
    async waitJob(id,phase){if(phase==='previewing'&&index===1&&failSecond)throw new Error('unavailable');return {id,status:phase==='previewing'?'ready':'done',title:'song'+(index+1),artist:'artist',source:'YouTube',duration:20};},
    async addIndexed(){if(cancelAfterFirst)env.cancelled=true;return index===1?'existing':'added';}
  };
  const run = Function('env','with(env){'+code+';return runBulk;}')(env);
  await run();
  assert.deepEqual(order,cancelAfterFirst?['song1']:['song1','song2','song3']);
  assert.equal(env.bulkProgress.failed.length,failSecond?1:0);
  assert.equal(env.bulkProgress.added,cancelAfterFirst?1:2);
  assert.equal(env.collection.entries[0].added,true);
  if(failSecond)assert.equal(env.collection.entries[1].added,undefined);
  assert.equal(env.importing,false);
  assert.equal(env.finished,cancelAfterFirst?'cancelled':'done');
}
async function nested(cycle) {
  const added=[];
  const env={songMetadata,collection:{id:'root',entries:[{url:'album',title:'album'},{url:'tail',title:'tail'}]},importing:false,cancelled:false,bulkProgress:null,lastSavedId:null,job:null,status:{},primary:{},another:{},uri:'playlist',name:'test',renderBulk(){},stopped(){return false;},background:null,
    async request(route,body){return {id:body?.url||body?.id,status:'ready'};},
    async waitJob(id,phase){return id==='album'?{id,status:'ready',entries:cycle?[{url:'album'}]:[{url:'first'},{url:'second'}]}:{id,status:phase==='previewing'?'ready':'done',title:id,artist:'artist'};},
    async addIndexed(job){added.push(job.title);return 'added';}};
  await Function('env','with(env){'+code+';return runBulk;}')(env)();
  assert.deepEqual(added,cycle?['tail']:['first','second','tail']);
  assert.equal(env.bulkProgress.failed.length,cycle?1:0);
}
(async()=>{await scenario(false,false);await scenario(true,false);await scenario(false,true);await nested(false);await nested(true);console.log('bulk import: ordering, partial failure, cancellation, nested expansion and cycle handling passed');})().catch(e=>{console.error(e);process.exitCode=1;});
