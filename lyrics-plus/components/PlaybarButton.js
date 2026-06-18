(function PlaybarButton() {
	if (!Spicetify.Platform.History) {
		setTimeout(PlaybarButton, 300);
		return;
	}

	// Force Spotify's native lyrics button to stay enabled on every song,
	// even ones without Spotify-native lyrics (where it normally greys out),
	// and redirect its click to the Lyrics Plus page.
	const forceEnableStyle = () => {
		if (document.getElementById("lp-force-enable-style")) return;
		const style = document.createElement("style");
		style.id = "lp-force-enable-style";
		style.textContent = `
			.main-nowPlayingBar-lyricsButton,
			button[data-testid="lyrics-button"],
			.main-nowPlayingBar-lyricsButton:disabled,
			button[data-testid="lyrics-button"]:disabled {
				opacity: 1 !important;
				pointer-events: auto !important;
				cursor: pointer !important;
			}
		`;
		document.head.appendChild(style);
	};

	const redirectLyricsButton = () => {
		document.querySelectorAll(".main-nowPlayingBar-lyricsButton, button[data-testid='lyrics-button']").forEach(btn => {
			// Always strip the disabled state Spotify applies when no native lyrics exist
			btn.removeAttribute("disabled");
			btn.removeAttribute("aria-disabled");

			if (btn.dataset.lyricsRedirected) return;
			btn.dataset.lyricsRedirected = "true";
			btn.addEventListener("click", (e) => {
				e.stopImmediatePropagation();
				e.preventDefault();
				if (Spicetify.Platform.History.location.pathname !== "/lyrics-plus") {
					Spicetify.Platform.History.push("/lyrics-plus");
				} else {
					Spicetify.Platform.History.goBack();
				}
			}, true);
		});
	};

	const hideNavLink = () => {
		document.querySelectorAll(".main-globalNav-navLink").forEach(el => {
			if (el.innerHTML.includes("M13.426")) {
				el.parentElement.style.display = "none";
			}
		});
	};

	forceEnableStyle();
	redirectLyricsButton();
	hideNavLink();
	new MutationObserver(() => {
		redirectLyricsButton();
		hideNavLink();
	}).observe(document.body, { childList: true, subtree: true });
})();
