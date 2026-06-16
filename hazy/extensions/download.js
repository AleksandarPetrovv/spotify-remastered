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

    const menuItem = new Spicetify.ContextMenu.Item(
        "Download",
        (uris) => {
            const trackId = uris[0].split(":").pop();
            fetch("http://127.0.0.1:27381/download?id=" + trackId, {mode: "no-cors"}).catch(() => {});
            Spicetify.showNotification("Opening download picker...");
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
