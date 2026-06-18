const ProviderGenius = (() => {
	// genius.com blocks browser fetch via CORS, and Spotify's bundled
	// cors-proxy.spicetify.app blacklists "genius.com" (returns 400 "Invalid
	// target"). That blacklist is case-sensitive, so uppercasing the host
	// (GENIUS.COM) slips past it — Genius resolves hostnames case-insensitively.
	// Zero external dependencies: reuses the proxy spicetify already ships.
	async function corsGet(url) {
		const bypassed = url.replace("https://genius.com", "https://GENIUS.COM");
		const template =
			window.localStorage.getItem("spicetify:corsProxyTemplate") ||
			"https://cors-proxy.spicetify.app/{url}";
		const proxied = template.replace("{url}", bypassed);
		const res = await fetch(proxied);
		if (!res.ok) throw new Error(`proxy ${res.status}`);
		return res;
	}

	async function findLyrics(info) {
		const query = encodeURIComponent(`${info.title} ${info.artist}`);
		const searchURL = `https://genius.com/api/search/song?q=${query}`;

		let searchData;
		try {
			const res = await corsGet(searchURL);
			searchData = await res.json();
		} catch {
			return { error: "Genius: network error" };
		}

		const hits = searchData?.response?.sections?.[0]?.hits;
		if (!hits?.length) return { error: "Genius: no results" };

		const path = hits[0]?.result?.path;
		if (!path) return { error: "Genius: no path" };

		let html;
		try {
			const res = await corsGet(`https://genius.com${path}`);
			html = await res.text();
		} catch {
			return { error: "Genius: page fetch failed" };
		}

		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");
		const containers = doc.querySelectorAll("[data-lyrics-container]");
		if (!containers.length) return { error: "Genius: no lyrics found" };

		const lines = [];
		containers.forEach((el) => {
			el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
			const text = el.innerText || el.textContent || "";
			text.split("\n").forEach((line) => lines.push(line));
		});

		return { lines };
	}

	function getUnsynced(body) {
		if (!body?.lines?.length) return null;
		// Genius embeds section headers like [Outro], [Verse 1], [Chorus: X],
		// sometimes glued inline (e.g. "Lyrics[Intro: ...]"). Drop any line that
		// contains a [...] span entirely, plus Genius's leading "Lyrics" artifact.
		const cleaned = body.lines
			.map((text) => text.trim())
			.filter((text) => text.length > 0 && !/\[[^\]]*\]/.test(text));
		if (cleaned.length && /^lyrics$/i.test(cleaned[0])) cleaned.shift();
		if (!cleaned.length) return null;
		return cleaned.map((text) => ({ text }));
	}

	return { findLyrics, getUnsynced };
})();

window.ProviderGenius = ProviderGenius;
