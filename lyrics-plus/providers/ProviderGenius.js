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

	// Genius indexes many non-Latin songs under a transliterated (romanized)
	// title, so a native-script query can return zero results even when the song
	// is present. Romanize so we can retry with a Latin query. Covers Cyrillic
	// (Bulgarian/Russian/Serbian/Ukrainian) and Greek; Latin-with-diacritics is
	// handled by Unicode NFD decomposition + combining-mark stripping.
	const TRANSLIT = {
		// Cyrillic
		а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", є: "ye", ж: "zh",
		з: "z", и: "i", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n",
		о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
		ч: "ch", ш: "sh", щ: "sht", ъ: "a", ы: "y", ь: "y", э: "e", ю: "yu",
		я: "ya", ђ: "dj", ј: "j", љ: "lj", њ: "nj", ћ: "c", џ: "dz", ґ: "g",
		// Greek
		α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
		κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
		ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
	};
	function transliterate(str) {
		const mapped = String(str || "").replace(/[Ͱ-ϿЀ-ԯ]/g, (ch) => {
			const lower = ch.toLowerCase();
			const rep = TRANSLIT[lower];
			if (rep === undefined) return ch;
			return ch === lower ? rep : rep.charAt(0).toUpperCase() + rep.slice(1);
		});
		// Strip diacritics from any remaining Latin-with-accents characters.
		return mapped.normalize("NFD").replace(/[̀-ͯ]/g, "");
	}

	async function searchHits(queryStr) {
		const searchURL = `https://genius.com/api/search/song?q=${encodeURIComponent(queryStr)}`;
		const res = await corsGet(searchURL);
		const searchData = await res.json();
		return searchData?.response?.sections?.[0]?.hits;
	}

	async function findLyrics(info) {
		const cyr = `${info.title} ${info.artist}`;

		let hits;
		try {
			hits = await searchHits(cyr);
			if (!hits?.length) {
				const latin = transliterate(cyr);
				if (latin !== cyr) {
					hits = await searchHits(latin);
				}
			}
			// The char-map above only covers Cyrillic/Greek. For CJK titles Genius
			// files under a romanized name too, so retry with offline romaji/romaja/
			// pinyin (kuromoji/aromanize/pinyin) when the native query came up empty.
			if (!hits?.length && typeof Translator !== "undefined" && Translator.hasCJK(cyr)) {
				const variants = await Translator.romanizeSearchVariants(info);
				for (const v of variants) {
					hits = await searchHits(`${v.title} ${v.artist}`.trim());
					if (hits?.length) break;
				}
			}
		} catch (e) {
			return { error: "Genius: network error" };
		}

		if (!hits?.length) { return { error: "Genius: no results" }; }

		const path = hits[0]?.result?.path;
		if (!path) { return { error: "Genius: no path" }; }


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
		// contains a [...] span entirely.
		const cleaned = body.lines
			.map((text) => text.trim())
			.filter((text) => text.length > 0 && !/\[[^\]]*\]/.test(text));
		if (!cleaned.length) return null;

		// The first line is prefixed with Genius page chrome glued to the first
		// lyric, e.g. "4ContributorsZvezdataLyrics<actual first line>" or
		// "1Contributor… Lyrics<line>". Strip everything up to and including that
		// trailing "Lyrics" marker; also handle a bare leading "Lyrics".
		cleaned[0] = cleaned[0]
			.replace(/^.*?Contributors?.*?Lyrics/s, "")
			.replace(/^\s*Lyrics\b/, "")
			.trim();
		// Strip Genius's trailing "…Embed" / "NNNEmbed" artifact on the last line.
		const last = cleaned.length - 1;
		cleaned[last] = cleaned[last].replace(/\d*Embed\s*$/, "").trim();

		const result = cleaned.filter((text) => text.length > 0);
		if (!result.length) return null;
		return result.map((text) => ({ text }));
	}

	return { findLyrics, getUnsynced };
})();

window.ProviderGenius = ProviderGenius;
