(async function() {
    while (
        !window.Spicetify ||
        !Spicetify.ContextMenuV2 ||
        !Spicetify.URI ||
        !Spicetify.showNotification
    ) {
        await new Promise(function(r) { setTimeout(r, 100); });
    }

    function DownloadMenuItem(options) {
        var component = function() {
            var context = Spicetify.React.useContext(Spicetify.ContextMenuV2._context) || {};
            return Spicetify.React.createElement('li', { role: 'presentation' },
                Spicetify.React.createElement('button', {
                    role: 'menuitem', tabIndex: -1,
                    style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '40px', padding: '8px 8px 8px 12px',
                        border: 0, borderRadius: '3px', background: 'transparent', color: 'rgba(255,255,255,.9)', fontFamily: 'inherit', fontSize: '14px', fontWeight: 400, lineHeight: 'normal', textAlign: 'left', cursor: 'pointer' },
                    onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; },
                    onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; },
                    onFocus: function(e) { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; },
                    onBlur: function(e) { e.currentTarget.style.background = 'transparent'; },
                    onClick: function() {
                        options.onClick(context);
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    }
                }, Spicetify.React.createElement('span', { style: {display:'flex',width:'16px',height:'16px',flexShrink:0},
                    dangerouslySetInnerHTML: { __html: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">' + Spicetify.SVGIcons.download + '</svg>' } }),
                    Spicetify.React.createElement('span', { className: 'encore-text-body-small', style: {fontSize:'14px',fontWeight:400,lineHeight:'normal'} }, options.children)));
        };
        var element = Spicetify.React.createElement(component);
        this.register = function() { Spicetify.ContextMenuV2.registerItem(element, options.shouldAdd); };
    }

    var activeDownloads = new Map();
    var notifEl = null;
    var notifTimeout = null;
    var toastStyle = "position:fixed;bottom:100px;right:8px;z-index:9999;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:rgba(18,18,18,0.92);border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 24px rgba(0,0,0,0.5);backdrop-filter:blur(16px);color:#fff;font-size:14px;font-weight:500;width:max-content;max-width:min(400px,calc(100vw - 24px));box-sizing:border-box;animation:spotdl-notif-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;pointer-events:none";
    var spinnerMarkup = '<div style="position:relative;width:22px;height:22px">'
            + '<div style="position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,0.1)"></div>'
            + '<div style="position:absolute;inset:0;border:2px solid transparent;border-top-color:#fff;border-radius:50%;animation:spotdl-spin 0.75s linear infinite"></div>'
            + '</div>';
    var successMarkup = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none">'
                + '<circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>'
                + '<circle cx="12" cy="12" r="10" stroke="#1DB954" stroke-width="2" stroke-dasharray="63" stroke-dashoffset="63" style="animation:spotdl-circle 0.4s ease forwards"/>'
                + '<path d="M7.5 12.5L10.5 15.5L16.5 9.5" stroke="#1DB954" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20" stroke-dashoffset="20" style="animation:spotdl-check 0.3s ease 0.25s forwards"/>'
                + '</svg>';
    function downloadUri(value) {
        if (typeof value !== 'string') return null;
        var match = value.match(/^spotify:(track|playlist|album):([a-zA-Z0-9]{22})$/)
            || value.match(/^spotify:user:[^:]+:(playlist):([a-zA-Z0-9]{22})$/)
            || value.match(/^https:\/\/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]{22})(?:[?#].*)?$/);
        return match ? { type: match[1], id: match[2] } : null;
    }
    function trackForMenu(props, target) {
        props = props || {};
        var candidates = props.uris || [props.uri, props.item && props.item.uri, props.reference && props.reference.uri];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var parsed = downloadUri(candidates[i]);
                if (parsed && parsed.type === 'track') return parsed;
            } catch (e) {}
        }
        // the now-playing menu can omit the track from its props.
        if (target && target.closest && target.closest('.main-nowPlayingWidget-nowPlaying')) {
            try {
                var current = downloadUri(Spicetify.Player.data.item.uri);
                if (current && current.type === 'track') return current;
            } catch (e) {}
        }
        return null;
    }
    async function helperRequest(path, timeout, body) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, timeout);
        try {
            var options = { signal: controller.signal };
            if (body) {
                options.method = 'POST';
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(body);
            }
            var response = await fetch('http://127.0.0.1:27382/' + path, options);
            if (!response.ok) throw new Error('Download helper unavailable');
            return await response.json();
        } finally { clearTimeout(timer); }
    }
    function truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + "…" : str;
    }

    function coverFor(item) {
        if (!item) return '';
        var sources = [].concat(item.images || [], item.album && item.album.images || [],
            item.albumOfTrack && item.albumOfTrack.coverArt && item.albumOfTrack.coverArt.sources || [],
            item.coverArt && item.coverArt.sources || []);
        for (var i = 0; i < sources.length; i++) {
            var url = sources[i].url;
            if (typeof url !== 'string') continue;
            if (url.indexOf('spotify:image:') === 0) return 'https://i.scdn.co/image/' + url.slice(14);
            if (/^https?:\/\//.test(url)) return url;
        }
        return '';
    }

    function toastIcon(icon, markup, cover) {
        if (icon.statusEl) icon.statusEl.remove();
        icon.statusEl = null;
        icon.replaceChildren();
        icon.style.position = 'relative';
        icon.style.width = icon.style.height = cover ? '40px' : '22px';
        var badge = document.createElement('div');
        badge.innerHTML = markup;
        badge.style.cssText = 'display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex-shrink:0';
        if (cover) {
            var image = document.createElement('img');
            image.src = cover;
            image.alt = '';
            image.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px';
            image.onerror = function() {
                image.remove();
                icon.style.width = icon.style.height = '22px';
                icon.appendChild(badge);
                icon.statusEl = null;
            };
            icon.appendChild(image);
            icon.statusEl = badge;
            if (icon.parentElement) icon.parentElement.insertBefore(badge, icon.parentElement.lastElementChild);
        } else {
            icon.appendChild(badge);
        }
    }

    function getTrackName(trackId) {
        var dl = activeDownloads.get(trackId);
        return dl ? dl.name : "track";
    }

    function injectNotifStyles() {
        if (document.getElementById("spotdl-notif-style")) return;
        var s = document.createElement("style");
        s.id = "spotdl-notif-style";
        s.textContent = "@keyframes spotdl-spin{to{transform:rotate(360deg)}}"
            + "@keyframes spotdl-notif-in{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}"
            + "@keyframes spotdl-notif-out{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(40px)}}"
            + "@keyframes spotdl-circle{to{stroke-dashoffset:0}}"
            + "@keyframes spotdl-check{to{stroke-dashoffset:0}}"
            + '.spotdl-toast button{font:inherit;color:#ddd;background:none;border:0;padding:4px;cursor:pointer;flex-shrink:0}'
            + '.spotdl-toast button:hover{color:#fff}.spotdl-toast button:focus-visible{outline:2px solid #fff;outline-offset:3px;border-radius:4px}.spotdl-toast button:disabled{opacity:.5;cursor:default}'
            + '.spotdl-toast [hidden]{display:none}.spotdl-detail{font-size:12px;color:#ccc;margin-top:4px;line-height:1.4}'
            + '.spotdl-current{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spotdl-actions{display:flex;gap:10px;margin-top:6px}.spotdl-actions button{font-size:12px;padding:0;text-decoration:underline;text-underline-offset:3px}'
            + '@media(prefers-reduced-motion:reduce){.spotdl-toast,.spotdl-toast *{animation:none!important}}';
        document.head.appendChild(s);
    }

    function pendingSong(dl) { return dl.status === 'downloading' || dl.status === 'queued'; }

    function exitToast(element, remove) {
        element.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(40px)' }],
            { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(remove, remove);
    }

    function getActiveCount() {
        var c = 0;
        activeDownloads.forEach(function(dl) { if (pendingSong(dl)) c++; });
        return c;
    }

    function getLastActiveTrackId() {
        var last = null;
        activeDownloads.forEach(function(dl, id) { if (dl.status === "downloading") last = id; });
        return last;
    }

    function arrangeNotifs() {
        var stack = document.getElementById('spotdl-playlists');
        if (stack) stack.style.bottom = (notifEl ? 108 + notifEl.offsetHeight : 100) + 'px';
    }

    function dismissTimer(callback, delay) {
        return setTimeout(callback, delay);
    }

    function actionButton(label, callback) {
        var button = document.createElement('button');
        button.textContent = label;
        button.onclick = async function() {
            button.disabled = true;
            try { await callback(); }
            finally { button.disabled = false; }
        };
        return button;
    }

    async function openFolder(id, kind) {
        try {
            var result = await helperRequest('open-folder?id=' + encodeURIComponent(id) + '&kind=' + kind, 8000);
            if (result.status !== 'opened') throw new Error(result.message || 'Could not open the download folder.');
        } catch (e) { Spicetify.showNotification(e.message || 'Could not open the download folder.', true); }
    }

    function updateNotif() {
        if (!notifEl) return;
        var ui = notifEl.ui;
        var count = getActiveCount();
        var saved = 0, failed = 0, cancelled = 0, last = null, latest = null, doneId = null;
        activeDownloads.forEach(function(dl, id) {
            latest = dl;
            if (dl.status === 'done') { saved++; doneId = id; }
            if (dl.status === 'error') failed++;
            if (dl.status === 'cancelled') cancelled++;
            if (dl.status === 'downloading' && !last) last = dl;
        });
        if (!last) activeDownloads.forEach(function(dl) { if (!last && dl.status === 'queued') last = dl; });
        ui.open.hidden = count > 0 || !saved;
        ui.actions.hidden = ui.open.hidden;
        ui.open.onclick = function() { var done = activeDownloads.get(doneId); if (done && done.openFolder) done.openFolder(); else openFolder(doneId, 'track'); };
        ui.cancel.setAttribute('aria-label', count ? 'Cancel song downloads' : 'Dismiss song download');
        ui.cancel.title = count ? 'Cancel download' : 'Dismiss';
        var phase = count ? 'downloading' : failed ? 'error' : saved ? 'done' : 'cancelled';
        var cover = (last || latest) && (last || latest).cover;
        if (ui.phase !== phase || ui.cover !== cover) {
            toastIcon(ui.icon, count ? spinnerMarkup : phase === 'done' ? successMarkup : '<span style="font-size:22px">' + (failed ? '!' : '\u00d7') + '</span>', cover);
            ui.cover = cover;
            ui.phase = phase;
        }
        if (count) {
            if (notifTimeout) { clearTimeout(notifTimeout); notifTimeout = null; }
            ui.summary.textContent = 'Downloading ' + count + ' songs';
            ui.summary.hidden = count <= 1;
            ui.text.textContent = last.name;
            ui.text.title = count === 1 ? last.name : '';
            ui.detail.textContent = [last.artist, last.extra].filter(Boolean).join(' · ');
            ui.detail.hidden = !ui.detail.textContent;
            ui.detail.title = last.name + (last.artist ? ' — ' + last.artist : '');
        } else {
            ui.summary.hidden = true;
            ui.detail.hidden = false;
            ui.text.textContent = failed ? saved ? 'Downloaded with errors' : 'Download failed' : saved ? 'Downloaded!' : 'Download cancelled';
            ui.detail.textContent = (failed ? failed + ' failed' : '') + (cancelled ? (failed ? ' · ' : '') + cancelled + ' cancelled' : '');
            ui.detail.hidden = !ui.detail.textContent;
            ui.detail.title = Array.from(activeDownloads.values()).filter(function(dl) { return dl.status === 'error'; }).map(function(dl) { return dl.name + ': ' + (dl.message || 'Download failed'); }).join('\n');
            if (!notifTimeout) notifTimeout = dismissTimer(removeNotif, 5000);
        }
        arrangeNotifs();
    }

    function showNotif() {
        injectNotifStyles();
        if (notifEl) { updateNotif(); return; }
        notifEl = document.createElement('div');
        notifEl.id = 'spotdl-notif';
        notifEl.className = 'spotdl-toast';
        notifEl.style.cssText = toastStyle + ';pointer-events:auto';
        var icon = document.createElement('div');
        icon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px';
        var copy = document.createElement('div');
        copy.style.cssText = 'min-width:0;flex:0 1 auto';
        var text = document.createElement('div');
        var summary = document.createElement('div');
        summary.style.cssText = 'font-size:12px;color:#ccc;line-height:18px;margin-bottom:3px';
        summary.hidden = true;
        text.id = 'spotdl-notif-text';
        text.setAttribute('role', 'status');
        text.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;line-height:20px';
        var detail = document.createElement('div');
        detail.className = 'spotdl-detail';
        detail.style.cssText = 'font-size:14px;margin-top:2px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        var actions = document.createElement('div');
        actions.className = 'spotdl-actions';
        var open = actionButton('Open folder', function() {});
        actions.append(open);
        copy.append(summary, text, detail, actions);
        var cancel = actionButton('\u00d7', async function() {
            if (!getActiveCount()) { removeNotif(); return; }
            var jobs = [];
            activeDownloads.forEach(function(dl, id) { if (pendingSong(dl)) jobs.push({ id: id, dl: dl }); });
            await Promise.all(jobs.map(async function(job) {
                try {
                    if (job.dl.cancelImport) {
                        await job.dl.cancelImport();
                        job.dl.finish('cancelled');
                        return;
                    }
                    var result = await helperRequest('cancel?id=' + encodeURIComponent(job.id), 8000);
                    if (result.status !== 'cancelled') throw new Error('Could not cancel the download.');
                    if (activeDownloads.get(job.id) === job.dl) job.dl.finish('cancelled');
                } catch (e) { Spicetify.showNotification('Could not cancel the download. Try again.', true); }
            }));
        });
        notifEl.append(icon, copy, cancel);
        notifEl.ui = { icon: icon, text: text, detail: detail, cancel: cancel, open: open, actions: actions, summary: summary };
        document.body.appendChild(notifEl);
        updateNotif();
    }

    function removeNotif() {
        if (!notifEl) return;
        clearTimeout(notifTimeout);
        var el = notifEl;
        notifEl = null;
        notifTimeout = null;
        activeDownloads.forEach(function(dl, id) { if (!pendingSong(dl)) activeDownloads.delete(id); });
        arrangeNotifs();
        exitToast(el, function() { el.remove(); });
    }

    window.SpotifyRemasteredDownloads = {
        backgroundImport: function(task) {
            var id = 'import:' + task.id;
            var dl = { name: task.title, artist: task.artist || '', cover: task.cover || '', status: 'downloading',
                extra: task.extra || '', cancelImport: task.cancel, openFolder: task.openFolder };
            dl.finish = function(status, message) {
                if (!pendingSong(dl)) return;
                dl.status = status;
                dl.message = message || '';
                dl.cancelImport = null;
                updateNotif();
            };
            activeDownloads.set(id, dl);
            showNotif();
            return {
                update: function(extra) { if (pendingSong(dl)) { dl.extra = extra; updateNotif(); } },
                finish: dl.finish
            };
        }
    };

    function artistsForTrack(track) {
        function items(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
        var artists = [].concat(items(track.artists), items(track.firstArtist), items(track.otherArtists));
        var names = Array.isArray(artists) ? artists.map(function(artist) { return artist.name || artist.profile && artist.profile.name; }).filter(Boolean) : [];
        if (!names.length && track.metadata) {
            Object.keys(track.metadata).forEach(function(key) { if (/^artist_name(?:_\d+)?$/.test(key)) names.push(track.metadata[key]); });
        }
        return Array.from(new Set(names)).join(', ');
    }

    async function startSong(track, context) {
        var trackId = track.id;
        var prior = activeDownloads.get(trackId);
        if (prior && pendingSong(prior)) { showNotif(); return; }

        var trackName = prior ? prior.name : "track";
        var artistName = prior ? prior.artist : "";
        var cover = prior ? prior.cover : "";
        if (context) {
            var item = context.props && context.props.item;
            if (item) { trackName = item.name || trackName; artistName = artistsForTrack(item) || artistName; cover = coverFor(item) || cover; }
            var row = context.target && context.target.closest && context.target.closest('[data-testid="tracklist-row"], .main-nowPlayingWidget-nowPlaying');
            if (row) {
                var artistLinks = Array.from(row.querySelectorAll('a[href*="/artist/"]')).map(function(link) { return link.textContent.trim(); }).filter(Boolean);
                if (artistLinks.length) artistName = Array.from(new Set(artistLinks)).join(', ');
            }
        }
        var current = Spicetify.Player.data && Spicetify.Player.data.item;
        if (current && current.uri === 'spotify:track:' + trackId) {
            trackName = current.name || trackName;
            artistName = artistsForTrack(current);
            cover = coverFor(current);
        }
        // metadata lookup must not block the folder picker.
        Promise.resolve().then(function() {
            return Spicetify.GraphQL.Request(
                Spicetify.GraphQL.Definitions.getTrack,
                { uri: "spotify:track:" + trackId }
            );
        }).then(function(r) {
            if (r && r.data && r.data.trackUnion && r.data.trackUnion.name) {
                trackName = r.data.trackUnion.name;
                artistName = artistsForTrack(r.data.trackUnion) || artistName;
                cover = coverFor(r.data.trackUnion) || cover;
                var dl = activeDownloads.get(trackId);
                if (dl) { dl.name = trackName; dl.artist = artistName; dl.cover = cover; updateNotif(); }
            }
        }).catch(function() {});

        var data;
        try {
            data = await helperRequest('download?id=' + encodeURIComponent(trackId), 180000);
        } catch (e) {
            Spicetify.showNotification('Could not reach the download helper. Please try again.', true);
            return;
        }
        if (data.status === 'no_folder' || data.status === 'cancelled') return;
        if (data.status !== "started" && data.status !== 'already_downloading') {
            Spicetify.showNotification(data.message || 'Could not start the download.', true);
            return;
        }

        if (activeDownloads.has(trackId)) {
            clearTimeout(activeDownloads.get(trackId).poll);
        }

        var state = { name: trackName, artist: artistName, cover: cover, status: data.jobStatus === 'queued' ? 'queued' : 'downloading', poll: null, failures: 0, startedAt: data.jobStatus === 'queued' ? null : Date.now() };
        activeDownloads.set(trackId, state);
        showNotif();

        function finish(status, message) {
            if (!pendingSong(state)) return;
            state.status = status;
            state.message = message;
            clearTimeout(state.poll);
            if (message) Spicetify.showNotification(message, status === 'error');
            updateNotif();
        }
        state.finish = finish;
        async function pollStatus() {
            if (activeDownloads.get(trackId) !== state || !pendingSong(state)) return;
            if (state.startedAt !== null && Date.now() - state.startedAt >= 12 * 60 * 1000) {
                helperRequest('cancel?id=' + encodeURIComponent(trackId), 8000).catch(function() {});
                finish('error', 'Download timed out. Please try again.');
                return;
            }
            try {
                var d = await helperRequest('status?id=' + encodeURIComponent(trackId), 8000);
                if (!pendingSong(state)) return;
                state.failures = 0;
                if (d.status === "done") {
                    finish('done'); return;
                }
                if (d.status === 'cancelled') { finish('cancelled'); return; }
                if (d.status !== 'downloading' && d.status !== 'queued') {
                    finish('error', d.message || 'The download failed or was cancelled. Please try again.'); return;
                }
                state.status = d.status;
                if (d.status === 'downloading' && state.startedAt === null) state.startedAt = Date.now();
            } catch (e) {
                if (++state.failures >= 3) {
                    finish('error', 'Lost connection to the download helper. Please try again.'); return;
                }
            }
            updateNotif();
            state.poll = setTimeout(pollStatus, 1000);
        }
        state.poll = setTimeout(pollStatus, 1000);
    }


    var menuItem = new DownloadMenuItem({
        children: 'Download as MP3',
        leadingIcon: 'download',
        onClick: function(context) {
            var track = trackForMenu(context.props, context.target);
            if (track) startSong(track, context);
            else Spicetify.showNotification('Could not identify the song to download.', true);
        },
        shouldAdd: function(props, trigger, target) { return !!trackForMenu(props, target); }
    });

    var collectionDownloads = new Map();

    function collectionForMenu(props) {
        props = props || {};
        var candidates = props.uris || [props.uri, props.item && props.item.uri, props.reference && props.reference.uri];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var uri = downloadUri(candidates[i]);
                if (uri && (uri.type === 'playlist' || uri.type === 'album')) return uri;
            } catch (e) {}
        }
        return null;
    }

    function collectionPanel(state) {
        injectNotifStyles();
        var stack = document.getElementById('spotdl-playlists');
        if (!stack) {
            var style = document.getElementById('spotdl-playlist-style') || document.createElement('style');
            style.id = 'spotdl-playlist-style';
            style.textContent = '#spotdl-playlists{position:fixed;bottom:100px;right:8px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-height:70vh;overflow:auto}'
;
            document.head.appendChild(style);
            stack = document.createElement('div');
            stack.id = 'spotdl-playlists';
            document.body.appendChild(stack);
        }
        var panel = document.createElement('section');
        panel.className = 'spotdl-playlist spotdl-toast';
        panel.style.cssText = toastStyle + ';position:relative;bottom:auto;right:auto;pointer-events:auto';
        panel.setAttribute('aria-label', state.label + ' download');
        var icon = document.createElement('div');
        icon.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px';
        toastIcon(icon, spinnerMarkup, state.cover);
        var copy = document.createElement('div');
        copy.style.cssText = 'min-width:0;flex:0 1 auto';
        var status = document.createElement('div');
        var heading = document.createElement('div');
        heading.style.cssText = 'font-size:12px;color:#ccc;line-height:18px;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        heading.textContent = 'Downloading "' + state.name + '"';
        heading.title = heading.textContent;
        status.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        status.setAttribute('role', 'status');
        status.textContent = state.song ? state.song.name : state.name;
        status.style.fontWeight = '600';
        var detail = document.createElement('div');
        detail.style.cssText = 'font-size:12px;color:#ccc;margin-top:4px;line-height:1.4';
        detail.textContent = '0 of ' + state.total + ' songs';
        var current = document.createElement('div');
        current.className = 'spotdl-detail spotdl-current';
        current.style.cssText = 'font-size:14px;margin-top:2px;line-height:20px';
        current.textContent = state.song ? state.song.artist : '';
        current.hidden = !current.textContent;
        var actions = document.createElement('div');
        actions.className = 'spotdl-actions';
        actions.hidden = true;
        var open = actionButton('Open folder', function() { return openFolder(state.id, 'playlist'); });
        copy.append(heading, status, current, detail, actions);
        var cancel = document.createElement('button');
        cancel.textContent = '\u00d7';
        cancel.setAttribute('aria-label', 'Cancel ' + state.type + ' download');
        cancel.title = 'Cancel download';
        cancel.onclick = async function() {
            if (state.finished) { state.remove(); return; }
            cancel.disabled = true;
            try {
                await helperRequest('playlist-cancel?id=' + state.id, 8000);
                state.finish('Download cancelled', false);
            } catch (e) {
                cancel.disabled = false;
                Spicetify.showNotification('Could not cancel the download. Try again.', true);
            }
        };
        actions.append(open);
        panel.append(icon, copy, cancel);
        if (icon.statusEl) panel.insertBefore(icon.statusEl, cancel);
        stack.appendChild(panel);
        state.ui = { panel: panel, icon: icon, status: status, detail: detail, cancel: cancel, current: current, actions: actions, heading: heading };
        state.remove = function() {
            clearTimeout(state.dismiss);
            if (collectionDownloads.get(state.id) === state) collectionDownloads.delete(state.id);
            exitToast(panel, function() { panel.remove(); if (!stack.childElementCount) stack.remove(); });
        };
        arrangeNotifs();
    }

    async function withTimeout(promise, timeout) {
        var timer;
        try {
            return await Promise.race([promise, new Promise(function(resolve, reject) {
                timer = setTimeout(function() { reject(new Error('Spotify took too long to load the collection. Try again.')); }, timeout);
            })]);
        } finally { clearTimeout(timer); }
    }

    async function startCollection(collection) {
        var jobId = collection.type === 'album' ? 'album-' + collection.id : collection.id;
        var prior = collectionDownloads.get(jobId);
        if (prior && !prior.finished) return;
        if (prior && prior.ui) prior.remove();
        var state = { id: jobId, type: collection.type, label: collection.type === 'album' ? 'Album' : 'Playlist', name: 'Collection download', poll: null, finished: false, cancelled: false, helperStarted: false, failed: [], omitted: 0, trackInfo: new Map() };
        collectionDownloads.set(state.id, state);
        state.finish = function(message, error) {
            state.finished = true;
            clearTimeout(state.poll);
            if (!state.ui) {
                collectionDownloads.delete(state.id);
                if (error) Spicetify.showNotification(message, true);
                return;
            }
            state.ui.status.textContent = message;
            state.ui.heading.hidden = true;
            toastIcon(state.ui.icon, error ? '<span style="font-size:22px">!</span>' : message === 'Download cancelled' ? '<span style="font-size:22px">\u00d7</span>' : successMarkup, state.cover);
            state.ui.cancel.disabled = false;
            state.ui.cancel.setAttribute('aria-label', 'Dismiss ' + state.type + ' download');
            state.ui.cancel.title = 'Dismiss';
            state.ui.actions.hidden = false;
            state.ui.current.hidden = true;
            state.ui.detail.textContent = state.failed.length ? state.failed.length + ' failed' : '';
            state.ui.detail.hidden = !state.ui.detail.textContent;
            state.ui.detail.title = state.failed.map(function(track) { return track.name + ': ' + (track.message || 'Download failed'); }).join('\n');
            state.dismiss = dismissTimer(state.remove, 5000);
        };
        try {
            var selection = await helperRequest('playlist-folder', 180000);
            if (selection.status === 'no_folder') { state.finish('Cancelled.'); return; }
            if (selection.status !== 'selected') throw new Error(selection.message || 'Could not open the folder picker.');
            var uri = 'spotify:' + collection.type + ':' + collection.id;
            var tracks = [];
            var localSongs = null;
            var offset = 0;
            var album = collection.type === 'album';
            var albumCover = '';
            if (!album) {
                var meta = await withTimeout(Spicetify.Platform.PlaylistAPI.getMetadata(uri), 20000);
                state.name = meta.name || 'Playlist';
            }
            while (!state.cancelled) {
                var page;
                if (album) {
                    var response = await withTimeout(Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.getAlbum,
                        { uri: uri, locale: '', offset: offset, limit: 100 }), 20000);
                    var info = response && response.data && response.data.albumUnion;
                    if (!info || !info.name) throw new Error('Could not read the album.');
                    state.name = info.name;
                    albumCover = albumCover || coverFor(info);
                    var albumTracks = info.tracksV2 || info.tracks;
                    if (!albumTracks || !Array.isArray(albumTracks.items)) throw new Error('Could not read the album tracks.');
                    page = { items: albumTracks.items.map(function(entry) { return entry.track || entry; }), totalLength: albumTracks.totalCount };
                } else {
                    page = await withTimeout(Spicetify.Platform.PlaylistAPI.getContents(uri, { offset: offset, limit: 100 }), 20000);
                }
                if (!page || !Array.isArray(page.items) || !Number.isFinite(page.totalLength)) throw new Error('Could not read the complete ' + state.type + '.');
                if (!album && localSongs === null && page.items.some(function(item) { return item.isLocal || /^spotify:local:/.test(item.uri || ''); })) {
                    var catalogue = await helperRequest('link-local', 120000);
                    localSongs = catalogue.songs || [];
                }
                page.items.forEach(function(item) {
                    if (!album && /^spotify:local:/.test(item.uri || '')) {
                        var parts = item.uri.split(':').slice(2).map(function(part) { try { return decodeURIComponent(part.replace(/\+/g, ' ')); } catch (_) { return part; } });
                        var matches = (localSongs || []).filter(function(song) {
                            return song.artist === parts[0] && song.source === parts[1] && song.title === parts[2] && Math.abs(song.duration - Number(parts[3])) < 3;
                        });
                        var local = matches.length === 1 ? matches[0] : null;
                        tracks.push({ id: item.uri, name: item.name || parts[2], localFile: local ? local.file : '' });
                        state.trackInfo.set(item.uri, { id: item.uri, name: item.name || parts[2], artist: parts[0], cover: local && local.cover || coverFor(item) });
                        return;
                    }
                    var track = downloadUri(item.uri);
                    if (!track || track.type !== 'track' || item.isLocal || item.isPlayable === false || item.playability && item.playability.playable === false) { state.omitted++; return; }
                    tracks.push({ id: track.id, name: item.name || track.id });
                    state.trackInfo.set(track.id, { id: track.id, name: item.name || track.id, artist: artistsForTrack(item), cover: album ? albumCover : coverFor(item) });
                });
                offset += page.items.length;
                if (offset >= page.totalLength) break;
                if (!page.items.length || offset > 10000) throw new Error('Could not load the complete ' + state.type + '. Try again.');
            }
            if (state.cancelled) { state.finish('Cancelled.'); return; }
            if (!tracks.length) { state.finish('No downloadable songs in this ' + state.type + '.', true); return; }
            var data = await helperRequest('playlist', 180000, { id: collection.id, kind: collection.type, name: state.name, tracks: tracks, folderToken: selection.token });
            if (data.status === 'no_folder' || data.status === 'cancelled') { state.finish('Cancelled.'); return; }
            if (data.status !== 'started' && data.status !== 'already_downloading') throw new Error(data.message || 'Could not start the download. Update the download helper and try again.');
            state.helperStarted = true;
            state.total = tracks.length;
            state.song = state.trackInfo.get(tracks[0].id);
            state.cover = state.song.cover;
            collectionPanel(state);
            if (state.cancelled) {
                await helperRequest('playlist-cancel?id=' + state.id, 8000);
                state.finish('Cancelled. Files already saved have been kept.');
                return;
            }
            var connectionFailures = 0;
            async function poll() {
                if (state.finished) return;
                try {
                    var result = await helperRequest('playlist-status?id=' + state.id, 8000);
                    if (state.finished) return;
                    if (result.status !== 'downloading' && result.status !== 'done' && result.status !== 'cancelled') throw new Error('The download is no longer available.');
                    connectionFailures = 0;
                    state.failed = result.failed || [];
                    state.result = result;
                    var completed = result.saved + result.skipped + state.failed.length;
                    state.ui.panel.setAttribute('aria-label', state.label + ' download: ' + completed + ' of ' + result.total);
                    var ids = Array.isArray(result.currentIds) ? result.currentIds : [];
                    var songId = state.song && ids.indexOf(state.song.id) !== -1 ? state.song.id : ids[0];
                    var song = state.trackInfo.get(songId);
                    if (song) {
                        if (!state.song || state.song.id !== song.id) toastIcon(state.ui.icon, spinnerMarkup, song.cover);
                        state.song = song;
                        state.cover = song.cover;
                    }
                    state.ui.status.textContent = state.song ? state.song.name : state.name;
                    state.ui.status.title = state.ui.status.textContent;
                    state.ui.detail.textContent = completed + ' of ' + result.total + ' · ' + result.saved + ' saved'
                        + (result.skipped ? ' · ' + result.skipped + ' skipped' : '')
                        + (state.failed.length ? ' · ' + state.failed.length + ' failed' : '')
                        + (state.omitted ? ' · ' + state.omitted + ' local or unavailable' : '');
                    state.ui.current.textContent = state.song ? state.song.artist : '';
                    state.ui.current.title = state.ui.current.textContent;
                    state.ui.current.hidden = !state.ui.current.textContent;
                    if (result.status === 'done' || result.status === 'cancelled') {
                        state.finish(result.status === 'cancelled' ? 'Download cancelled' : state.failed.length ? 'Downloaded with errors' : 'Downloaded!', state.failed.length > 0);
                        return;
                    }
                } catch (e) {
                    if (++connectionFailures >= 3) {
                        state.finish('Download helper unavailable', true);
                        return;
                    }
                }
                state.poll = setTimeout(poll, 1000);
            }
            poll();
        } catch (e) { state.finish(e.message || 'Could not download the ' + state.type + '.', true); }
    }

    new DownloadMenuItem({
        children: 'Download as MP3s',
        leadingIcon: 'download',
        shouldAdd: function(props) { return !!collectionForMenu(props); },
        onClick: function(context) {
            var playlist = collectionForMenu(context.props);
            if (playlist) startCollection(playlist);
        }
    }).register();

    menuItem.register();
})();
