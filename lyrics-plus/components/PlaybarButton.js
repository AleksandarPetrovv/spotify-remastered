(function PlaybarButton() {
	if (!Spicetify?.Platform?.History || !Spicetify?.Playbar?.Button) {
		setTimeout(PlaybarButton, 300);
		return;
	}

	// This file ships both as a lyrics-plus subfile and (historically) as a
	// standalone extension, so guard against creating the button twice.
	if (window.__lyricsPlusPlaybarButton) return;

	// Spotify's own now-playing "lyrics" (microphone) icon path, so ours matches.
	const LYRICS_ICON_PATH =
		`<path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797M10.5 8.118l-2.619-2.62L4.74 9.075 2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045z"/>`;

	// Recent Spotify builds no longer render the native now-playing "lyrics"
	// button on some tracks (notably LOCAL files), so the old approach of
	// force-enabling that button is unreliable — there is nothing to enable.
	// Instead we add our OWN button through the Spicetify Playbar API, which
	// renders on EVERY track (local included) and opens the Lyrics Plus page.
	const isOnLyrics = () => Spicetify.Platform.History.location.pathname === "/lyrics-plus";

	const button = new Spicetify.Playbar.Button(
		"Lyrics",
		"lyrics",
		() => {
			if (isOnLyrics()) {
				Spicetify.Platform.History.goBack();
			} else {
				Spicetify.Platform.History.push("/lyrics-plus");
			}
		},
		false,
		isOnLyrics()
	);
	window.__lyricsPlusPlaybarButton = button;
	button.element?.classList.add("lp-playbar-lyrics");
	if (!document.getElementById("lp-playbar-compat")) {
		const style = document.createElement("style");
		style.id = "lp-playbar-compat";
		style.textContent = `
            .lp-playbar-lyrics { display:flex!important;align-items:center;justify-content:center;width:32px;height:32px;padding:8px!important;border:0!important;background:none!important;color:#b3b3b3;cursor:pointer;box-sizing:border-box; }
            .lp-playbar-lyrics:hover { color:#fff; }
            .lp-playbar-lyrics.main-genericButton-buttonActive { color:var(--spice-button); }
            .lp-playbar-lyrics span { display:flex!important;align-items:center;justify-content:center; }
            .lp-playbar-lyrics svg { width:16px;height:16px;stroke:none;fill:currentColor; }
            .lp-playbar-lyrics:focus-visible { outline:2px solid var(--spice-button);outline-offset:2px;border-radius:4px; }
        `;
		document.head.appendChild(style);
	}

	// The built-in "lyrics" SVGIcon renders reliably; swap its path for
	// Spotify's exact microphone icon so ours matches the native button.
	const ourSvg = button.element?.querySelector("svg");
	if (ourSvg) ourSvg.innerHTML = LYRICS_ICON_PATH;

	// Keep the button highlighted while the lyrics page is open.
	Spicetify.Platform.History.listen(() => {
		button.active = isOnLyrics();
	});

	// Hide Spotify's own native lyrics button + top-nav lyrics link so ours is
	// the single, consistently-placed lyrics entry point on every track.
	if (!document.getElementById("lp-hide-native-lyrics")) {
		const style = document.createElement("style");
		style.id = "lp-hide-native-lyrics";
		style.textContent = `
			button[data-testid="lyrics-button"],
			.main-nowPlayingBar-lyricsButton {
				display: none !important;
			}
		`;
		document.head.appendChild(style);
	}

	const hideNavLink = () => {
		document.querySelectorAll(".main-globalNav-navLink").forEach(el => {
			if (el.innerHTML.includes("M13.426")) {
				el.parentElement.style.display = "none";
			}
		});
	};
	hideNavLink();
	new MutationObserver(() => hideNavLink()).observe(document.body, { childList: true, subtree: true });
})();
