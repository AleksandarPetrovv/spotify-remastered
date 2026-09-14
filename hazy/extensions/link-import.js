(async function () {
    while (!window.Spicetify?.Platform?.History || !Spicetify.PopupModal) await new Promise(resolve => setTimeout(resolve, 200));
    const icon = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="M12 22V3c0 5 8 5 8 10 0 2-1 3-3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7.5" cy="23" rx="4.7" ry="3.2" transform="rotate(-20 7.5 23)" fill="currentColor"/><path d="M24 19.2v9.6M19.2 24h9.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const style = document.createElement('style');
    style.textContent = `
        .sr-link-button {border:0;background:transparent;color:var(--spice-subtext);width:40px;height:40px;padding:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;border-radius:8px;transition:transform .25s ease}
        .sr-link-button:hover {color:var(--spice-text);background:transparent;transform:scale(1.1)}
        .sr-link-button:focus-visible {outline:2px solid var(--spice-text);outline-offset:3px}
        .sr-link-button svg {overflow:visible;stroke:none}
        .spicetify-popup-container:has(#sr-link-import) {width:520px!important;max-width:calc(100vw - 48px)!important;max-height:calc(100vh - 48px)!important;overflow-y:auto}
        #sr-link-import {display:flex;flex-direction:column;gap:20px;color:var(--spice-text);font-size:14px}
        #sr-link-import p {margin:0;color:var(--spice-subtext);line-height:1.5}
        .sr-bulk-queue {max-height:min(360px,calc(100vh - 420px))!important;min-height:120px;scrollbar-color:var(--spice-subtext) transparent;scrollbar-width:thin}
        .sr-bulk-queue::-webkit-scrollbar-button {display:none;width:0;height:0}
        .sr-bulk-row {min-height:38px!important;gap:12px}
        .sr-bulk-row span {width:24px;flex-shrink:0;color:var(--spice-subtext)}
        .sr-bulk-fields {display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
        #sr-link-import .sr-bulk-edit {display:block;text-align:left;border:0;background:transparent;padding:2px 0;border-radius:3px;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4}
        #sr-link-import .sr-bulk-edit:hover:not(:disabled) {background:transparent;text-decoration:underline;text-underline-offset:3px}
        #sr-link-import .sr-bulk-edit[data-field=title] {font-weight:500}
        #sr-link-import .sr-bulk-edit[data-field=artist] {font-size:12px;color:var(--spice-subtext)}
        #sr-link-import .sr-bulk-edit:disabled {opacity:1}
        #sr-link-import .sr-bulk-fields input {height:30px;min-width:0;padding:0 8px}
        .sr-bulk-row {flex-shrink:0}
        .sr-link-tabs {display:flex;gap:8px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px}
        #sr-link-import button {font:inherit;cursor:pointer;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:transparent;color:var(--spice-text);padding:9px 14px}
        #sr-link-import button:hover {background:rgba(255,255,255,.08)}
        #sr-link-import button[aria-selected=true] {background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25)}
        #sr-link-import button:disabled {opacity:.45;cursor:default}
        #sr-link-import input {box-sizing:border-box;width:100%;height:40px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:0 12px;color:var(--spice-text);font:inherit}
        #sr-link-import input:focus {outline:2px solid var(--spice-button);outline-offset:2px}
        .sr-link-field {display:flex;flex-direction:column;gap:8px}
        .sr-link-preview {display:flex;gap:12px;align-items:center}
        .sr-link-preview img {width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0}
        .sr-link-preview div {min-width:0;overflow:hidden}
        .sr-link-preview strong {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sr-link-actions {display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
        .sr-local-list {max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:4px}
        .sr-local-row {display:flex;align-items:center;gap:12px;padding:8px;border-radius:6px;min-height:56px}
        .sr-local-row:hover {background:rgba(255,255,255,.04)}
        .sr-local-cover {width:40px;height:40px;border-radius:4px;object-fit:cover;flex-shrink:0;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center}
        .sr-local-info {min-width:0;flex:1}
        .sr-local-info strong,.sr-local-info p {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .sr-local-info strong {font-size:14px;display:block}
        #sr-link-import .sr-local-info p {font-size:13px;margin-top:3px}
        .sr-local-time {font-size:13px;color:var(--spice-subtext);font-variant-numeric:tabular-nums}
        #sr-link-import .sr-local-add {border-radius:9999px;padding:5px 14px;height:32px;min-width:60px;font-weight:700;flex-shrink:0}
        #sr-link-import .sr-local-add:hover:not(:disabled) {background:transparent;border-color:var(--spice-text);transform:scale(1.04)}
        #sr-link-import .sr-link-primary {background:var(--spice-button);color:var(--spice-main);border:0;font-weight:700}
        #sr-link-import .sr-link-status {padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
        @media (prefers-reduced-motion:reduce) {.sr-link-button {transition:none}.sr-link-button:hover {transform:none}}
    `;
    document.head.appendChild(style);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let noticeTimer;
    function showImportNotice(message, error=false) {
        try {
            if (typeof Spicetify.showNotification === 'function') {
                Spicetify.showNotification(message, error);
                return;
            }
        } catch {}
        let notice=document.getElementById('sr-import-notice');
        if(!notice) {
            notice=document.createElement('div');notice.id='sr-import-notice';
            notice.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:9999;background:#202020;color:#fff;padding:12px 20px;border-radius:8px;max-width:80vw;box-shadow:0 4px 16px #0008';
            document.body.appendChild(notice);
        }
        notice.setAttribute('role',error?'alert':'status');notice.textContent=message;
        clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.remove(),5000);
    }
    function sourceError(message) {
        if (/404|not found|does not exist|deleted|removed|unavailable video|video unavailable/i.test(message)) return 'Song not found. Check the link or try another upload.';
        if (/confirm your age|age.restrict|sign in|log.?in|private|members.only|premium|not available in your country|geo.restrict/i.test(message)) return 'This song is restricted. Try a public upload.';
        if (/429|too many requests|rate.limit/i.test(message)) return 'Too many requests. Please try again shortly.';
        if (/timed? out|timeout|unable to download|connection|network/i.test(message)) return 'Could not reach the song. Please try again.';
        return 'Could not download this song. Check the link or try another upload.';
    }
    async function request(path, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), path==='link-download' || path==='link-local' ? 120000 : 15000);
        try {
            const response = await fetch('http://127.0.0.1:27382/' + path, {signal:controller.signal,
                ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
            if (!response.ok) throw new Error('The download helper is unavailable.');
            const result = await response.json();
            if (result.status === 'error') {
                const message = result.message || 'The import failed.';
                throw new Error(/^ERROR:|HTTP Error|AudioProviderError|ExtractorError/i.test(message) ? sourceError(message) : message);
            }
            return result;
        } catch (error) {
            if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the download helper. Try again after restarting it.');
            throw error;
        } finally { clearTimeout(timer); }
    }
    function element(tag, text, cls) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }
    function validLink(value, source) {
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
            return source === 'YouTube'
                ? /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/.test(url.hostname)
                : /^(www\.|m\.)?soundcloud\.com$|^on\.soundcloud\.com$|^snd\.sc$/.test(url.hostname);
        } catch { return false; }
    }
    function songMetadata(rawTitle, uploader) {
        const garbage=/\b(?:official\s*(?:music\s*)?(?:video|audio|visuali[sz]er|lyric(?:s)?(?:\s*video)?)|music\s*video|lyric(?:s)?\s*video|HD|HQ|4K|1080p|720p)\b/gi;
        let cleaned=String(rawTitle || '').replace(/\([^)]*\)|\[[^\]]*\]/g,group=>{
            const remaining=group.slice(1,-1).replace(garbage,'').replace(/[\s|,/:-]/g,'');
            return remaining?group:'';
        });
        cleaned=cleaned.replace(/(?:\s*[-|:]\s*|\s+)(?:official\s*(?:music\s*)?(?:video|audio|visuali[sz]er|lyric(?:s)?(?:\s*video)?)|music\s*video|lyric(?:s)?\s*video|HD|HQ|4K|1080p|720p)\s*$/gi,'').trim();
        const parts=cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
        return {title:(parts?parts[2]:cleaned).trim().slice(0,200),artist:String(parts?parts[1]:uploader || 'Unknown artist').trim().slice(0,200)};
    }
    async function addIndexed(job, uri, status, cancelled = () => false) {
        const local = Spicetify.Platform.LocalFilesAPI;
        const playlist = Spicetify.Platform.PlaylistAPI;
        if (!local?.addFolder || !local?.getTracks || !playlist?.add) throw new Error('Downloaded, but this Spotify version does not expose local-file import. Add it from Local Files manually.');
        if (!await local.getIsEnabled()) await local.setIsEnabled(true);
        const sources = await local.getSources();
        const normalize = path => path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
        const registered = sources.folders.find(folder => normalize(folder.path) === normalize(job.folder));
        if (registered) {
            if (!local.removeFolder) throw new Error('Downloaded, but Spotify cannot refresh the local songs folder. Restart Spotify and retry.');
            await local.removeFolder({path:registered.path});
        }
        await local.addFolder({path:job.folder});
        status.textContent = job.reused ? 'Already downloaded. Adding to your playlist…' : 'Downloaded. Waiting for Spotify to find the song…';
        const deadline = Date.now() + 60000;
        let track;
        while (Date.now() < deadline) {
            if (cancelled()) throw new Error('The MP3 was saved. Playlist insertion cancelled.');
            const tracks = await local.getTracks(undefined, job.title);
            const matches = tracks.filter(item => item.name === job.title
                && (job.artist ? item.artists.some(artist => artist.name === job.artist) : !item.artists.length)
                && item.album.name.toLowerCase() === job.source.toLowerCase()
                && Math.abs(item.duration.milliseconds / 1000 - job.duration) < 3);
            const uniqueMatches=[...new Map(matches.map(item=>[item.uri,item])).values()];
            if (uniqueMatches.length === 1) { track = uniqueMatches[0]; break; }
            if (uniqueMatches.length > 1) throw new Error('Downloaded, but several local songs match. Choose the correct one from Local Files.');
            await sleep(1500);
        }
        if (!track) throw new Error('Downloaded, but Spotify has not indexed it yet. The MP3 is safe in local songs; add it from Local Files.');
        if (cancelled()) throw new Error('The MP3 was saved. Playlist insertion cancelled.');
        async function containsTrack() {
            let offset=0;
            while(true){
                const content=await playlist.getContents(uri,{offset,limit:100});
                const items=content.items || [];
                if(items.some(item=>(item.uri || item.track?.uri)===track.uri))return true;
                if(items.length<100)return false;
                offset+=items.length;
            }
        }
        if(await containsTrack())return 'existing';
        if(cancelled())throw new Error('The MP3 was saved. Playlist insertion cancelled.');
        status.textContent = 'Adding to your playlist…';
        await playlist.add(uri, [track.uri], {after:'end'});
        for (let attempt = 0; attempt < 8; attempt++) {
            let offset = 0;
            while (true) {
                const content = await playlist.getContents(uri, {offset,limit:100});
                const items = content.items || [];
                if (items.some(item => (item.uri || item.track?.uri) === track.uri)) return;
                if (items.length < 100) break;
                offset += items.length;
            }
            await sleep(750);
        }
        throw new Error('Downloaded, but playlist insertion could not be confirmed. Check the playlist before adding it manually.');
    }
    let open = false;
    function showImport(uri, name) {
        if (open) return;
        open = true;
        let source = 'YouTube', job = null, busy = false, closed = false, timer = null;
        let importing = false, cancelled = false, background = null;
        let collection = null, bulkProgress = null, lastSavedId = null;
        const stopped = () => cancelled || (closed && !importing);
        const importId = crypto.randomUUID();
        const root = element('div'); root.id = 'sr-link-import';
        root.append(element('p', 'Add songs to “' + name + '”. MP3s stay in Spotify Remastered’s local songs folder.'));
        const tabs = element('div', null, 'sr-link-tabs'); tabs.setAttribute('role','tablist');
        const input = element('input'); input.type = 'url'; input.placeholder = 'Paste a YouTube song or collection link'; input.setAttribute('aria-label','Song or collection link');
        const status = element('p', '', 'sr-link-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
        const preview = element('div'); preview.hidden = true;
        function field(label) { const wrap = element('label',label,'sr-link-field');const value=element('input');value.maxLength=200;wrap.append(value);preview.append(wrap);return value; }
        const title = field('Title'), artist = field('Artist');
        preview.style.cssText='display:none;flex-direction:column;gap:16px';
        const coverRow=element('div',null,'sr-link-preview');
        const bulkList=element('div',null,'sr-local-list sr-bulk-queue');bulkList.hidden=true;
        root.append(tabs,input,coverRow,preview,bulkList,status);
        const actions=element('div',null,'sr-link-actions');root.append(actions);
        const cancel=element('button','Cancel'), primary=element('button','Find link','sr-link-primary');actions.append(cancel,primary);
        const another=element('button','Add another','sr-link-primary');another.hidden=true;actions.append(another);
        const localPanel=element('div');localPanel.hidden=true;localPanel.style.cssText='display:none;flex-direction:column;gap:12px';
        const search=element('input');search.type='search';search.placeholder='Search local songs';search.setAttribute('aria-label','Search local songs');
        const localList=element('div',null,'sr-local-list');localPanel.append(search,localList);status.before(localPanel);
        let localSongs=[], localVersion=0;
        function renderLocal() {
            localList.replaceChildren();
            const query=search.value.trim().toLocaleLowerCase();
            const songs=localSongs.filter(song=>(song.title+' '+song.artist).toLocaleLowerCase().includes(query));
            if(!songs.length){localList.append(element('p',localSongs.length?'No matching songs.':'No local songs yet. Import a song from YouTube or SoundCloud to get started.'));return;}
            for(const song of songs){
                const row=element('div',null,'sr-local-row');
                const image=element(/^https:\/\//.test(song.cover || '')?'img':'span',null,'sr-local-cover');
                if(image.tagName==='IMG'){image.src=song.cover;image.alt='';image.onerror=()=>{const fallback=element('span','♪','sr-local-cover');image.replaceWith(fallback);};}else image.textContent='♪';
                const info=element('div',null,'sr-local-info');const heading=element('strong',song.title);heading.title=song.title;const subtitle=element('p',song.artist || 'Unknown artist');subtitle.title=subtitle.textContent;info.append(heading,subtitle);
                const seconds=Math.round(song.duration);const duration=element('span',Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'),'sr-local-time');
                const add=element('button',song.added?'Added':'Add','sr-local-add');add.disabled=!!song.added;add.setAttribute('aria-label',(song.added?'Already added: ':'Add ')+song.title);
                add.onclick=async()=>{
                    if(busy)return;setBusy(true);add.disabled=true;add.textContent='Adding…';
                    try{const result=await addIndexed(song,uri,status,()=>closed);if(closed)return;song.added=true;add.textContent='Added';status.textContent=(result==='existing'?'Already in “':'Added to “')+name+'”.';}
                    catch(error){if(!closed){status.textContent=error.message;add.textContent='Add';add.disabled=false;}}
                    finally{if(!closed)setBusy(false);}
                };
                row.append(image,info,duration,add);localList.append(row);
            }
        }
        search.oninput=renderLocal;
        async function loadLocal() {
            const version=++localVersion;localList.replaceChildren(element('p','Loading local songs…'));
            try{
                const result=await request('link-local');
                if(closed || source!=='Local' || version!==localVersion)return;
                localSongs=result.songs.sort((a,b)=>a.title.localeCompare(b.title));
                const existing=new Set();let offset=0;
                while(true){const content=await Spicetify.Platform.PlaylistAPI.getContents(uri,{offset,limit:100});const items=content.items || [];items.forEach(item=>existing.add(item.uri || item.track?.uri));if(items.length<100)break;offset+=items.length;}
                const local=Spicetify.Platform.LocalFilesAPI;
                if(!local.getIsEnabled())local.setIsEnabled(true);
                const sources=await local.getSources();
                if(!sources.folders.some(folder=>folder.path.replace(/\\/g,'/').toLowerCase()===result.folder.replace(/\\/g,'/').toLowerCase()))await local.addFolder({path:result.folder});
                const indexed=await local.getTracks();
                for(const song of localSongs){const track=indexed.find(item=>item.name===song.title && (song.artist?item.artists.some(artist=>artist.name===song.artist):!item.artists.length) && item.album.name.toLowerCase()===song.source.toLowerCase() && Math.abs(item.duration.milliseconds/1000-song.duration)<3);song.added=!!track && existing.has(track.uri);if(!song.cover){const cover=track?.album.images?.find(image=>/^https:\/\//.test(image.url));song.cover=cover?.url || '';}}
                if(!closed && source==='Local' && version===localVersion)renderLocal();
            }catch(error){if(!closed && source==='Local' && version===localVersion)localList.replaceChildren(element('p',error.message));}
        }
        function resetSearch() {
            if(busy)return;
            const previous=job;
            job=null;collection=null;bulkProgress=null;lastSavedId=null;bulkList.hidden=true;bulkList.replaceChildren();
            clearTimeout(timer);
            timer=null;
            if(previous?.status==='ready')request('link-cancel?id='+previous.id).catch(()=>{});
            preview.hidden=true;
            preview.style.display='none';
            title.value=artist.value='';
            coverRow.replaceChildren();
            status.textContent='';
            primary.hidden=false;
            primary.textContent='Find link';
            another.hidden=true;
            [...actions.children].forEach(button=>{if(button!==cancel && button!==primary && button!==another)button.remove();});
        }
        another.onclick=()=>{resetSearch();input.value='';input.focus();};
        input.addEventListener('input',resetSearch);
        for (const platform of ['YouTube','SoundCloud','Local']) {
            const tab=element('button',platform);tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(platform===source));tabs.append(tab);
            tab.onclick=()=>{if(busy)return;source=platform;resetSearch();const isLocal=platform==='Local';input.hidden=isLocal;primary.hidden=isLocal;localPanel.hidden=!isLocal;localPanel.style.display=isLocal?'flex':'none';input.placeholder='Paste a '+platform+' song or collection link';input.value='';[...tabs.children].forEach(button=>button.setAttribute('aria-selected',String(button===tab)));if(isLocal){search.value='';search.focus();loadLocal();}else input.focus();};
        }
        function setBusy(value) {busy=value;search.disabled=value;input.disabled=value;title.disabled=artist.disabled=value;primary.disabled=value;[...tabs.children].forEach(tab=>tab.disabled=value);cancel.textContent=value?'Cancel import':'Close';}
        async function waitJob(id, phase) {
            const deadline=Date.now()+630000;
            let errors=0;
            while(!stopped() && Date.now()<deadline) {
                try {const result=await request('link-status?id='+id);errors=0;if(result.status!==phase)return result;}
                catch(error){if(++errors>=3)throw error;}
                await sleep(1000);
            }
            if(stopped())return null;
            throw new Error('Import timed out. Check the import logs.');
        }
        function renderBulk() {
            bulkList.hidden=false;
            const scroll=bulkList.scrollTop;
            bulkList.replaceChildren();
            for(const [index,entry] of collection.entries.entries()) {
                const row=element('div',null,'sr-local-row sr-bulk-row');
                const fields=element('div',null,'sr-bulk-fields');
                const detected=songMetadata(entry.title || 'Song '+(index+1),entry.artist);
                for(const [key,label] of [['title','Title'],['artist','Artist']]) {
                    const value=element('button',entry[key+'Edit'] ?? detected[key],'sr-bulk-edit');
                    value.dataset.field=key;value.title=value.textContent;
                    value.setAttribute('aria-label','Edit '+label.toLowerCase()+' for song '+(index+1));
                    value.disabled=importing;
                    value.type='button';
                    value.onclick=event=>{
                        event.preventDefault();event.stopPropagation();
                        const editor=element('input');editor.maxLength=200;editor.value=value.textContent;
                        editor.setAttribute('aria-label',label+' for song '+(index+1));
                        editor.onclick=event=>event.stopPropagation();
                        let discard=false;
                        editor.onblur=()=>{
                            if(!discard){entry[key+'Edit']=editor.value.trim();value.textContent=entry[key+'Edit'];value.title=value.textContent;}
                            editor.replaceWith(value);
                        };
                        editor.onkeydown=event=>{if(event.key==='Enter' || event.key==='Escape'){event.preventDefault();event.stopPropagation();discard=event.key==='Escape';editor.blur();value.focus();}};
                        value.replaceWith(editor);editor.focus();editor.select();
                    };
                    fields.append(value);
                }
                row.append(element('span',String(index+1)),fields);
                bulkList.append(row);
            }
            bulkList.scrollTop=scroll;
        }
        async function expandCollection() {
            const expanded=new Set();
            for(let index=0;index<collection.entries.length && !closed;index++) {
                const entry=collection.entries[index];
                if(!entry.collection)continue;
                if(expanded.has(entry.url))throw new Error('This collection links back to an already expanded collection.');
                expanded.add(entry.url);
                let nested;
                try {
                    nested=await request('link-preview',{url:entry.url,collection:true});
                    const found=await waitJob(nested.id,'previewing');
                    if(!found)return;
                    if(!found.entries?.length){entry.collection=false;Object.assign(entry,{title:found.title,artist:found.artist});continue;}
                    if(collection.entries.length-1+found.entries.length>2000)throw new Error('The expanded collection has more than 2000 songs. Use a smaller collection.');
                    collection.entries.splice(index,1,...found.entries);index--;
                } finally {if(nested?.id)await request('link-cancel?id='+nested.id).catch(()=>{});}
            }
        }
        async function runBulk() {
            importing=true;
            renderBulk();
            const expanded=new Set();
            bulkProgress={total:collection.entries.length,done:0,added:0,existing:0,failed:[],queued:[],name:'Preparing collection…',artist:'',cover:collection.cover};
            try {
                await request('link-cancel?id='+collection.id);
                for(let index=0;index<collection.entries.length && !cancelled;index++) {
                    const entry=collection.entries[index];
                    bulkProgress.name=entry.title || 'Song '+(index+1);
                    bulkProgress.queued=collection.entries.slice(index+1,index+4).map(e=>e.title || 'Song');
                    status.textContent='Finding “'+bulkProgress.name+'”… · '+index+' of '+bulkProgress.total;
                    background?.update(bulkProgress);
                    try {
                        job=await request('link-preview',{url:entry.url,collection:true});
                        job=await waitJob(job.id,'previewing');if(!job)break;
                        if(job.entries?.length) {
                            if(expanded.has(entry.url))throw new Error('This collection links back to an already expanded collection.');
                            expanded.add(entry.url);
                            if(collection.entries.length-1+job.entries.length>2000)throw new Error('The expanded collection has more than 2000 songs. Use a smaller collection.');
                            await request('link-cancel?id='+job.id);
                            collection.entries.splice(index,1,...job.entries);
                            bulkProgress.total=collection.entries.length;
                            renderBulk();index--;continue;
                        }
                        const detected=songMetadata(job.title || entry.title,job.artist || entry.artist);
                        const songTitle=String(entry.titleEdit !== undefined ? entry.titleEdit.trim() : detected.title || 'Song').slice(0,200);
                        const songArtist=String(entry.artistEdit !== undefined ? entry.artistEdit.trim() : detected.artist).slice(0,200);
                        if(!songTitle || !songArtist)throw new Error('Enter the song title and artist.');
                        bulkProgress.name=songTitle;bulkProgress.artist=songArtist;
                        if(!bulkProgress.cover)bulkProgress.cover=job.cover;
                        status.textContent='Downloading “'+songTitle+'”… · '+index+' of '+bulkProgress.total;
                        background?.update(bulkProgress);
                        if(cancelled)break;
                        job=await request('link-download',{id:job.id,title:songTitle,artist:songArtist});
                        job=await waitJob(job.id,'downloading');if(!job)break;
                        if(job.status==='cancelled')break;
                        lastSavedId=job.id;
                        bulkProgress.name='Adding “'+songTitle+'”…';background?.update(bulkProgress);
                        const result=await addIndexed(job,uri,status,stopped);
                        bulkProgress[result==='existing'?'existing':'added']++;
                    } catch(error) {
                        if(cancelled)break;
                        if(job?.id && job.status!=='done')await request('link-cancel?id='+job.id).catch(()=>{});
                        bulkProgress.failed.push({name:entry.title || 'Song '+(index+1),message:error.message});
                    }
                    bulkProgress.done=index+1;
                    status.textContent=bulkProgress.done+' of '+bulkProgress.total+' processed · '+bulkProgress.added+' added';
                    renderBulk();background?.update(bulkProgress);
                }
                const message=cancelled?'Import cancelled':bulkProgress.added+' added to “'+name+'”'+(bulkProgress.existing?' · '+bulkProgress.existing+' already in playlist':'')+(bulkProgress.failed.length?' · '+bulkProgress.failed.length+' failed':'');
                status.textContent=message;
                if(bulkProgress.failed.length)status.title=bulkProgress.failed.map(f=>f.name+': '+f.message).join('\n');
                background?.finish(cancelled?'cancelled':'done',message);
                primary.hidden=true;another.hidden=false;
            } finally { importing=false; }
        }
        primary.onclick=async()=>{
            setBusy(true);
            try {
                if (!job) {
                    if(!validLink(input.value.trim(),source))throw new Error('Paste a valid '+source+' song or collection link.');
                    status.textContent='Reading link…';
                    job=await request('link-preview',{url:input.value.trim(),collection:true});
                    if(closed){request('link-cancel?id='+job.id).catch(()=>{});return;}
                    job=await waitJob(job.id,'previewing');if(!job)return;
                    if(job.status==='cancelled')throw new Error('Import cancelled.');
                    collection=job.entries?.length ? job : null;
                    if(collection){status.textContent='Reading collection songs…';await expandCollection();if(closed)return;}
                    if(collection && !collection.cover) {
                        let probe;
                        try {
                            probe=await request('link-preview',{url:collection.entries[0].url,collection:true});
                            const found=await waitJob(probe.id,'previewing');
                            collection.cover=found?.cover || '';
                        } catch {} finally {if(probe?.id)await request('link-cancel?id='+probe.id).catch(()=>{});}
                        if(closed)return;
                    }
                    const entryLabel=collection?.entries.some(entry=>entry.collection)?'entries':'songs';
                    const detected=songMetadata(job.title,job.artist);
                    title.value=detected.title;artist.value=detected.artist;
                    if(/^https:\/\//.test(job.cover || '')){const image=element('img');image.src=job.cover;image.alt='';image.onerror=()=>image.remove();coverRow.append(image);}
                    const text=element('div');text.append(element('strong',job.title),element('p',job.source+' · '+(collection?collection.entries.length+' '+entryLabel:Math.round(job.duration/60)+' min')));coverRow.append(text);
                    preview.hidden=!!collection;preview.style.display=collection?'none':'flex';
                    if(collection)renderBulk();
                    status.textContent=collection?'Edit any title or artist, then download this collection in order and add it to “'+name+'”.'+(collection.snapshot?' This mix/radio uses a snapshot of up to 50 available songs.':''):'Check the title and artist before adding.';primary.textContent=collection?'Download and add '+collection.entries.length+' '+entryLabel:'Download and add';
                } else if(collection) {
                    if(collection.entries.some(entry=>['title','artist'].some(key=>entry[key+'Edit']!==undefined && !entry[key+'Edit'].trim())))throw new Error('Enter a title and artist for each edited song.');
                    await runBulk();
                } else {
                    if(!title.value.trim() || !artist.value.trim())throw new Error('Enter the song title and artist.');
                    importing=true;
                    status.textContent='Downloading “'+title.value.trim()+'”…';
                    job=await request('link-download',{id:job.id,title:title.value.trim(),artist:artist.value.trim()});
                    if(job.reused)status.textContent='Already downloaded. Adding to your playlist…';
                    if(cancelled){request('link-cancel?id='+job.id).catch(()=>{});return;}
                    job=await waitJob(job.id,'downloading');if(!job)return;
                    if(job.status==='cancelled')throw new Error('Import cancelled.');
                    cancel.textContent='Close';
                    background?.update('Adding to “'+name+'”…');
                    const result=await addIndexed(job,uri,status,stopped);
                    status.textContent=(result==='existing'?'Already in “':'Added to “')+name+'”.';primary.hidden=true;another.hidden=false;
                    background?.finish('done');
                }
            } catch(error) {
                background?.finish(cancelled?'cancelled':'error',error.message);
                if(!closed){status.textContent=error.message;
                    if(job?.status==='done'){primary.hidden=true;const folder=element('button','Open folder');folder.onclick=()=>request('link-folder?id='+job.id).catch(error=>status.textContent=error.message);const files=element('button','Open local files');files.onclick=()=>{Spicetify.Platform.History.push('/collection/local-files');close();};actions.prepend(files,folder);}
                    else if(job?.status!=='ready'){job=null;primary.textContent='Find link';}
                }
            } finally {importing=false;if(!closed){setBusy(false);cancel.disabled=false;}}
        };
        Spicetify.PopupModal.display({title:'Add from link',content:root,isLarge:false});
        const overlay=root.closest('.GenericModal__overlay');
        const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
        overlay?.animate([{opacity:0},{opacity:1}],{duration:reduced?0:180,easing:'ease-out'});
        let closing=false;
        const modalObserver=new MutationObserver(()=>{if(!root.isConnected && !closing)close();});
        modalObserver.observe(document.body,{childList:true,subtree:true});
        let backdropPress=null;
        function pointerdown(event) {
            backdropPress=event.target===overlay && event.button===0
                ? {id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false} : null;
        }
        function pointermove(event) {
            if(backdropPress && event.pointerId===backdropPress.id && Math.hypot(event.clientX-backdropPress.x,event.clientY-backdropPress.y)>6)backdropPress.dragged=true;
        }
        function resetPress(){backdropPress=null;}
        async function close(cancelImport=false) {
            if(closing || cancel.disabled)return;closing=true;closed=true;open=false;modalObserver.disconnect();clearTimeout(timer);
            if(cancelImport)cancelled=true;
            if(importing && !cancelled) {
                const task = {id:importId,title:collection?.title || title.value.trim(),artist:artist.value.trim(),cover:bulkProgress?.cover || job?.cover,total:bulkProgress?.total,progress:bulkProgress,
                    extra:job?.status==='done'?'Adding to “'+name+'”…':'For “'+name+'”',
                    cancel:async()=>{cancelled=true;if(job?.id && job.status!=='done')await request('link-cancel?id='+job.id);},
                    openFolder:()=>(lastSavedId || job?.id) && request('link-folder?id='+(lastSavedId || job.id)).catch(error=>showImportNotice(error.message,true))};
                try { background=collection ? window.SpotifyRemasteredDownloads?.backgroundCollection(task) : window.SpotifyRemasteredDownloads?.backgroundImport(task); } catch {}
                if(!background)showImportNotice('Import continues in the background.');
            } else if(job?.id && job.status!=='done') request('link-cancel?id='+job.id).catch(()=>{});
            window.removeEventListener('keydown',keydown,true);overlay?.removeEventListener('click',click,true);
            overlay?.removeEventListener('pointerdown',pointerdown,true);
            window.removeEventListener('pointermove',pointermove,true);
            window.removeEventListener('pointercancel',resetPress,true);
            window.removeEventListener('blur',resetPress);
            try{await overlay?.animate([{opacity:1},{opacity:0}],{duration:reduced?0:160,easing:'ease-in',fill:'forwards'}).finished;}catch{}
            if(root.isConnected)Spicetify.PopupModal.hide();open=false;
        }
        function click(event){
            const outside=event.target===overlay;
            const dismiss=outside ? backdropPress && !backdropPress.dragged && event.button===0 : event.target.closest('.spicetify-popup-closeBtn');
            resetPress();
            if(outside || dismiss){event.preventDefault();event.stopImmediatePropagation();if(dismiss)close();}
        }
        function keydown(event){if(event.key==='Escape' && event.target.closest?.('.sr-bulk-fields input'))return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}}
        overlay?.addEventListener('click',click,true);window.addEventListener('keydown',keydown,true);cancel.onclick=()=>close((collection && importing) || (importing && job?.status!=='done'));input.focus();
        overlay?.addEventListener('pointerdown',pointerdown,true);
        window.addEventListener('pointermove',pointermove,true);
        window.addEventListener('pointercancel',resetPress,true);
        window.addEventListener('blur',resetPress);
    }
    const tooltipRoots = new Map();
    function attachTooltip(button, menu) {
        const host = element('span', null, 'sr-link-tooltip');
        host.style.display = 'inline-flex';
        menu.before(host);
        const root = Spicetify.ReactDOM.createRoot(host);
        tooltipRoots.set(host, root);
        function Tooltip() {
            const [visible, setVisible] = Spicetify.React.useState(false);
            Spicetify.React.useLayoutEffect(() => {host.firstElementChild?.appendChild(button);}, []);
            return Spicetify.React.createElement(Spicetify.ReactComponent.TooltipWrapper,
                {label:button.getAttribute('aria-label'),placement:'top',showDelay:200,isOpen:visible},
                Spicetify.React.createElement('span', {
                    style:{display:'inline-flex'},
                    onMouseEnter:()=>setVisible(true),onMouseLeave:()=>setVisible(false),
                    onFocus:()=>setVisible(true),onBlur:()=>setVisible(false),onClick:()=>setVisible(false)
                }));
        }
        Spicetify.ReactDOM.flushSync(()=>root.render(Spicetify.React.createElement(Tooltip)));
    }
    const playlistMetadata=new Map();
    const metadataPending=new Set();
    let mountedButton = null;
    let mountedPath = '';
    function rememberMetadata(uri, value) {
        playlistMetadata.delete(uri);
        playlistMetadata.set(uri, value);
        while (playlistMetadata.size > 200) playlistMetadata.delete(playlistMetadata.keys().next().value);
    }
    Spicetify.Platform.RootlistAPI.getContents().then(function prime(list){
        for(const item of list.items || []){
            if(item.type==='playlist' && item.isOwnedBySelf)rememberMetadata(item.uri,{name:item.name,canEditItems:true});
            if(item.items)prime(item);
        }
        mount();
    }).catch(()=>{});
    function mount() {
        const path = Spicetify.Platform.History.location.pathname;
        if (mountedPath === path && mountedButton?.isConnected) return;
        mountedPath = path; mountedButton = null;
        for (const [host, root] of tooltipRoots) {
            if (!host.isConnected) {root.unmount();tooltipRoots.delete(host);}
        }
        document.body.classList.toggle('sr-local-files-page',Spicetify.Platform.History.location.pathname==='/collection/local-files');
        const match=Spicetify.Platform.History.location.pathname.match(/^\/playlist\/([A-Za-z0-9]{22})/);
        if(!match){document.querySelectorAll('.sr-link-tooltip').forEach(host=>{tooltipRoots.get(host)?.unmount();tooltipRoots.delete(host);host.remove();});return;}
        const menu=document.querySelector('.main-actionBar-ActionBar .main-moreButton-button')
            || [...document.querySelectorAll('.main-actionBar-ActionBar button')].find(button => button.getAttribute('aria-label')?.startsWith('More options'));
        if(!menu || menu.parentElement.querySelector('.sr-link-button'))return;
        const uri='spotify:playlist:'+match[1];
        let metadata=playlistMetadata.get(uri);
        if(!metadataPending.has(uri) && Date.now() >= (metadata?._nextCheck || 0)){
            metadataPending.add(uri);
            Spicetify.Platform.PlaylistAPI.getMetadata(uri).then(value=>{
                rememberMetadata(uri,{...value,_nextCheck:Date.now()+300000});
            }).catch(()=>{rememberMetadata(uri,{...metadata,_nextCheck:Date.now()+30000});})
              .finally(()=>{metadataPending.delete(uri);mount();});
        }
        if(!metadata && menu.parentElement.querySelector('button[aria-label^="Invite collaborators"]')){
            metadata={canEditItems:true,name:document.querySelector('.main-entityHeader-title h1')?.textContent || 'Playlist'};
        }
        if(!metadata?.canEditItems)return;
        const button=element('button',null,'sr-link-button');button.type='button';button.setAttribute('aria-label','Add from YouTube or SoundCloud');button.innerHTML=icon;
        button.onclick=()=>showImport(uri,metadata.name || 'Playlist');attachTooltip(button,menu);mountedButton=button;
    }
    let checkingLocalFiles=false;
    async function refreshLocalFiles(){
        if(checkingLocalFiles)return;
        checkingLocalFiles=true;
        try{
            const local=Spicetify.Platform.LocalFilesAPI;
            const catalogue=await request('link-local');
            const tracks=await local.getTracks();
            const folder=catalogue.folder.replace(/\\/g,'/').toLowerCase();
            const stale=tracks.some(track=>track.album.images.some(image=>{
                if(!image.url.startsWith('spotify:localfileimage:'))return false;
                const path=decodeURIComponent(image.url.slice('spotify:localfileimage:'.length)).replace(/\\/g,'/').toLowerCase();
                return path.startsWith(folder+'/') && !catalogue.songs.some(song=>song.title===track.name && Math.abs(song.duration-track.duration.milliseconds/1000)<3);
            }));
            if(stale){await local.removeFolder({path:catalogue.folder});await local.addFolder({path:catalogue.folder});}
        }catch{}finally{checkingLocalFiles=false;}
    }
    function schedule(records){
        if (!Spicetify.Platform.History.location.pathname.startsWith('/playlist/')) return;
        if (mountedButton?.isConnected && mountedPath === Spicetify.Platform.History.location.pathname) return;
        if (records.some(record => record.removedNodes.length || [...record.addedNodes].some(node => node.nodeType === 1))) mount();
    }
    function navigate(){mount();if(Spicetify.Platform.History.location.pathname==='/collection/local-files')refreshLocalFiles();}
    new MutationObserver(schedule).observe(document.querySelector('.Root__main-view') || document.body,{childList:true,subtree:true});
    Spicetify.Platform.History.listen(navigate);navigate();
})();
