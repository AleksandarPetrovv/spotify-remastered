(function PlaybarButton() {
	if (!Spicetify.Platform.History) {
		setTimeout(PlaybarButton, 300);
		return;
	}

	const redirectLyricsButton = () => {
		document.querySelectorAll(".main-nowPlayingBar-lyricsButton").forEach(btn => {
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

	redirectLyricsButton();
	hideNavLink();
	new MutationObserver(() => {
		redirectLyricsButton();
		hideNavLink();
	}).observe(document.body, { childList: true, subtree: true });
})();
