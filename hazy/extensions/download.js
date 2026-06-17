(async () => {
    async function waitForSpicetify() {
        while (
            !window.Spicetify ||
            !Spicetify.ContextMenu ||
            !Spicetify.URI ||
            !Spicetify.showNotification
        ) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    await waitForSpicetify();

    let pollInterval = null;

    function hideDownloadModal() {
        const el = document.getElementById("spotdl-modal-overlay");
        if (el) {
            el.style.opacity = "0";
            setTimeout(() => el.remove(), 200);
        }
    }

    function showDownloadModal(onCancel) {
        if (!document.getElementById("spotdl-spin-style")) {
            const style = document.createElement("style");
            style.id = "spotdl-spin-style";
            style.textContent = `
                @keyframes spotdl-spin { to { transform: rotate(360deg) } }
                @keyframes spotdl-rise {
                    from { opacity: 0; transform: translateY(16px) }
                    to   { opacity: 1; transform: translateY(0) }
                }
                @keyframes spotdl-fadein { from { opacity: 0 } to { opacity: 1 } }
                #spotdl-modal-overlay { animation: spotdl-fadein 0.2s ease forwards }
                #spotdl-modal-content { animation: spotdl-rise 0.35s cubic-bezier(0.22,1,0.36,1) forwards; will-change: transform, opacity }
                #spotdl-spinner { will-change: transform }
                #spotdl-cancel-btn:hover {
                    background: rgba(255,255,255,0.1) !important;
                    border-color: rgba(255,255,255,0.8) !important;
                    box-shadow: 0 0 18px rgba(255,255,255,0.25), 0 0 6px rgba(255,255,255,0.4) !important;
                }
            `;
            document.head.appendChild(style);
        }

        const overlay = document.createElement("div");
        overlay.id = "spotdl-modal-overlay";
        overlay.style.cssText = [
            "position:fixed", "inset:0", "z-index:9999",
            "display:flex", "align-items:center", "justify-content:center",
            "background:rgba(0,0,0,0.82)",
            "transition:opacity 0.2s ease",
        ].join(";");

        const content = document.createElement("div");
        content.id = "spotdl-modal-content";
        content.style.cssText = [
            "display:flex", "flex-direction:column", "align-items:center", "gap:22px",
        ].join(";");

        const title = document.createElement("p");
        title.textContent = "Downloading";
        title.style.cssText = [
            "margin:0",
            "color:#fff",
            "font-size:22px",
            "font-weight:700",
            "letter-spacing:-0.02em",
        ].join(";");

        const spinWrap = document.createElement("div");
        spinWrap.style.cssText = [
            "position:relative", "width:56px", "height:56px",
            "box-shadow:0 0 28px rgba(255,255,255,0.22), 0 0 8px rgba(255,255,255,0.35)",
            "border-radius:50%",
        ].join(";");

        const spinnerTrack = document.createElement("div");
        spinnerTrack.style.cssText = [
            "position:absolute", "inset:0",
            "border-radius:50%",
            "border:2.5px solid rgba(255,255,255,0.08)",
        ].join(";");

        const spinner = document.createElement("div");
        spinner.id = "spotdl-spinner";
        spinner.style.cssText = [
            "position:absolute", "inset:0",
            "border:2.5px solid transparent",
            "border-top-color:#fff",
            "border-radius:50%",
            "animation:spotdl-spin 0.75s linear infinite",
        ].join(";");

        spinWrap.appendChild(spinnerTrack);
        spinWrap.appendChild(spinner);

        const label = document.createElement("p");
        label.textContent = "Your track is on its way";
        label.style.cssText = [
            "margin:0",
            "color:rgba(255,255,255,0.38)",
            "font-size:13px",
            "font-weight:400",
        ].join(";");

        const cancelBtn = document.createElement("button");
        cancelBtn.id = "spotdl-cancel-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = [
            "margin-top:8px",
            "padding:10px 32px",
            "border-radius:20px",
            "border:1px solid rgba(255,255,255,0.35)",
            "background:transparent",
            "color:#fff",
            "font-size:13px",
            "font-weight:600",
            "cursor:pointer",
            "letter-spacing:normal",
            "box-shadow:0 0 10px rgba(255,255,255,0.1), 0 0 3px rgba(255,255,255,0.2)",
            "transition:background 0.15s, border-color 0.15s, box-shadow 0.15s",
        ].join(";");
        cancelBtn.onclick = onCancel;

        content.appendChild(title);
        content.appendChild(spinWrap);
        content.appendChild(label);
        content.appendChild(cancelBtn);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
    }

    const menuItem = new Spicetify.ContextMenu.Item(
        "Download",
        async (uris) => {
            const trackId = uris[0].split(":").pop();

            let data;
            try {
                const res = await fetch("http://127.0.0.1:27381/download?id=" + trackId);
                data = await res.json();
            } catch {
                Spicetify.showNotification("Download helper not running", true);
                return;
            }

            if (data.status !== "started") return;

            showDownloadModal(async () => {
                clearInterval(pollInterval);
                pollInterval = null;
                await fetch("http://127.0.0.1:27381/cancel").catch(() => {});
                hideDownloadModal();
                Spicetify.showNotification("Download cancelled");
            });

            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch("http://127.0.0.1:27381/status");
                    const d = await res.json();
                    if (d.status === "done") {
                        clearInterval(pollInterval);
                        pollInterval = null;
                        hideDownloadModal();
                        Spicetify.showNotification("Download complete!");
                    }
                } catch {}
            }, 2000);
        },
        (uris) => {
            try {
                return Spicetify.URI.fromString(uris[0]).type === Spicetify.URI.Type.TRACK;
            } catch {
                return false;
            }
        },
        "download",
        false
    );

    menuItem.register();
})();
