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
    function trackForMenu(props, target) {
        props = props || {};
        var candidates = props.uris || [props.uri, props.item && props.item.uri, props.reference && props.reference.uri];
        for (var i = 0; i < candidates.length; i++) {
            try {
                var parsed = Spicetify.URI.fromString(candidates[i]);
                if (parsed.type === Spicetify.URI.Type.TRACK) return parsed;
            } catch (e) {}
        }
        // the now-playing menu can omit the track from its props.
        if (target && target.closest && target.closest('.main-nowPlayingWidget-nowPlaying')) {
            try {
                var current = Spicetify.URI.fromString(Spicetify.Player.data.item.uri);
                if (current.type === Spicetify.URI.Type.TRACK) return current;
            } catch (e) {}
        }
        return null;
    }
    async function helperRequest(path, timeout) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, timeout);
        try {
            var response = await fetch('http://127.0.0.1:27382/' + path, { signal: controller.signal });
            if (!response.ok) throw new Error('Download helper unavailable');
            return await response.json();
        } finally { clearTimeout(timer); }
    }
    function truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + "…" : str;
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
            + "@keyframes spotdl-check{to{stroke-dashoffset:0}}";
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

    menuItem.register();
})();
