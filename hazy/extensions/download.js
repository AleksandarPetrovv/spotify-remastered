(async function() {
    while (
        !window.Spicetify ||
        !Spicetify.ContextMenu ||
        !Spicetify.URI ||
        !Spicetify.showNotification
    ) {
        await new Promise(function(r) { setTimeout(r, 100); });
    }

    var activeDownloads = new Map();
    var notifEl = null;
    var notifTimeout = null;
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

    var menuItem = new Spicetify.ContextMenu.Item(
        "Download",
        async function(uris) {
            var trackId = uris[0].split(":").pop();

            var trackName = "track";
            try {
                var r = await Spicetify.GraphQL.Request(
                    Spicetify.GraphQL.Definitions.getTrack,
                    { uri: "spotify:track:" + trackId }
                );
                if (r && r.data && r.data.trackUnion && r.data.trackUnion.name) {
                    trackName = r.data.trackUnion.name;
                }
            } catch (e) {}

            var data;
            try {
                var res = await fetch("http://127.0.0.1:27382/download?id=" + trackId);
                data = await res.json();
            } catch (e) {
                return;
            }
            if (data.status !== "started") return;

            if (activeDownloads.has(trackId)) {
                clearInterval(activeDownloads.get(trackId).poll);
            }

            activeDownloads.set(trackId, { name: trackName, status: "downloading", poll: null });
            showNotif();

            var poll = setInterval(async function() {
                try {
                    var res = await fetch("http://127.0.0.1:27382/status?id=" + trackId);
                    var d = await res.json();
                    if (d.status === "done") {
                        clearInterval(poll);
                        var dl = activeDownloads.get(trackId);
                        if (dl) dl.status = "done";
                        updateNotif();
                        if (getActiveCount() === 0) {
                            setTimeout(function() {
                                var toRemove = [];
                                activeDownloads.forEach(function(dl2, id) {
                                    if (dl2.status === "done") toRemove.push(id);
                                });
                                toRemove.forEach(function(id) { activeDownloads.delete(id); });
                            }, 3000);
                        }
                    }
                } catch (e) {}
            }, 2000);

            var dl = activeDownloads.get(trackId);
            if (dl) dl.poll = poll;
        },
        function(uris) {
            try {
                return Spicetify.URI.fromString(uris[0]).type === Spicetify.URI.Type.TRACK;
            } catch (e) {
                return false;
            }
        },
        "download",
        false
    );

    menuItem.register();
})();
