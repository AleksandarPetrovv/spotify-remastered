(async function () {
    while (!window.Spicetify?.Platform?.History || !Spicetify.PopupModal) await new Promise(resolve => setTimeout(resolve, 200));
    const icon = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="M12 22V3c0 5 8 5 8 10 0 2-1 3-3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7.5" cy="23" rx="4.7" ry="3.2" transform="rotate(-20 7.5 23)" fill="currentColor"/><path d="M24 19.2v9.6M19.2 24h9.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const style = document.createElement('style');
    style.textContent = `
        .sr-link-button {border:0;background:transparent;color:var(--spice-subtext);width:40px;height:40px;padding:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;border-radius:8px;transition:transform .25s ease}
        .sr-link-button:hover {color:var(--spice-text);background:transparent;transform:scale(1.1)}
        .sr-link-button:focus-visible {outline:2px solid var(--spice-text);outline-offset:3px}
        .sr-link-button svg {overflow:visible;stroke:none}
        .spicetify-popup-container:has(#sr-link-import) {width:520px!important;max-width:calc(100vw - 48px)!important}
        #sr-link-import {display:flex;flex-direction:column;gap:20px;color:var(--spice-text);font-size:14px}
        #sr-link-import p {margin:0;color:var(--spice-subtext);line-height:1.5}
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
        #sr-link-import .sr-link-primary {background:var(--spice-button);color:var(--spice-main);border:0;font-weight:700}
        #sr-link-import .sr-link-status {padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
        @media (prefers-reduced-motion:reduce) {.sr-link-button {transition:none}.sr-link-button:hover {transform:none}}
    `;
    document.head.appendChild(style);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
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
                : /^(www\.)?soundcloud\.com$|^on\.soundcloud\.com$|^snd\.sc$/.test(url.hostname);
        } catch { return false; }
    }
    async function addIndexed(job, uri, status, cancelled = () => false) {
        const local = Spicetify.Platform.LocalFilesAPI;
        const playlist = Spicetify.Platform.PlaylistAPI;
        if (!local?.addFolder || !local?.getTracks || !playlist?.add) throw new Error('Downloaded, but this Spotify version does not expose local-file import. Add it from Local Files manually.');
        if (!local.getIsEnabled()) local.setIsEnabled(true);
        const sources = await local.getSources();
        const normalize = path => path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
        if (!sources.folders.some(folder => normalize(folder.path) === normalize(job.folder))) await local.addFolder({path:job.folder});
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
        if (!track) throw new Error('Downloaded, but Spotify has not indexed it yet. The MP3 is safe in Local Songs; add it from Local Files.');
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
        const root = element('div'); root.id = 'sr-link-import';
        root.append(element('p', 'Add a local song to “' + name + '”. The MP3 stays in Spotify Remastered’s Local Songs folder.'));
        const tabs = element('div', null, 'sr-link-tabs'); tabs.setAttribute('role','tablist');
        const input = element('input'); input.type = 'url'; input.placeholder = 'Paste a YouTube song link'; input.setAttribute('aria-label','Song link');
        const status = element('p', '', 'sr-link-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
        const preview = element('div'); preview.hidden = true;
        function field(label) { const wrap = element('label',label,'sr-link-field');const value=element('input');value.maxLength=200;wrap.append(value);preview.append(wrap);return value; }
        const title = field('Title'), artist = field('Artist');
        preview.style.cssText='display:none;flex-direction:column;gap:16px';
        const coverRow=element('div',null,'sr-link-preview');root.append(tabs,input,coverRow,preview,status);
        const actions=element('div',null,'sr-link-actions');root.append(actions);
        const cancel=element('button','Cancel'), primary=element('button','Find song','sr-link-primary');actions.append(cancel,primary);
        const another=element('button','Add another','sr-link-primary');another.hidden=true;actions.append(another);
        function resetSearch() {
            if(busy)return;
            const previous=job;
            job=null;
            clearTimeout(timer);
            timer=null;
            if(previous?.status==='ready')request('link-cancel?id='+previous.id).catch(()=>{});
            preview.hidden=true;
            preview.style.display='none';
            title.value=artist.value='';
            coverRow.replaceChildren();
            status.textContent='';
            primary.hidden=false;
            primary.textContent='Find song';
            another.hidden=true;
            [...actions.children].forEach(button=>{if(button!==cancel && button!==primary && button!==another)button.remove();});
        }
        another.onclick=()=>{resetSearch();input.value='';input.focus();};
        input.addEventListener('input',resetSearch);
        for (const platform of ['YouTube']) {
            const tab=element('button',platform);tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(platform===source));tabs.append(tab);
            tab.onclick=()=>{if(busy)return;source=platform;resetSearch();input.placeholder='Paste a '+platform+' song link';input.value='';[...tabs.children].forEach(button=>button.setAttribute('aria-selected',String(button===tab)));input.focus();};
        }
        function setBusy(value) {busy=value;input.disabled=value;title.disabled=artist.disabled=value;primary.disabled=value;[...tabs.children].forEach(tab=>tab.disabled=value);cancel.textContent=value?'Cancel import':'Close';}
        async function waitJob(id, phase) {
            const deadline=Date.now()+630000;
            let errors=0;
            while(!closed && Date.now()<deadline) {
                try {const result=await request('link-status?id='+id);errors=0;if(result.status!==phase)return result;}
                catch(error){if(++errors>=3)throw error;}
                await sleep(1000);
            }
            if(closed)return null;
            throw new Error('Import timed out. Check the import logs.');
        }
        primary.onclick=async()=>{
            setBusy(true);
            try {
                if (!job) {
                    if(!validLink(input.value.trim(),source))throw new Error('Paste a valid '+source+' song link.');
                    status.textContent='Finding song…';
                    job=await request('link-preview',{url:input.value.trim()});
                    if(closed){request('link-cancel?id='+job.id).catch(()=>{});return;}
                    job=await waitJob(job.id,'previewing');if(!job)return;
                    if(job.status==='cancelled')throw new Error('Import cancelled.');
                    title.value=job.title;artist.value=job.artist || '';
                    if(/^https:\/\//.test(job.cover || '')){const image=element('img');image.src=job.cover;image.alt='';image.onerror=()=>image.remove();coverRow.append(image);}
                    const text=element('div');text.append(element('strong',job.title),element('p',job.source+' · '+Math.round(job.duration/60)+' min'));coverRow.append(text);
                    preview.hidden=false;preview.style.display='flex';status.textContent='Check the title and artist before adding.';primary.textContent='Download and add';
                } else {
                    if(!title.value.trim() || !artist.value.trim())throw new Error('Enter the song title and artist.');
                    status.textContent='Downloading “'+title.value.trim()+'”…';
                    job=await request('link-download',{id:job.id,title:title.value.trim(),artist:artist.value.trim()});
                    if(job.reused)status.textContent='Already downloaded. Adding to your playlist…';
                    if(closed){request('link-cancel?id='+job.id).catch(()=>{});return;}
                    job=await waitJob(job.id,'downloading');if(!job)return;
                    if(job.status==='cancelled')throw new Error('Import cancelled.');
                    cancel.textContent='Close';
                    const result=await addIndexed(job,uri,status,()=>closed);
                    status.textContent=(result==='existing'?'Already in “':'Added to “')+name+'”.';primary.hidden=true;another.hidden=false;
                }
            } catch(error) {
                if(!closed){status.textContent=error.message;
                    if(job?.status==='done'){primary.hidden=true;const folder=element('button','Open folder');folder.onclick=()=>request('link-folder?id='+job.id).catch(error=>status.textContent=error.message);const files=element('button','Open local files');files.onclick=()=>{Spicetify.Platform.History.push('/collection/local-files');close();};actions.prepend(files,folder);}
                    else if(job?.status!=='ready'){job=null;primary.textContent='Find song';}
                }
            } finally {if(!closed){setBusy(false);cancel.disabled=false;}}
        };
        Spicetify.PopupModal.display({title:'Add from link',content:root,isLarge:false});
        const overlay=root.closest('.GenericModal__overlay');
        const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
        overlay?.animate([{opacity:0},{opacity:1}],{duration:reduced?0:180,easing:'ease-out'});
        let closing=false;
        async function close() {
            if(closing || cancel.disabled)return;closing=true;closed=true;clearTimeout(timer);
            if(job?.id && job.status!=='done') request('link-cancel?id='+job.id).catch(()=>{});
            window.removeEventListener('keydown',keydown,true);overlay?.removeEventListener('click',click,true);
            try{await overlay?.animate([{opacity:1},{opacity:0}],{duration:reduced?0:160,easing:'ease-in',fill:'forwards'}).finished;}catch{}
            if(root.isConnected)Spicetify.PopupModal.hide();open=false;
        }
        function click(event){if(event.target===overlay || event.target.closest('.spicetify-popup-closeBtn')){event.preventDefault();event.stopImmediatePropagation();close();}}
        function keydown(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}}
        overlay?.addEventListener('click',click,true);window.addEventListener('keydown',keydown,true);cancel.onclick=close;input.focus();
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
        root.render(Spicetify.React.createElement(Tooltip));
    }
    let scheduled=false;
    async function mount() {
        for (const [host, root] of tooltipRoots) {
            if (!host.isConnected) {root.unmount();tooltipRoots.delete(host);}
        }
        const match=Spicetify.Platform.History.location.pathname.match(/^\/playlist\/([A-Za-z0-9]{22})/);
        if(!match){document.querySelectorAll('.sr-link-tooltip').forEach(host=>{tooltipRoots.get(host)?.unmount();tooltipRoots.delete(host);host.remove();});return;}
        const menu=document.querySelector('.main-actionBar-ActionBar .main-moreButton-button')
            || [...document.querySelectorAll('.main-actionBar-ActionBar button')].find(button => button.getAttribute('aria-label')?.startsWith('More options'));
        if(!menu || menu.parentElement.querySelector('.sr-link-button'))return;
        const uri='spotify:playlist:'+match[1];
        let metadata;
        try{metadata=await Spicetify.Platform.PlaylistAPI.getMetadata(uri);}catch{return;}
        if(Spicetify.Platform.History.location.pathname.indexOf(match[1])<0 || !menu.isConnected)return;
        if(!metadata.canEditItems)return;
        if(menu.parentElement.querySelector('.sr-link-button'))return;
        const button=element('button',null,'sr-link-button');button.type='button';button.setAttribute('aria-label','Add from YouTube or SoundCloud');button.innerHTML=icon;
        button.onclick=()=>showImport(uri,metadata.name || 'Playlist');attachTooltip(button,menu);
    }
    function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;mount();},150);}
    new MutationObserver(schedule).observe(document.querySelector('.Root__main-view') || document.body,{childList:true,subtree:true});
    Spicetify.Platform.History.listen(schedule);schedule();
})();
