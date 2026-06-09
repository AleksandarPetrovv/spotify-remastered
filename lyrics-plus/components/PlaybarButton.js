(function PlaybarButton() {
	if (!Spicetify.Platform.History) {
		setTimeout(PlaybarButton, 300);
		return;
	}

	const style = document.createElement("style");
	style.innerHTML = `
		.main-nowPlayingBar-lyricsButton {
			display: none !important;
		}
	`;

	const hideNavLink = () => {
		document.querySelectorAll(".main-globalNav-navLink").forEach(el => {
			if (el.innerHTML.includes("M13.426")) {
				el.parentElement.style.display = "none";
			}
		});
	};
	hideNavLink();
	new MutationObserver(hideNavLink).observe(document.body, { childList: true, subtree: true });
	document.head.appendChild(style);

	const button = new Spicetify.Playbar.Button(
		"Lyrics Plus",
		`<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" fill="currentColor"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z"></path></svg>`,
		() =>
			Spicetify.Platform.History.location.pathname !== "/lyrics-plus"
				? Spicetify.Platform.History.push("/lyrics-plus")
				: Spicetify.Platform.History.goBack(),
		false,
		Spicetify.Platform.History.location.pathname === "/lyrics-plus",
		false
	);
	button.register();

	Spicetify.Platform.History.listen((location) => {
		button.active = location.pathname === "/lyrics-plus";
	});
})();
