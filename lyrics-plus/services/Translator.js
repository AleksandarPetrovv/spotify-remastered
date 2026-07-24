const dictPath = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict";

// Translator Class - Coordinator for External Utils and API Delegation
class Translator {
	constructor(lang, isUsingNetease = false) {
		this.finished = { ja: false, ko: false, zh: false };
		this.isUsingNetease = isUsingNetease;
		this.initializationPromise = null;
		this.applyKuromojiFix();
		this.initializationPromise = this.initializeAsync(lang);
	}

	async initializeAsync(lang) {
		try {
			await this.createTranslator(lang);
		} catch (error) {
			console.error(`Failed to initialize translator for language ${lang}:`, error);
			throw error;
		}
	}

	// Delegate prompt building to Prompts module (for legacy direct access if any)
	static extractGeminiJson(text) {
		return GeminiClient.extractGeminiJson(text);
	}

	// Delegate API calls to GeminiClient
	static promote(key) {
		GeminiClient.promote(key);
	}

	static async callGemini(params) {
		return GeminiClient.callGemini(params);
	}

	async awaitFinished(language) {
		const langCode = language?.slice(0, 2);
		if (this.initializationPromise) await this.initializationPromise;
		if (langCode && !this.finished[langCode]) {
			await this.createTranslator(language);
		}
	}

	applyKuromojiFix() {
		if (typeof XMLHttpRequest.prototype.realOpen !== "undefined") return;
		XMLHttpRequest.prototype.realOpen = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function (method, url, bool) {
			if (url.indexOf(dictPath.replace("https://", "https:/")) === 0) {
				this.realOpen(method, url.replace("https:/", "https://"), bool);
			} else {
				this.realOpen(method, url, bool);
			}
		};
	}

	async createTranslator(lang) {
		const langCode = lang.slice(0, 2);
		switch (langCode) {
			case "ja":
				if (this.kuroshiro) return;
				await this.waitForGlobals(['Kuroshiro', 'KuromojiAnalyzer'], 10000);
				this.kuroshiro = new Kuroshiro.default();
				await this.kuroshiro.init(new KuromojiAnalyzer({ dictPath }));
				this.finished.ja = true;
				break;
			case "ko":
				if (this.Aromanize) return;
				await this.waitForGlobals(['Aromanize'], 5000);
				this.Aromanize = Aromanize;
				this.finished.ko = true;
				break;
			case "zh":
				if (this.OpenCC) return;
				await this.waitForGlobals(['OpenCC'], 5000);
				this.OpenCC = OpenCC;
				this.finished.zh = true;
				break;
		}
	}

	async waitForGlobals(globalNames, timeoutMs = 5000) {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			const checkGlobals = () => {
				if (globalNames.every(name => typeof window[name] !== 'undefined')) { resolve(); return; }
				if (Date.now() - startTime > timeoutMs) { reject(new Error(`Timeout waiting for globals: ${globalNames.join(', ')}`)); return; }
				setTimeout(checkGlobals, 50);
			};
			checkGlobals();
		});
	}

	static normalizeRomajiString(s) {
		if (typeof s !== "string") return "";
		return s.replace(/\s{2,}/g, " ").trim();
	}

	async romajifyText(text, target = "romaji", mode = "spaced") {
		await this.awaitFinished("ja");
		let src = text;
		// NetEase (a Chinese service) serves many Japanese songs with simplified-
		// Chinese glyph forms (针/爱/仆/变/谁/图/伤…) that kuromoji's Japanese
		// dictionary can't read, so it leaves them raw in the romaji output. Normalize
		// simplified → Japanese shinjitai first (only when Han chars are present, so
		// pure-kana lines pay no cost) so the tokenizer can romanize them.
		if (/[一-鿿]/.test(text)) {
			try {
				await this.awaitFinished("zh");
				if (!this._cnToJp) this._cnToJp = this.OpenCC.Converter({ from: "cn", to: "jp" });
				src = this._cnToJp(text);
			} catch (e) { /* OpenCC optional; fall back to the raw text */ }
		}
		const out = await this.kuroshiro.convert(src, { to: target, mode: mode, romajiSystem: "hepburn" });
		return Translator.normalizeRomajiString(out);
	}

	async convertToRomaja(text, target) {
		await this.awaitFinished("ko");
		if (target === "hangul") return text;
		if (!this.Aromanize || typeof this.Aromanize.hangulToLatin !== "function") throw new Error("Korean converter not initialized");
		return this.Aromanize.hangulToLatin(text, "rr-translit");
	}

	async convertChinese(text, from, target) {
		await this.awaitFinished("zh");
		const converter = this.OpenCC.Converter({ from: from, to: target });
		return converter(text);
	}


	async convertToPinyin(text, options = {}) {
		await this.awaitFinished("zh");
		// pinyin-pro exposes `window.pinyinPro` when loaded via script tag
		if (typeof window.pinyinPro !== 'undefined' && typeof window.pinyinPro.pinyin === 'function') {
			try {
				// pinyin-pro.pinyin(text, { toneType: 'mark' }) returns pinyin with tone marks
				return window.pinyinPro.pinyin(text, { toneType: 'mark', type: 'string', ...options });
			} catch (e) {
				console.warn("[Translator] pinyin-pro failed:", e);
			}
		}
		// If library is not loaded, return original text and show warning
		console.warn("[Translator] pinyin-pro not available. Check if unpkg.com is accessible.");
		return text;
	}

	async loadPinyinPro() {
		// Compatibility fallback if anyone calls this
	}

	// ── Search-query romanization (offline, NOT AI) ─────────────────────────────
	// Providers search the native-script title first; when that returns no lyrics
	// they retry with a romanized query. This mirrors ProviderGenius's Cyrillic/
	// Greek char-map retry, but CJK can't be char-mapped (kanji have no fixed
	// reading), so it runs the async kuromoji/aromanize/opencc/pinyin engines on
	// one shared Translator instance created lazily on first miss.
	static getSharedRomanizer() {
		if (!Translator._sharedRomanizer) {
			Translator._sharedRomanizer = new Translator("ja");
		}
		return Translator._sharedRomanizer;
	}

	// Cheap gate so providers can skip the async helper entirely for Latin/Cyrillic
	// titles (kana + katakana + hangul + CJK Han).
	static hasCJK(str) {
		return /[぀-ゟ゠-ヿ가-힯一-鿿]/.test(String(str || ""));
	}

	// Returns an ordered list of romanized { title, artist, album, kind } variants
	// to retry a search with, or [] when the input has no CJK (zero cost for
	// non-CJK titles — they keep their existing paths). Kana ⇒ romaji, Hangul ⇒
	// romaja, Han-only ⇒ romaji first (Japanese reading, our common case) then
	// pinyin (the Han block is shared between Japanese kanji and Chinese hanzi, so
	// we can't tell them apart from the text alone — try both, best-effort).
	static async romanizeSearchVariants(info) {
		const title = String(info?.title || "");
		const artist = String(info?.artist || "");
		const album = String(info?.album || "");
		const probe = `${title} ${artist}`;
		const hasKana = /[぀-ゟ゠-ヿ]/.test(probe);
		const hasHangul = /[가-힯]/.test(probe);
		const hasHan = /[一-鿿]/.test(probe);
		if (!hasKana && !hasHangul && !hasHan) return [];

		const t = Translator.getSharedRomanizer();
		const variants = [];
		const seen = new Set();

		// Lyric DBs almost always index romanized titles WITHOUT diacritics, so
		// strip macrons (ū→u, ō→o) and pinyin tone marks from the search query.
		// Same NFD + combining-mark strip Genius uses for Latin diacritics. This is
		// query-only — displayed romaji lyrics keep their macrons.
		const stripMarks = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

		const addVariant = async (kind, convert) => {
			try {
				const rt = stripMarks(Translator.normalizeRomajiString((await convert(title)) || title));
				const ra = artist ? stripMarks(Translator.normalizeRomajiString((await convert(artist)) || artist)) : "";
				const ral = album ? stripMarks(Translator.normalizeRomajiString((await convert(album)) || album)) : "";
				// Skip a conversion that didn't change the query (e.g. pinyin lib
				// missing returns the original) — it would just repeat the search.
				if ((!rt || rt === title) && (!ra || ra === artist)) return;
				const dedupeKey = `${rt}␟${ra}`;
				if (seen.has(dedupeKey)) return;
				seen.add(dedupeKey);
				variants.push({ title: rt || title, artist: ra || artist, album: ral || album, kind });
			} catch (e) {
				// Romanization is best-effort; a failure just means no extra retry.
			}
		};

		if (hasHangul) {
			await t.awaitFinished("ko");
			await addVariant("romaja", (x) => t.convertToRomaja(x));
		}
		if (hasKana) {
			await t.awaitFinished("ja");
			await addVariant("romaji", (x) => t.romajifyText(x));
		} else if (hasHan) {
			await t.awaitFinished("ja");
			await addVariant("romaji", (x) => t.romajifyText(x));
			await t.awaitFinished("zh");
			await addVariant("pinyin", (x) => t.convertToPinyin(x));
		}

		return variants;
	}
}

window.Translator = Translator;
