const ProviderMusixmatch = (() => {
	const headers = {
		Host: "apic-appmobile.musixmatch.com",
		authority: "apic-appmobile.musixmatch.com",
		"X-Cookie": "x-mxm-token-guid=",
		"x-mxm-app-version": "10.1.1",
		"X-User-Agent": "Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0",
		"Accept-Language": "en-US,en;q=0.9",
		Connection: "keep-alive",
		Accept: "application/json",
	};

	async function refreshMusixmatchToken() {
		try {
			console.warn("[Lyrics+] Musixmatch token expired or invalid. Refreshing token...");
			const res = await Spicetify.CosmosAsync.get(
				"https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0",
				null,
				headers
			);
			const newToken = res?.message?.body?.user_token;
			if (newToken) {
				CONFIG.providers.musixmatch.token = newToken;
				localStorage.setItem("lyrics-plus:provider:musixmatch:token", newToken);

				return newToken;
			}
		} catch (e) {
			console.error("[Lyrics+] Failed to auto-refresh Musixmatch token:", e);
		}
		return null;
	}

	async function findLyrics(info) {
		const baseURL =
			"https://apic-appmobile.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=mac-ios-v2.0&";

		const durr = info.duration / 1000;

		const isLocalUri = typeof info.uri === "string" && info.uri.startsWith("spotify:local:");

		const queryMxm = async (tokenVal, q) => {
			const params = {
				q_album: q.album,
				q_artist: q.artist,
				q_artists: q.artist,
				q_track: q.title,
				q_duration: durr,
				f_subtitle_length: Math.floor(durr),
				usertoken: tokenVal,
			};
			// Only send a real Spotify track id. A local file's uri
			// ("spotify:local:…:seconds") is not a valid id and derails Musixmatch's
			// matcher into a wrong / lyric-less track, so we omit it for locals and
			// let it match on title/artist/duration instead.
			if (!isLocalUri) {
				params.track_spotify_id = info.uri;
			}

			const finalURL =
				baseURL +
				Object.keys(params)
					.map((key) => `${key}=${encodeURIComponent(params[key])}`)
					.join("&");

			return await Spicetify.CosmosAsync.get(finalURL, null, headers);
		};

		// Validate a macro response → the usable body, or an { error } object.
		const evaluate = (res) => {
			const body = res?.message?.body?.macro_calls;
			if (!body) {
				return {
					error: `Musixmatch request failed with status: ${res?.message?.header?.status_code || "Unknown"}`,
					uri: info.uri,
				};
			}

			if (body["matcher.track.get"].message.header.status_code !== 200) {
				return {
					error: `Requested error: ${body["matcher.track.get"].message.header.mode}`,
					uri: info.uri,
				};
			}
			if (body["track.lyrics.get"]?.message?.body?.lyrics?.restricted) {
				return {
					error: "Unfortunately we're not authorized to show these lyrics.",
					uri: info.uri,
				};
			}

			// Musixmatch fuzzy-matches by title/artist/duration when it can't confirm a
			// track against Spotify's catalog, and these fuzzy matches return another
			// song's lyrics_body while still echoing the requested title. A genuine
			// match echoes the requested Spotify id; a fuzzy fallback returns it empty.
			// Only trust results whose matched Spotify id equals what we asked for.
			//
			// Local files have no real Spotify id — their uri is
			// "spotify:local:<artist>:<album>:<title>:<seconds>", so the last segment
			// is a duration, never a track id. Verifying by id would reject every local
			// track, but skipping verification entirely lets Musixmatch's loose
			// title/artist fuzzy-match grab a DIFFERENT song of the same name (e.g. an
			// English "Euphoria"). So for locals we verify by DURATION instead: the
			// matched track's length must be within 15s of the actual file. Real
			// Spotify tracks keep the exact-id guard.
			const matchedTrack = body["matcher.track.get"]?.message?.body?.track;
			if (isLocalUri) {
				const matchedLen = matchedTrack?.track_length;
				if (matchedLen && Math.abs(matchedLen - durr) > 15) {
					return { error: "Musixmatch: local match duration mismatch", uri: info.uri };
				}
			} else {
				const reqId = info.uri?.split(":").pop();
				if (reqId && matchedTrack && matchedTrack.track_spotify_id !== reqId) {
					return { error: "Musixmatch: unverified match (spotify id mismatch)", uri: info.uri };
				}
			}

			return body;
		};

		let currentToken = CONFIG.providers.musixmatch.token;
		let res = await queryMxm(currentToken, info);

		// If unauthorized (401/402), attempt auto-refresh
		let statusCode = res?.message?.header?.status_code;
		if (statusCode === 401 || statusCode === 402) {
			const refreshedToken = await refreshMusixmatchToken();
			if (refreshedToken) {
				currentToken = refreshedToken;
				res = await queryMxm(refreshedToken, info);
			}
		}

		let result = evaluate(res);

		// CJK title came up empty: retry with an offline-romanized query (Musixmatch
		// indexes many JP/KR/CN songs under a romaji/romaja/pinyin name).
		if (result && result.error && typeof Translator !== "undefined" && Translator.hasCJK(`${info.title} ${info.artist}`)) {
			try {
				const variants = await Translator.romanizeSearchVariants(info);
				for (const v of variants) {
					const retryBody = evaluate(await queryMxm(currentToken, v));
					if (retryBody && !retryBody.error) {
						result = retryBody;
						break;
					}
				}
			} catch (e) { /* romanization is best-effort */ }
		}

		return result;
	}

	async function getKaraoke(body) {
		const meta = body?.["matcher.track.get"]?.message?.body;
		if (!meta) {
			return null;
		}

		if (!meta.track.has_richsync || meta.track.instrumental) {
			return null;
		}

		const baseURL = "https://apic-appmobile.musixmatch.com/ws/1.1/track.richsync.get?format=json&subtitle_format=mxm&app_id=mac-ios-v2.0&";

		const params = {
			f_subtitle_length: meta.track.track_length,
			q_duration: meta.track.track_length,
			commontrack_id: meta.track.commontrack_id,
			usertoken: CONFIG.providers.musixmatch.token,
		};

		const finalURL =
			baseURL +
			Object.keys(params)
				.map((key) => `${key}=${encodeURIComponent(params[key])}`)
				.join("&");

		let result = await Spicetify.CosmosAsync.get(finalURL, null, headers);

		if (result.message.header.status_code !== 200) {
			return null;
		}

		result = result.message.body;

		const parsedKaraoke = JSON.parse(result.richsync.richsync_body).map((line) => {
			const startTime = line.ts * 1000;
			const endTime = line.te * 1000;
			const words = line.l;

			const text = words.map((word, index, words) => {
				const wordText = word.c;
				const wordStartTime = word.o * 1000;
				const nextWordStartTime = words[index + 1]?.o * 1000;

				const time = !Number.isNaN(nextWordStartTime) ? nextWordStartTime - wordStartTime : endTime - (wordStartTime + startTime);

				return {
					word: wordText,
					time,
				};
			});
			return {
				startTime,
				text,
			};
		});

		return parsedKaraoke;
	}

	function getSynced(body) {
		const meta = body?.["matcher.track.get"]?.message?.body;
		if (!meta) {
			return null;
		}

		const hasSynced = meta?.track?.has_subtitles;

		const isInstrumental = meta?.track?.instrumental;

		if (isInstrumental) {
			return [{ text: "♪ Instrumental ♪", startTime: "0000" }];
		}
		if (hasSynced) {
			const subtitle = body["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle;
			if (!subtitle) {
				return null;
			}

			return JSON.parse(subtitle.subtitle_body).map((line) => ({
				text: line.text || "♪",
				startTime: line.time.total * 1000,
			}));
		}

		return null;
	}

	function getUnsynced(body) {
		const meta = body?.["matcher.track.get"]?.message?.body;
		if (!meta) {
			return null;
		}

		const hasUnSynced = meta.track.has_lyrics || meta.track.has_lyrics_crowd;

		const isInstrumental = meta?.track?.instrumental;

		if (isInstrumental) {
			return [{ text: "♪ Instrumental ♪" }];
		}
		if (hasUnSynced) {
			const lyrics = body["track.lyrics.get"]?.message?.body?.lyrics?.lyrics_body;
			if (!lyrics) {
				return null;
			}
			return lyrics.split("\n").map((text) => ({ text }));
		}

		return null;
	}

	async function getTranslation(body) {
		const track_id = body?.["matcher.track.get"]?.message?.body?.track?.track_id;
		if (!track_id) return null;

		const selectedLanguage = CONFIG.visual["musixmatch-translation-language"] || "none";
		if (selectedLanguage === "none") return null;

		const baseURL =
			"https://apic-appmobile.musixmatch.com/ws/1.1/crowd.track.translations.get?translation_fields_set=minimal&comment_format=text&format=json&app_id=mac-ios-v2.0&";

		const params = {
			track_id,
			selected_language: selectedLanguage,
			usertoken: CONFIG.providers.musixmatch.token,
		};

		const finalURL =
			baseURL +
			Object.keys(params)
				.map((key) => `${key}=${encodeURIComponent(params[key])}`)
				.join("&");

		let result = await Spicetify.CosmosAsync.get(finalURL, null, headers);

		if (result.message.header.status_code !== 200) return null;

		result = result.message.body;

		if (!result.translations_list?.length) return null;

		return result.translations_list.map(({ translation }) => ({
			translation: translation.description,
			matchedLine: translation.matched_line,
		}));
	}

	return { findLyrics, getSynced, getUnsynced, getTranslation };
})();

window.ProviderMusixmatch = ProviderMusixmatch;
