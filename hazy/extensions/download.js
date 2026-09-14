(async function() {
    while (
        !window.Spicetify ||
        !Spicetify.ContextMenuV2 ||
        !Spicetify.URI ||
        !Spicetify.showNotification
    ) {
        await new Promise(function(r) { setTimeout(r, 100); });
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
        var match = value.match(/^spotify:(track|playlist):([a-zA-Z0-9]{22})$/)
            || value.match(/^spotify:user:[^:]+:(playlist):([a-zA-Z0-9]{22})$/)
            || value.match(/^https:\/\/open\.spotify\.com\/(track|playlist)\/([a-zA-Z0-9]{22})(?:[?#].*)?$/);
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

    function getActiveCount() {
        var c = 0;
        activeDownloads.forEach(function(dl) { if (dl.status === "downloading") c++; });
        return c;
    }

    function getLastActiveTrackId() {
        var last = null;
        activeDownloads.forEach(function(dl, id) { if (dl.status === "downloading") last = id; });
        return last;
    }

    function updateNotif() {
        if (!notifEl) return;
        var count = getActiveCount();
        var textEl = notifEl.querySelector("#spotdl-notif-text");
        var iconWrap = notifEl.querySelector("#spotdl-notif-icon");
        if (!textEl || !iconWrap) return;

        if (count === 0) {
            var failed = 0;
            activeDownloads.forEach(function(dl) { if (dl.status === 'error') failed++; });
            if (failed) {
                iconWrap.textContent = '!';
                textEl.textContent = failed === 1 ? 'Download failed' : failed + ' downloads failed';
                if (notifTimeout) clearTimeout(notifTimeout);
                notifTimeout = setTimeout(removeNotif, 4000);
                return;
            }
            iconWrap.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none">'
                + '<circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>'
                + '<circle cx="12" cy="12" r="10" stroke="#1DB954" stroke-width="2" stroke-dasharray="63" stroke-dashoffset="63" style="animation:spotdl-circle 0.4s ease forwards"/>'
                + '<path d="M7.5 12.5L10.5 15.5L16.5 9.5" stroke="#1DB954" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20" stroke-dashoffset="20" style="animation:spotdl-check 0.3s ease 0.25s forwards"/>'
                + '</svg>';
            textEl.textContent = activeDownloads.size > 1 ? "All downloads complete!" : "Downloaded!";
            notifEl.style.justifyContent = "center";
            if (notifTimeout) clearTimeout(notifTimeout);
            notifTimeout = setTimeout(function() { removeNotif(); }, 2500);
            return;
        }

        if (notifTimeout) { clearTimeout(notifTimeout); notifTimeout = null; }
        notifEl.style.justifyContent = "flex-start";

        iconWrap.innerHTML = '<div style="position:relative;width:22px;height:22px">'
            + '<div style="position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,0.1)"></div>'
            + '<div style="position:absolute;inset:0;border:2px solid transparent;border-top-color:#fff;border-radius:50%;animation:spotdl-spin 0.75s linear infinite"></div>'
            + '</div>';

        if (count === 1) {
            var tid = getLastActiveTrackId();
            textEl.textContent = "Downloading \"" + truncate(getTrackName(tid), 25) + "\"";
        } else {
            textEl.textContent = "Downloading " + count + " songs…";
        }
    }

    function showNotif() {
        injectNotifStyles();
        if (notifEl) { updateNotif(); return; }
        notifEl = document.createElement("div");
        notifEl.id = "spotdl-notif";
        notifEl.style.cssText = "position:fixed;bottom:100px;right:8px;z-index:9999;display:flex;align-items:center;gap:12px;padding:14px 22px;border-radius:12px;background:rgba(18,18,18,0.92);border:1px solid rgba(255,255,255,0.08);box-shadow:0 4px 24px rgba(0,0,0,0.5);backdrop-filter:blur(16px);color:#fff;font-size:14px;font-weight:500;min-width:220px;max-width:340px;animation:spotdl-notif-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;pointer-events:none";
        var iconWrap = document.createElement("div");
        iconWrap.id = "spotdl-notif-icon";
        iconWrap.style.cssText = "flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px";
        var textEl = document.createElement("span");
        textEl.id = "spotdl-notif-text";
        textEl.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        notifEl.appendChild(iconWrap);
        notifEl.appendChild(textEl);
        document.body.appendChild(notifEl);
        updateNotif();
    }

    function removeNotif() {
        if (!notifEl) return;
        notifEl.style.animation = "spotdl-notif-out 0.3s ease forwards";
        var el = notifEl;
        notifEl = null;
        notifTimeout = null;
        setTimeout(function() { el.remove(); }, 300);
    }

    var menuItem = new Spicetify.ContextMenuV2.Item({
        children: "Download",
        leadingIcon: "download",
        onClick: async function(context) {
            var track = trackForMenu(context.props, context.target);
            if (!track) {
                Spicetify.showNotification('Could not identify the song to download.', true);
                return;
            }
            var trackId = track.id;
            var prior = activeDownloads.get(trackId);
            if (prior && prior.status === 'downloading') { showNotif(); return; }

            var trackName = "track";
            var current = Spicetify.Player.data && Spicetify.Player.data.item;
            if (current && current.uri === 'spotify:track:' + trackId) trackName = current.name || trackName;
            // metadata lookup must not block the folder picker.
            Promise.resolve().then(function() {
                return Spicetify.GraphQL.Request(
                    Spicetify.GraphQL.Definitions.getTrack,
                    { uri: "spotify:track:" + trackId }
                );
            }).then(function(r) {
                if (r && r.data && r.data.trackUnion && r.data.trackUnion.name) {
                    trackName = r.data.trackUnion.name;
                    var dl = activeDownloads.get(trackId);
                    if (dl) { dl.name = trackName; updateNotif(); }
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

            var state = { name: trackName, status: "downloading", poll: null, failures: 0, startedAt: Date.now() };
            activeDownloads.set(trackId, state);
            showNotif();

            function finish(status, message) {
                state.status = status;
                clearTimeout(state.poll);
                if (message) Spicetify.showNotification(message, status === 'error');
                updateNotif();
                setTimeout(function() {
                    if (activeDownloads.get(trackId) === state) activeDownloads.delete(trackId);
                }, 5000);
            }
            async function pollStatus() {
                if (activeDownloads.get(trackId) !== state || state.status !== 'downloading') return;
                if (Date.now() - state.startedAt >= 12 * 60 * 1000) {
                    helperRequest('cancel?id=' + encodeURIComponent(trackId), 8000).catch(function() {});
                    finish('error', 'Download timed out. Please try again.');
                    return;
                }
                try {
                    var d = await helperRequest('status?id=' + encodeURIComponent(trackId), 8000);
                    state.failures = 0;
                    if (d.status === "done") {
                        finish('done'); return;
                    }
                    if (d.status !== 'downloading') {
                        finish('error', d.message || 'The download failed or was cancelled. Please try again.'); return;
                    }
                } catch (e) {
                    if (++state.failures >= 3) {
                        finish('error', 'Lost connection to the download helper. Please try again.'); return;
                    }
                }
                state.poll = setTimeout(pollStatus, 2000);
            }
            state.poll = setTimeout(pollStatus, 2000);
        },
        shouldAdd: function(props, trigger, target) { return !!trackForMenu(props, target); }
    });

    function exitToast(element, remove) {
        element.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(40px)' }],
            { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(remove, remove);
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

    function artistsForTrack(track) {
        function items(value) { return Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []; }
        var artists = [].concat(items(track.artists), items(track.firstArtist), items(track.otherArtists));
        var names = Array.isArray(artists) ? artists.map(function(artist) { return artist.name || artist.profile && artist.profile.name; }).filter(Boolean) : [];
        if (!names.length && track.metadata) {
            Object.keys(track.metadata).forEach(function(key) { if (/^artist_name(?:_\d+)?$/.test(key)) names.push(track.metadata[key]); });
        }
        return Array.from(new Set(names)).join(', ');
    }

    var playlistDownloads = new Map();

    function playlistForMenu(props) {
        props = props || {};
        var candidates = props.uris || [props.uri, props.item && props.item.uri, props.reference && props.reference.uri];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var uri = downloadUri(candidates[i]);
                if (uri && uri.type === 'playlist') return uri;
            } catch (e) {}
        }
        return null;
    }

    function playlistPanel(state) {
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
        panel.setAttribute('aria-label', 'Playlist download');
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
        cancel.setAttribute('aria-label', 'Cancel playlist download');
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
            if (playlistDownloads.get(state.id) === state) playlistDownloads.delete(state.id);
            exitToast(panel, function() { panel.remove(); if (!stack.childElementCount) stack.remove(); });
        };
        arrangeNotifs();
    }

    async function withTimeout(promise, timeout) {
        var timer;
        try {
            return await Promise.race([promise, new Promise(function(resolve, reject) {
                timer = setTimeout(function() { reject(new Error('Spotify took too long to load the playlist. Try again.')); }, timeout);
            })]);
        } finally { clearTimeout(timer); }
    }

    async function startPlaylist(playlist) {
        var prior = playlistDownloads.get(playlist.id);
        if (prior && !prior.finished) return;
        if (prior && prior.ui) prior.remove();
        var state = { id: playlist.id, name: 'Playlist download', poll: null, finished: false, cancelled: false, helperStarted: false, failed: [], omitted: 0, trackInfo: new Map() };
        playlistDownloads.set(state.id, state);
        state.finish = function(message, error) {
            state.finished = true;
            clearTimeout(state.poll);
            if (!state.ui) {
                playlistDownloads.delete(state.id);
                if (error) Spicetify.showNotification(message, true);
                return;
            }
            state.ui.status.textContent = message;
            state.ui.heading.hidden = true;
            toastIcon(state.ui.icon, error ? '<span style="font-size:22px">!</span>' : message === 'Download cancelled' ? '<span style="font-size:22px">\u00d7</span>' : successMarkup, state.cover);
            state.ui.cancel.disabled = false;
            state.ui.cancel.setAttribute('aria-label', 'Dismiss playlist download');
            state.ui.cancel.title = 'Dismiss';
            state.ui.actions.hidden = false;
            state.ui.current.hidden = true;
            state.ui.detail.textContent = state.failed.length ? state.failed.length + ' failed' : '';
            state.ui.detail.hidden = !state.ui.detail.textContent;
            state.ui.detail.title = state.failed.map(function(track) { return track.name + ': ' + (track.message || 'Download failed'); }).join('\n');
            state.dismiss = dismissTimer(state.remove, 5000);
        };
        try {
            var uri = 'spotify:playlist:' + state.id;
            var meta = await withTimeout(Spicetify.Platform.PlaylistAPI.getMetadata(uri), 20000);
            state.name = meta.name || 'Playlist';
            var tracks = [];
            var offset = 0;
            while (!state.cancelled) {
                var page = await withTimeout(Spicetify.Platform.PlaylistAPI.getContents(uri, { offset: offset, limit: 100 }), 20000);
                if (!page || !Array.isArray(page.items)) throw new Error('Could not read the playlist.');
                page.items.forEach(function(item) {
                    var track;
                    track = downloadUri(item.uri);
                    if (!track || track.type !== 'track' || item.isLocal || item.isPlayable === false) { state.omitted++; return; }
                    tracks.push({ id: track.id, name: item.name || track.id });
                    state.trackInfo.set(track.id, { id: track.id, name: item.name || track.id, artist: artistsForTrack(item), cover: coverFor(item) });
                });
                offset += page.items.length;
                if (offset >= page.totalLength) break;
                if (!page.items.length || offset > 10000) throw new Error('Could not load the complete playlist. Try again.');
            }
            if (state.cancelled) { state.finish('Cancelled.'); return; }
            if (!tracks.length) { state.finish('No downloadable songs in this playlist.', true); return; }
            var data = await helperRequest('playlist', 180000, { id: state.id, name: state.name, tracks: tracks });
            if (data.status === 'no_folder' || data.status === 'cancelled') { state.finish('Cancelled.'); return; }
            if (data.status !== 'started' && data.status !== 'already_downloading') throw new Error(data.message || 'Could not start the playlist download. Update the download helper and try again.');
            state.helperStarted = true;
            state.total = tracks.length;
            state.song = state.trackInfo.get(tracks[0].id);
            state.cover = state.song.cover;
            playlistPanel(state);
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
                    if (result.status !== 'downloading' && result.status !== 'done' && result.status !== 'cancelled') throw new Error('The playlist download is no longer available.');
                    connectionFailures = 0;
                    state.failed = result.failed || [];
                    state.result = result;
                    var completed = result.saved + result.skipped + state.failed.length;
                    state.ui.panel.setAttribute('aria-label', 'Playlist download: ' + completed + ' of ' + result.total);
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
        } catch (e) { state.finish(e.message || 'Could not download the playlist.', true); }
    }

    new Spicetify.ContextMenuV2.Item({
        children: 'Download as MP3s',
        leadingIcon: 'download',
        shouldAdd: function(props) { return !!playlistForMenu(props); },
        onClick: function(context) {
            var playlist = playlistForMenu(context.props);
            if (playlist) startPlaylist(playlist);
        }
    }).register();

    menuItem.register();
})();
