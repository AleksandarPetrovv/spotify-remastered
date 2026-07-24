const ProviderLRCLIB = (() => {
	async function findLyrics(info) {
		const baseURL = "https://lrclib.net/api/get";
		const durr = info.duration / 1000;

		const tryGet = async (title, artist, album) => {
			const params = {
				track_name: title,
				artist_name: artist,
				album_name: album,
				duration: durr,
			};
			const finalURL = `${baseURL}?${Object.keys(params)
				.map((key) => `${key}=${encodeURIComponent(params[key])}`)
				.join("&")}`;
			const body = await fetch(finalURL);
			if (body.status !== 200) return null;
			return await body.json();
		};

		let data = await tryGet(info.title, info.artist, info.album);

		// lrclib matches on exact metadata, so a native-script (e.g. Japanese)
		// title misses entries filed under a romanized name. Retry romanized.
		if (!data && typeof Translator !== "undefined" && Translator.hasCJK(`${info.title} ${info.artist}`)) {
			try {
				const variants = await Translator.romanizeSearchVariants(info);
				for (const v of variants) {
					data = await tryGet(v.title, v.artist, v.album);
					if (data) break;
				}
			} catch (e) { /* romanization is best-effort */ }
		}

		if (!data) {
			return {
				error: "Request error: Track wasn't found",
				uri: info.uri,
			};
		}

		return data;
	}

	function getUnsynced(body) {
		const unsyncedLyrics = body?.plainLyrics;
		const isInstrumental = body.instrumental;
		if (isInstrumental) return [{ text: "♪ Instrumental ♪" }];

		if (!unsyncedLyrics) return null;

		return Utils.parseLocalLyrics(unsyncedLyrics).unsynced;
	}

	function getSynced(body) {
		const syncedLyrics = body?.syncedLyrics;
		const isInstrumental = body.instrumental;
		if (isInstrumental) return [{ text: "♪ Instrumental ♪" }];

		if (!syncedLyrics) return null;

		return Utils.parseLocalLyrics(syncedLyrics).synced;
	}

	    return { findLyrics, getSynced, getUnsynced };
})();

window.ProviderLRCLIB = ProviderLRCLIB;
