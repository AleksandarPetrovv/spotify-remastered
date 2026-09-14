

const ButtonSVG = ({ icon, active = true, onClick, disabled = false, label = "Toggle setting" }) => {
	return react.createElement(
		"button",
		{ className: `switch${active ? "" : " disabled"}`, onClick, disabled, role: "switch", "aria-checked": active, "aria-label": label },
		react.createElement("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor", dangerouslySetInnerHTML: { __html: icon } })
	);
};

const SwapButton = ({ icon, disabled, onClick, label = "Adjust value" }) => {
	return react.createElement(
		"button",
		{ className: "switch small", onClick, disabled, "aria-label": label },
		react.createElement("svg", { width: 10, height: 10, viewBox: "0 0 16 16", fill: "currentColor", dangerouslySetInnerHTML: { __html: icon } })
	);
};

const UI_COLOR_DEFAULTS = {
	"ui-switch-on-color": "",
	"ui-switch-off-color": "",
	"ui-button-bg-color": "",
	"ui-button-text-color": "",
	"ui-fab-bg-color": "",
	"ui-fab-icon-color": "",
	"ui-accent-color": "",
};

const CacheButton = () => {
	const [count, setCount] = useState(0);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		try {
			// Use cached-uris as a proxy for count since IDB count is async and expensive
			const cachedUris = JSON.parse(localStorage.getItem("lyrics-plus:cached-uris") || "[]");
			setCount(cachedUris.length);
		} catch {
			setCount(0);
		}
	}, []);

	const clearCache = async () => {
		setIsLoading(true);
		try {
			await CacheManager.clear();
			localStorage.removeItem("lyrics-plus:local-lyrics");
			localStorage.removeItem("lyrics-plus:cached-uris"); // Clear count proxy
			setCount(0);
			Spicetify.showNotification(getText("notifications.cacheClearedShort"), false, 2000);
		} catch (e) {
			console.error("Failed to clear cache:", e);
			Spicetify.showNotification(getText("notifications.translationFailed"), true, 2000);
		} finally {
			setIsLoading(false);
		}
	};

	const text = count > 0
		? getText("buttons.clearCache")
		: getText("buttons.noCache");

	return react.createElement(
		"button",
		{ className: "btn", onClick: clearCache, disabled: isLoading || count === 0 },
		text
	);
};

const ConfigButton = ({ name, text, onChange = () => { } }) => {
	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement("button", { className: "btn", onClick: onChange }, text)
		)
	);
};

const ConfigSlider = ({ name, defaultValue, onChange = () => { } }) => {
	const [active, setActive] = useState(defaultValue);
	useEffect(() => { setActive(defaultValue); }, [defaultValue]);
	const toggleState = useCallback(() => { const state = !active; setActive(state); onChange(state); }, [active]);

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement(ButtonSVG, { icon: Spicetify.SVGIcons.check, active, onClick: toggleState, label: name })
		)
	);
};

const ConfigSelection = ({ name, defaultValue, options, onChange = () => { } }) => {
	const normalizeSelectValue = (v) => (v === undefined || v === null ? "" : String(v));
	const [value, setValue] = useState(normalizeSelectValue(defaultValue));
	const setValueCallback = useCallback((event) => {
		const raw = event.target.value;
		let out = raw;
		if (Array.isArray(options)) {
			out = Number.parseInt(raw, 10);
			if (Number.isNaN(out)) out = 0;
		} else if (options && typeof options === "object") {
			const keys = Object.keys(options);
			const allNumericKeys = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
			if (allNumericKeys) {
				const n = Number.parseInt(raw, 10);
				out = Number.isNaN(n) ? raw : String(n);
			}
		}
		setValue(raw);
		onChange(out);
	}, [options, onChange]);
	useEffect(() => { setValue(normalizeSelectValue(defaultValue)); }, [defaultValue]);

	const entries = Array.isArray(options)
		? options.map((v) => [String(v), v])
		: Object.keys(options).map((k) => [k, options[k]]);
	if (!entries.length) return null;

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement("select", { className: "main-dropDown-dropDown", value, onChange: setValueCallback },
				entries.map(([optVal, label]) => react.createElement("option", { key: optVal, value: optVal }, label))
			)
		)
	);
};

const ConfigInput = ({ name, defaultValue, onChange = () => { }, placeholder = "", inputType = "text", autoComplete = "off" }) => {
	const [value, setValue] = useState(defaultValue ?? "");
	const setValueCallback = useCallback((event) => {
		const v = event.target.value;
		setValue(v);
		onChange(v);
	}, [onChange]);
	useEffect(() => { setValue(defaultValue ?? ""); }, [defaultValue]);

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement("input", { value, onChange: setValueCallback, placeholder, type: inputType, autoComplete, spellCheck: false })
		)
	);
};

// Combo input = free-form text input + native <datalist> of preset suggestions.
// Users can either pick a preset from the dropdown or type any custom value.
// `options` accepts either ["string", ...] or [{ value, label }, ...] entries.
const ConfigComboBox = ({ name, defaultValue, onChange = () => { }, placeholder = "", inputType = "text", autoComplete = "off", options = [] }) => {
	const listId = useMemo(
		() => `lp-datalist-${String(name).replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
		[name]
	);
	const [value, setValue] = useState(defaultValue ?? "");
	const setValueCallback = useCallback((event) => {
		const v = event.target.value;
		setValue(v);
		onChange(v);
	}, [onChange]);
	useEffect(() => { setValue(defaultValue ?? ""); }, [defaultValue]);

	const optionEls = (options || []).map((opt) => {
		const optValue = typeof opt === "string" ? opt : opt.value;
		const optLabel = typeof opt === "string" ? undefined : opt.label;
		return react.createElement("option", { key: optValue, value: optValue, label: optLabel });
	});

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action lp-combo-action" },
			react.createElement("input", {
				value,
				onChange: setValueCallback,
				placeholder,
				type: inputType,
				autoComplete,
				spellCheck: false,
				list: listId,
				className: "lp-combo-input"
			}),
			react.createElement("datalist", { id: listId }, optionEls)
		)
	);
};

const ConfigAdjust = ({ name, defaultValue, step, min, max, onChange = () => { } }) => {
	const [value, setValue] = useState(Number(defaultValue));
	function adjust(dir) {
		let temp = value + dir * step;
		// Fix floating point errors
		temp = Math.round(temp * 100) / 100;
		if (temp < min) temp = min; else if (temp > max) temp = max;
		setValue(temp); onChange(temp);
	}
	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement(SwapButton, { icon: `<path d="M2 7h12v2H0z"/>`, onClick: () => adjust(-1), disabled: value === min, label: "Decrease " + name }),
			react.createElement("p", { className: "adjust-value" }, value),
			react.createElement(SwapButton, { icon: Spicetify.SVGIcons.plus2px, onClick: () => adjust(1), disabled: value === max, label: "Increase " + name })
		)
	);
};

// ConfigRange: Draggable range slider input with number display
const ConfigRange = ({ name, defaultValue, min = 0, max = 100, step = 5, onChange = () => { } }) => {
	// Ensure we always have a valid number, default to middle of range
	const initialValue = (defaultValue !== undefined && !isNaN(Number(defaultValue))) 
		? Number(defaultValue) 
		: Math.round((min + max) / 2);
	const [value, setValue] = useState(initialValue);
	
	const handleSliderChange = (e) => {
		const newVal = Number(e.target.value);
		setValue(newVal);
		onChange(newVal);
	};
	
	const handleInputChange = (e) => {
		let newVal = Number(e.target.value);
		if (isNaN(newVal)) newVal = initialValue;
		if (newVal < min) newVal = min;
		if (newVal > max) newVal = max;
		setValue(newVal);
		onChange(newVal);
	};
	
	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action", style: { display: "flex", alignItems: "center", gap: "8px" } },
			react.createElement("input", {
				type: "range",
				className: "lyrics-range-slider",
				min,
				max,
				step,
				value,
				onChange: handleSliderChange,
			}),
			react.createElement("input", {
				type: "number",
				className: "lyrics-range-number",
				min,
				max,
				step,
				value,
				onChange: handleInputChange,
				style: { 
					width: "55px", 
					textAlign: "center",
					padding: "4px",
					background: "rgba(255,255,255,0.1)",
					border: "1px solid rgba(255,255,255,0.2)",
					borderRadius: "4px",
					color: "inherit"
				}
			}),
			react.createElement("span", { style: { opacity: 0.7 } }, "%")
		)
	);
};

const ConfigColor = ({ name, defaultValue, onChange = () => { }, resetValue = "" }) => {
	const [value, setValue] = useState(defaultValue || resetValue);
	const debounceRef = react.useRef(null);
	const pendingValueRef = react.useRef(null);

	const flushPending = useCallback(() => {
		if (pendingValueRef.current === null) return;
		onChange(pendingValueRef.current);
		pendingValueRef.current = null;
	}, [onChange]);

	const scheduleChange = useCallback((nextValue) => {
		pendingValueRef.current = nextValue;
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		debounceRef.current = setTimeout(() => {
			flushPending();
			debounceRef.current = null;
		}, 120);
	}, [flushPending]);

	useEffect(() => {
		setValue(defaultValue || resetValue);
	}, [defaultValue, resetValue]);

	useEffect(() => () => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		flushPending();
	}, [flushPending]);

	const handleColorChange = (e) => {
		const v = e.target.value;
		setValue(v);
		scheduleChange(v);
	};

	const handleCommit = () => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
			debounceRef.current = null;
		}
		flushPending();
	};

	const handleReset = () => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
			debounceRef.current = null;
		}
		pendingValueRef.current = null;
		setValue(resetValue);
		onChange(resetValue);
	};

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action lp-color-action" },
			react.createElement("input", { type: "color", value: value || "#000000", onChange: handleColorChange, onBlur: handleCommit, className: "lp-color-swatch" }),
			react.createElement("button", { className: "btn lp-color-reset-btn", onClick: handleReset }, getText("buttons.resetToTheme"))
		)
	);
};

const ConfigHotkey = ({ name, defaultValue, onChange = () => { } }) => {
	const [value, setValue] = useState(defaultValue);
	const [trap] = useState(new Spicetify.Mousetrap());

	function record() {
		trap.handleKey = (character, modifiers, e) => {
			if (e.type === "keydown") {
				const sequence = [...new Set([...modifiers, character])];
				if (sequence.length === 1 && sequence[0] === "esc") { onChange(""); setValue(""); return; }
			setValue(sequence.join("+"));
			}
		};
	}
	function finishRecord() { trap.handleKey = () => { }; onChange(value); }
	useEffect(() => () => { trap.handleKey = () => {}; trap.reset(); }, [trap]);

	return react.createElement("div", { className: "setting-row" },
		react.createElement("label", { className: "col description" }, name),
		react.createElement("div", { className: "col action" },
			react.createElement("input", { value, onFocus: record, onBlur: finishRecord })
		)
	);
};

const OptionList = ({ type, items, onChange }) => {
    const [itemList, setItemList] = useState(items);
    const [, forceUpdate] = useState();
    useEffect(() => { setItemList(items); }, [items]);
    useEffect(() => {
        if (!type) return;
        const listener = (event) => { if (event.detail?.type === type) setItemList(event.detail.items); };
        document.addEventListener("lyrics-plus", listener);
        return () => document.removeEventListener("lyrics-plus", listener);
    }, [type]);
    return itemList.filter(item => item && (!item.when || item.when())).map(item =>
        react.createElement("div", { className: "setting-group", key: item.key },
            react.createElement(item.type, { ...item, name: item.desc, defaultValue: CONFIG.visual[item.key],
                onChange: value => { (item.onChange || onChange)(item.key, value); forceUpdate({}); } }),
            item.info && react.createElement("p", { className: "setting-desc", dangerouslySetInnerHTML: { __html: item.info } })
        )
    );
};

const languageCodes = "none,en,af,ar,bg,bn,ca,zh,cs,da,de,el,es,et,fa,fi,fr,gu,he,hi,hr,hu,id,is,it,ja,jv,kn,ko,lt,lv,ml,mr,ms,nl,no,pl,pt,ro,ru,sk,sl,sr,su,sv,ta,te,th,tr,uk,ur,vi,zu".split(",");
const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageOptions = languageCodes.reduce((options, code) => { options[code] = code === "none" ? "None" : displayNames.of(code); return options; }, {});

const LyricsSettingsSection = ({ title, description, children, className = "" }) => react.createElement("section", { className: "lp-settings-section " + className },
    react.createElement("h3", null, title),
    description && react.createElement("p", { className: "lp-section-description" }, description), children);

const LyricsManagedSetting = ({ title, description, value = "Managed" }) => react.createElement("div", { className: "lp-managed-row" },
    react.createElement("div", null, react.createElement("strong", null, title), react.createElement("p", null, description)),
    react.createElement("span", { className: "lp-managed-value", "aria-label": title + ": " + value }, value));

const LyricsSourceSettings = ({ refresh }) => {
    const sources = {
        spotify: ["Spotify", "Official synced lyrics for Spotify tracks."],
        local: ["Saved lyrics", "Lyrics you have imported or saved on this computer."],
        musixmatch: ["Musixmatch", "Synced lyrics and provider translations."],
        genius: ["Genius", "An additional source for lyrics without timestamps."],
        netease: ["NetEase", "Additional coverage for Japanese, Korean and Chinese songs."],
        lrclib: ["LRCLIB", "Synced and unsynced lyrics from an open lyric library."]
    };
    const core = ["spotify", "local", "netease", "lrclib"];
    const toggle = (id) => {
        if (core.includes(id)) return;
        CONFIG.providers[id].on = !CONFIG.providers[id].on;
        ConfigUtils.setPersisted(`${APP_NAME}:provider:${id}:on`, CONFIG.providers[id].on);
        refresh();
        reloadLyrics?.();
    };
    return react.createElement(LyricsSettingsSection, { title: "Lyrics sources", description: "Core sources and search priority are managed. You can turn optional sources on or off." },
        CONFIG.providersOrder.filter(id => sources[id]).map(id => react.createElement("div", { key: id, className: "lp-source-row" },
            react.createElement("div", { className: "lp-source-copy" }, react.createElement("strong", null, sources[id][0]), react.createElement("p", null, sources[id][1])),
            core.includes(id) ? react.createElement("span", { className: "lp-managed-value" }, "Always on")
                : react.createElement(ButtonSVG, { icon: Spicetify.SVGIcons.check, active: CONFIG.providers[id].on, onClick: () => toggle(id), label: sources[id][0] })
        )));
};

const ConfigHelper = () => {
    const [activeTab, setActiveTab] = useState("general");
    const [, refresh] = useState(0);
    const tabs = [
        ["general", "Reading", "Text, timing and scrolling"],
        ["background", "Background", "Album art and video"],
        ["appearance", "Appearance", "Layout and theme"],
        ["providers", "Lyrics sources", "Coverage and access"],
        ["maintenance", "Maintenance", "Refresh and managed settings"]
    ];
    const update = () => refresh(value => value + 1);
    const onChange = (name, value) => {
        if (["ja-detect-threshold", "hans-detect-threshold", "playbar-button", "debug-mode"].includes(name)) return;
        CONFIG.visual[name] = value;
        ConfigUtils.setPersisted(`${APP_NAME}:visual:${name}`, value);
        if (name === "musixmatch-translation-language") reloadLyrics?.();
        else lyricContainerUpdate?.();
        window.dispatchEvent(new CustomEvent("lyrics-plus", { detail: { type: "config", name, value } }));
        update();
    };
    const options = items => react.createElement(OptionList, { items, onChange });
    const setting = (key, desc, type, extra = {}) => ({ key, desc, type, ...extra });
    let content;
    if (activeTab === "general") content = react.createElement(react.Fragment, null,
        react.createElement(LyricsSettingsSection, { title: "Text and timing" }, options([
            setting("ui-language", getText("settings.language.label"), ConfigSelection, { options: { en: "English", vi: "Tiếng Việt", ko: "한국어", ja: "日本語", zh: "中文（简体）" }, onChange: (key, value) => {
                onChange(key, value); closeLyricsSettings().then(openConfig);
            } }),
            setting("font-size", getText("settings.fontSize.label"), ConfigAdjust, { min: fontSizeLimit.min, max: fontSizeLimit.max, step: fontSizeLimit.step }),
            setting("alignment", getText("settings.alignment.label"), ConfigSelection, { options: { left: "Left", center: "Center", right: "Right" } }),
            setting("global-delay", getText("settings.globalDelay.label"), ConfigAdjust, { min: -10000, max: 10000, step: 250, info: "Adjust timing for all synced lyrics. Values are in milliseconds." }),
            setting("fullscreen-key", getText("settings.fullscreenKey.label"), ConfigHotkey)
        ])),
        react.createElement(LyricsSettingsSection, { title: "Scrolling" }, options([
            setting("lines-before", getText("settings.linesBefore.label"), ConfigSelection, { options: [0, 1, 2, 3, 4] }),
            setting("lines-after", getText("settings.linesAfter.label"), ConfigSelection, { options: [0, 1, 2, 3, 4] }),
            setting("synced-compact", "Compact synced lyrics", ConfigSlider),
            setting("fade-blur", getText("settings.fadeBlur.label"), ConfigSlider),
            setting("unsynced-auto-scroll", getText("settings.unsyncedAutoScroll.label"), ConfigSlider)
        ])),
        react.createElement(LyricsSettingsSection, { title: "Provider translations", description: "Use translations supplied by Musixmatch when available. Romanization remains available from the lyric toolbar." }, options([
            setting("musixmatch-translation-language", "Translation language", ConfigSelection, { options: languageOptions })
        ])));
    if (activeTab === "background") content = react.createElement(react.Fragment, null,
        react.createElement(LyricsSettingsSection, { title: "Album artwork" }, options([
            setting("colorful", "Use album colours", ConfigSlider),
            setting("gradient-background", "Gradient background", ConfigSlider),
            setting("transparent-background", "Use the Hazy background", ConfigSlider),
            setting("noise", "Background texture", ConfigSlider),
            setting("background-brightness", "Background brightness", ConfigAdjust, { min: 0, max: 100, step: 5 })
        ])),
        react.createElement(LyricsSettingsSection, { title: "Video background" }, options([
            setting("video-background", "Enable video background", ConfigSlider),
            setting("video-background-fullscreen", "Cover the Spotify window", ConfigSlider, { when: () => CONFIG.visual["video-background"] }),
            setting("video-background-scale", "Video scale", ConfigAdjust, { min: 1, max: 2, step: 0.1, when: () => CONFIG.visual["video-background"] }),
            setting("video-background-dim", "Video dimming", ConfigAdjust, { min: 0, max: 100, step: 5, when: () => CONFIG.visual["video-background"] }),
            setting("video-background-blur", "Video blur", ConfigAdjust, { min: 0, max: 80, step: 2, when: () => CONFIG.visual["video-background"] })
        ])));
    if (activeTab === "appearance") content = react.createElement(react.Fragment, null,
        react.createElement(LyricsSettingsSection, { title: "Lyrics layout" }, options([
            setting("lyric-position", "Vertical lyric position", ConfigRange, { min: 0, max: 100, step: 5 })
        ])),
        react.createElement(LyricsSettingsSection, { title: "Theme colours", className: "lp-theme-section", description: "Settings controls follow Hazy so text and controls stay readable." },
            react.createElement(LyricsManagedSetting, { title: "Controls and accent", description: "Uses the current Spotify Remastered theme.", value: "Theme" }),
            react.createElement("button", { className: "btn", onClick: () => {
                Object.keys(UI_COLOR_DEFAULTS).forEach(key => { CONFIG.visual[key] = ""; ConfigUtils.setPersisted(`${APP_NAME}:visual:${key}`, ""); });
                lyricContainerUpdate?.(); update();
                Spicetify.showNotification("Theme colours restored.");
            } }, "Restore theme colours")));
    if (activeTab === "providers") content = react.createElement(LyricsSourceSettings, { refresh: update });
    if (activeTab === "maintenance") content = react.createElement(react.Fragment, null,
        react.createElement(LyricsSettingsSection, { title: "Refresh lyrics", description: "Saved and imported lyrics are kept." },
            react.createElement("button", { className: "btn", onClick: () => reloadLyrics?.() }, "Refresh current lyrics"),
            react.createElement("button", { className: "btn", onClick: () => { CacheManager._l1Cache.clear(); Spicetify.showNotification("Memory cache cleared."); } }, "Clear memory cache")),
        react.createElement(LyricsSettingsSection, { title: "Managed settings", description: "These settings are maintained by Spotify Remastered." },
            react.createElement(LyricsManagedSetting, { title: "Source priority", description: "Spotify stays first; fallback order is configured for this fork." }),
            react.createElement(LyricsManagedSetting, { title: "Language detection", description: "Japanese and Chinese detection use the tuned defaults." }),
            react.createElement(LyricsManagedSetting, { title: "Lyrics connections", description: "Uses the configured lyric connections. Advanced connection values are kept out of this menu." }),
            react.createElement(LyricsManagedSetting, { title: "Playback-bar lyrics button", description: "Always available, including for local songs.", value: "Always on" }),
            react.createElement(LyricsManagedSetting, { title: "App updates", description: "Installed through Spotify Remastered.", value: "Managed" })));
    const selected = tabs.find(tab => tab[0] === activeTab);
    return react.createElement("div", { className: "lp-settings-layout" },
        react.createElement("nav", { className: "lp-settings-nav", "aria-label": "Lyrics settings sections" },
            tabs.map(tab => react.createElement("button", { key: tab[0], type: "button", className: activeTab === tab[0] ? "active" : "", "aria-current": activeTab === tab[0] ? "page" : undefined, onClick: () => setActiveTab(tab[0]) }, tab[1]))),
        react.createElement("div", { className: "lp-settings-content", key: activeTab },
            react.createElement("header", { className: "lp-settings-heading" }, react.createElement("h2", null, selected[1]), react.createElement("p", null, selected[2])), content),
        react.createElement("footer", { className: "lp-settings-footer" }, "Changes are saved automatically."));
};

let lyricsSettingsMotion = null;

function closeLyricsSettings() {
    if (lyricsSettingsMotion) return lyricsSettingsMotion.close();
    Spicetify.PopupModal.hide();
    return Promise.resolve();
}

function openConfig() {
    if (lyricsSettingsMotion) lyricsSettingsMotion.cleanup();
    Spicetify.PopupModal.display({ title: "Lyrics settings", isLarge: true,
        content: react.createElement("div", { id: `${APP_NAME}-config-container` }, react.createElement(ConfigHelper)) });
    const overlay = document.getElementById(`${APP_NAME}-config-container`)?.closest(".GenericModal__overlay");
    if (!overlay) return;
    const dialog = overlay.querySelector(".spicetify-popup");
    const entering = overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    let closing = null;
    const cleanup = () => {
        overlay.removeEventListener("click", click, true);
        window.removeEventListener("keydown", keydown, true);
        if (lyricsSettingsMotion === controller) lyricsSettingsMotion = null;
    };
    const close = () => {
        if (closing) return closing;
        const opacity = getComputedStyle(overlay).opacity;
        entering.cancel();
        closing = overlay.animate([{ opacity }, { opacity: 0 }], { duration: 160, easing: "ease-in", fill: "forwards" }).finished.catch(() => {}).then(() => {
            cleanup();
            if (overlay.isConnected) Spicetify.PopupModal.hide();
        });
        return closing;
    };
    const click = event => {
        if (event.target.closest(".spicetify-popup-closeBtn") || !dialog.contains(event.target)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }
    };
    const keydown = event => {
        if (!overlay.isConnected) { cleanup(); return; }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }
    };
    const controller = { close, cleanup };
    lyricsSettingsMotion = controller;
    overlay.addEventListener("click", click, true);
    window.addEventListener("keydown", keydown, true);
}

window.openConfig = openConfig;
