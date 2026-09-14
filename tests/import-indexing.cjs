const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../hazy/extensions/link-import.js'), 'utf8');
const code = source.slice(source.indexOf('    async function addIndexed('), source.indexOf('    let open = false;'));
async function scenario(registered, existing) {
  const calls = [];
  let enabled = false, indexed = false, present = existing;
  const track = {uri:'spotify:local:artist:youtube:song:20', name:'song', artists:[{name:'artist'}], album:{name:'Youtube'}, duration:{milliseconds:20000}};
  const Spicetify = {Platform:{
    LocalFilesAPI:{getIsEnabled:async()=>enabled, setIsEnabled:async()=>{await Promise.resolve(); enabled=true;},
      getSources:async()=>({folders:registered?[{path:'C:\\support\\Local Songs'}]:[]}),
      removeFolder:async({path})=>{assert.ok(enabled);calls.push(['remove',path]);},
      addFolder:async({path})=>{assert.ok(enabled);calls.push(['add',path]);indexed=true;},
      getTracks:async()=>indexed?[track]:[]},
    PlaylistAPI:{getContents:async()=>({items:present?[{uri:track.uri}]:[]}),add:async(uri, tracks)=>{assert.deepEqual(tracks,[track.uri]);present=true;calls.push(['playlist',uri]);}}
  }};
  const addIndexed = Function('Spicetify','sleep',code+';return addIndexed;')(Spicetify,async()=>{});
  await addIndexed({folder:'C:\\support\\local songs', title:'song',artist:'artist',source:'YouTube',duration:20},'spotify:playlist:test',{});
  assert.equal(calls.filter(c=>c[0]==='remove').length,registered?1:0);
  assert.equal(calls.filter(c=>c[0]==='add').length,1);
  assert.equal(calls.filter(c=>c[0]==='playlist').length,existing?0:1);
}
(async()=>{await scenario(true,false);await scenario(false,false);await scenario(true,true);console.log('import indexing: 3 scenarios passed');})().catch(e=>{console.error(e);process.exitCode=1;});
