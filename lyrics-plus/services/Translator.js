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
		// kuroshiro emits the literal token "undefined" for kana clusters it can't
		// read (e.g. small-kana like っぺ), producing garbage such as "yuuundefined".
		// Strip it (glued or spaced) rather than surface it, then collapse the gap.
		return s.replace(/undefined/g, "").replace(/\s{2,}/g, " ").trim();
	}

	// Deterministic hiragana/katakana → macron-free Hepburn romaji for the homograph
	// pre-pass. Inputs are hand-authored dictionary readings (clean kana), so a
	// straight mora table is exact; long vowels come out doubled (おう→ou) to match
	// the rest of the pipeline. Used INSTEAD of feeding kana to kuroshiro, which in
	// "spaced" mode re-splits a bare kana string mid-word (せかい→"se kai").
	static kanaToRomaji(kana) {
		const hira = String(kana || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
		const YO = {
			"きゃ": "kya", "きゅ": "kyu", "きょ": "kyo", "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
			"しゃ": "sha", "しゅ": "shu", "しょ": "sho", "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
			"ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho", "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
			"ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo", "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
			"ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo", "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
			"りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
		};
		const B = {
			"あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
			"か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
			"が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
			"さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
			"ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
			"た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
			"だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
			"な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
			"は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
			"ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
			"ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
			"ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
			"や": "ya", "ゆ": "yu", "よ": "yo",
			"ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
			"わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n",
			"ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
			"ゃ": "ya", "ゅ": "yu", "ょ": "yo", "ゔ": "vu", "っ": "",
		};
		let out = "";
		let sokuon = false;
		for (let i = 0; i < hira.length; i++) {
			const c = hira[i], n = hira[i + 1];
			let rom;
			if (n && (n === "ゃ" || n === "ゅ" || n === "ょ") && YO[c + n]) { rom = YO[c + n]; i++; }
			else if (c === "っ") { sokuon = true; continue; }
			else if (c === "ー") { out += out.slice(-1) || ""; continue; }
			else rom = B[c];
			if (rom === undefined) { out += c; sokuon = false; continue; }
			if (sokuon) { out += rom.startsWith("ch") ? "t" : rom[0]; sokuon = false; }
			out += rom;
		}
		return out;
	}

	// Pure-ASCII, letters-only placeholder (3-letter index) that survives kuroshiro
	// untouched. The "qzq" delimiter never occurs in Hepburn romaji (no q), and a
	// solid run of ASCII letters stays one opaque token even in spaced mode.
	static _homoPlaceholder(i) {
		return "qzq"
			+ String.fromCharCode(97 + Math.floor(i / 676) % 26)
			+ String.fromCharCode(97 + Math.floor(i / 26) % 26)
			+ String.fromCharCode(97 + (i % 26))
			+ "qzq";
	}

	async romajifyText(text, target = "romaji", mode = "spaced") {
		await this.awaitFinished("ja");
		// Normalize compatibility codepoints to their canonical forms FIRST. NetEase
		// often serves lyrics using Kangxi Radicals (⽇ U+2F47) or CJK Radicals
		// Supplement glyphs that LOOK like kanji (日) but live in a separate Unicode
		// block, so kuromoji/OpenCC don't recognize them and leave them raw. NFKC
		// maps them to the real ideographs (⽇→日) and also fixes fullwidth/halfwidth
		// forms — one generic pass that kills a whole class of "weird char" bugs
		// instead of per-song special-casing.
		let src = String(text || "").normalize("NFKC");
		// Inline furigana: some sources annotate a reading right after the kanji as
		// 漢字(かな) / 漢字（かな） (e.g. 连(かさ)なる). Replace the whole kanji+bracket
		// group with just the kana so it romanizes as the intended reading instead of
		// romanizing the kanji AND the bracketed kana ("ren ( kasa ) naru").
		src = src.replace(/[一-鿿々〆ヶ]+[（(]([ぁ-ゟ゠-ヿ]+)[）)]/g, "$1");
		// NetEase (a Chinese service) serves many Japanese songs with simplified-
		// Chinese glyph forms (针/爱/仆/变/谁/图/伤…) that kuromoji's Japanese
		// dictionary can't read, so it leaves them raw in the romaji output. Normalize
		// simplified → Japanese shinjitai next (only when Han chars are present, so
		// pure-kana lines pay no cost) so the tokenizer can romanize them.
		if (/[一-鿿]/.test(src)) {
			try {
				await this.awaitFinished("zh");
				if (!this._cnToJp) this._cnToJp = this.OpenCC.Converter({ from: "cn", to: "jp" });
				// A few kanji are valid MODERN JAPANESE but are also simplified-Chinese
				// forms of a DIFFERENT character, so OpenCC cn→jp "corrects" them wrongly
				// (叶 kanau → 葉 leaf → "ha"; 蝉 semi → 蟬 → "sen"). Shield them behind PUA
				// sentinels across the OpenCC pass, then restore, so the JP reading wins.
				if (!Translator._OPENCC_SHIELD) {
					Translator._OPENCC_SHIELD = { "叶": "\uE010", "蝉": "\uE011" };
					Translator._OPENCC_UNSHIELD = { "\uE010": "叶", "\uE011": "蝉" };
				}
				src = src.replace(/[叶蝉]/g, (c) => Translator._OPENCC_SHIELD[c] || c);
				src = this._cnToJp(src);
				src = src.replace(/[\uE010-\uE01F]/g, (c) => Translator._OPENCC_UNSHIELD[c] || c);
			} catch (e) { /* OpenCC optional; fall back to the raw text */ }
		}
		// Homograph / heteronym override. kuromoji picks a reading by frequency and
		// gets some words wrong (今日 kyou vs konnichi, 上手 jouzu vs uwate, dates,
		// counters, idioms). For the romaji target, swap known words for their kana
		// reading BEFORE kuroshiro so the intended reading is romanized. A single
		// regex (keys sorted longest-first, so a longer compound wins over any
		// shorter substring of it) does it in one pass.
		let homoTokens = null;
		if (target === "romaji" && window.LYRICS_HOMOGRAPHS) {
			if (!Translator._homographRe) {
				const keys = Object.keys(window.LYRICS_HOMOGRAPHS)
					.sort((a, b) => b.length - a.length)
					.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
				Translator._homographRe = new RegExp(keys.join("|"), "g");
			}
			// Substitute each known word with its reading, but DON'T feed the bare
			// hiragana into kuroshiro: in "spaced" mode kuromoji re-tokenizes a bare
			// kana string and inserts spurious mid-word spaces (せかい→"se kai",
			// みらい→"mi rai", ぜつぼう→"ze tsu bou"). Instead pre-romanize the reading
			// here and stash it behind a pure-ASCII placeholder kuroshiro passes
			// through as one opaque token; splice the real romaji back in afterwards.
			homoTokens = [];
			src = src.replace(Translator._homographRe, (m) => {
				const kana = window.LYRICS_HOMOGRAPHS[m];
				if (!kana) return m;
				const idx = homoTokens.length;
				homoTokens.push(Translator.kanaToRomaji(kana));
				return " " + Translator._homoPlaceholder(idx) + " ";
			});
		}
		let out = await this.kuroshiro.convert(src, { to: target, mode: mode, romajiSystem: "hepburn" });
		// Splice homograph placeholders back to their pre-computed romaji readings.
		if (homoTokens && homoTokens.length) {
			out = out.replace(/qzq([a-z])([a-z])([a-z])qzq/g, (mm, a, b, c) => {
				const i = (a.charCodeAt(0) - 97) * 676 + (b.charCodeAt(0) - 97) * 26 + (c.charCodeAt(0) - 97);
				return homoTokens[i] != null ? homoTokens[i] : "";
			});
		}
		// kuromoji's dictionary can't read some rare kanji (e.g. 奔, 抄) and leaves
		// them as raw Han in the romaji output. For the romaji target (hiragana/
		// katakana/furigana modes intentionally keep kana output), romanize any
		// leftover Han via the bundled KANJIDIC reading table (on'yomi primary) so
		// no raw glyph survives — a Japanese reading (奔→hon), unlike the old
		// Chinese-pinyin fallback (奔→ben). Context-blind (one reading per kanji)
		// but this only fires on kanji kuromoji already failed to tokenize.
		if (target === "romaji" && /[一-鿿]/.test(out)) {
			if (window.LYRICS_KANJI_READINGS) {
				out = out.replace(/[一-鿿]/g, (han) => window.LYRICS_KANJI_READINGS[han] || han);
			}
			// Anything still raw (a kanji not even in the 12k KANJIDIC table) → pinyin
			// as the absolute last resort so a glyph is never left on screen.
			if (/[一-鿿]/.test(out) && window.pinyinPro?.pinyin) {
				out = out.replace(/[一-鿿]+/g, (han) => {
					try {
						return window.pinyinPro.pinyin(han, { toneType: "none", type: "string" });
					} catch (_) {
						return han;
					}
				});
			}
		}
		// Hepburn long-vowel macrons → DOUBLED vowels (ō→ou, ū→uu, ā→aa, ē→ee, ī→ii)
		// per user preference for mark-free romaji. Doubling preserves vowel LENGTH
		// (焦燥→shousou, not "shoso"; 今日→kyou, not "kyo") — ō is おう in the vast
		// majority of cases, so ou is right far more often than dropping the vowel.
		// Then strip any remaining stray combining marks just in case.
		if (target === "romaji") {
			out = out.normalize("NFC");
			const M = { "ā": "aa", "ī": "ii", "ū": "uu", "ē": "ee", "ō": "ou",
				"Ā": "Aa", "Ī": "Ii", "Ū": "Uu", "Ē": "Ee", "Ō": "Ou" };
			out = out.replace(/[āīūēōĀĪŪĒŌ]/g, (c) => M[c]);
			out = out.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
		}
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
