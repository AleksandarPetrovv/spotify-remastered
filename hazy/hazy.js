(function hazy() {
  if (!Spicetify?.Platform || !Spicetify?.Platform?.History?.listen) {
    setTimeout(hazy, 100);
    return;
  }

  const defImage = "https://i.imgur.com/Wl2D0h0.png";
  let startImage = localStorage.getItem("hazy:startupBg") || defImage;
  const toggleInfo = [
    {
      id: "UseCustomBackground",
      name: "Custom background",
      defVal: false,
    },
    {
      id: "UseCustomColor",
      name: "Custom color",
      defVal: false,
    },
    {
      id: "HideNowPlayingSidebar",
      name: "Hide now playing sidebar",
      defVal: false,
    },
  ];
  const toggles = {
    UseCustomBackground: false,
    UseCustomColor: false,
    HideNowPlayingSidebar: false
  };
  const sliders = [
    {
      id: "blur",
      name: "Blur",
      min: 0,
      max: 50,
      step: 1,
      defVal: 15,
      end: "px",
    },
    { id: "cont", name: "Contrast", min: 0, max: 200, step: 2, defVal: 50 },
    { id: "satu", name: "Saturation", min: 0, max: 200, step: 2, defVal: 70 },
    {
      id: "bright",
      name: "Brightness",
      min: 0,
      max: 200,
      step: 2,
      defVal: 120,
    },
  ];

  (function sidebar() {
    if (localStorage.getItem("Hazy Sidebar Activated")) return;
    // Sidebar settings
    const parsedObject = JSON.parse(
      localStorage.getItem("spicetify-exp-features")
    );

    // Variable if client needs to reload
    let reload = false;

    // Array of features
    const features = [
      "enableYLXSidebar",
      "enableRightSidebar",
      "enableRightSidebarTransitionAnimations",
      "enableRightSidebarLyrics",
      "enableRightSidebarExtractedColors",
      "enablePanelSizeCoordination",
    ];

    for (const feature of features) {
      // Ignore if feature not present
      if (!parsedObject?.[feature]) continue;

      // Change value if disabled
      if (!parsedObject?.[feature]?.value) {
        parsedObject[feature].value = true;
        reload = true;
      }
    }

    localStorage.setItem(
      "spicetify-exp-features",
      JSON.stringify(parsedObject)
    );
    localStorage.setItem("Hazy Sidebar Activated", true);
    if (reload) {
      window.location.reload();
      reload = false;
    }
  })();

  function loadSliders() {
    sliders.forEach((opt) => {
      const val = localStorage.getItem(`${opt.id}Amount`) || opt.defVal;
      document.documentElement.style.setProperty(
        `--${opt.id}`,
        `${val}${opt.end || "%"}`
      );
    });
  }

  function setAccentColor(color) {
    document.querySelector(":root").style.setProperty("--spice-button", color);
    document
      .querySelector(":root")
      .style.setProperty("--spice-button-active", color);
    document.querySelector(":root").style.setProperty("--spice-accent", color);
  }

  async function fetchFadeTime() {
    try {
      const response = await Spicetify.Platform.PlayerAPI._prefs.get({
        key: "audio.crossfade_v2",
      });

      // Default to 0.4s if crossfade is disabled
      if (!response.entries["audio.crossfade_v2"].bool) {
        document.documentElement.style.setProperty("--fade-time", "0.4s");
        return;
      }
      const fadeTimeResponse = await Spicetify.Platform.PlayerAPI._prefs.get({
        key: "audio.crossfade.time_v2",
      });
      const fadeTime =
        fadeTimeResponse.entries["audio.crossfade.time_v2"].number;

      // Use the CSS variable "--fade-time" for transition time
      document.documentElement.style.setProperty(
        "--fade-time",
        `${fadeTime / 1000}s`
      );
    } catch (error) {
      document.documentElement.style.setProperty("--fade-time", "0.4s");
    }
  }

  function getCurrentBackground() {
    let url = Spicetify?.Player?.data?.item?.metadata?.image_url;
    if (toggles.UseCustomBackground || !url) return startImage;
    if (url.startsWith("spotify:image:"))
      url = url.replace("spotify:image:", "https://i.scdn.co/image/");
    if (!URL.canParse(url)) return startImage;
    return url;
  }

  const _colorCache = new Map();
  const _pendingColors = new Map();
  let _songGeneration = 0;
  let _songRetry = 0;
  let _retryCount = 0;
  let _retryUri = null;
  let _lyricsObserver = null;
  let _lyricsRoot = null;
  let _lyricsFrame = 0;
  let _cachedFadeTime = null;

  async function onSongChange() {
    const generation = ++_songGeneration;
    clearTimeout(_songRetry);
    const uri = Spicetify.Player?.data?.item?.uri;
    if (uri !== _retryUri) { _retryUri = uri; _retryCount = 0; }
    if (!_cachedFadeTime) {
      _cachedFadeTime = true;
      fetchFadeTime();
    }

    const album_uri = Spicetify?.Player?.data?.item?.metadata?.album_uri;
    if (album_uri !== undefined && !album_uri.includes("spotify:show")) {
      // Album
    } else if (Spicetify?.Player?.data?.item?.uri?.includes("spotify:episode")) {
      // Podcast
    } else if (Spicetify?.Player?.data?.item?.isLocal) {
      // Local file
    } else if (Spicetify?.Player?.data?.item?.provider === "ad") {
      // Ad
      return;
    } else {
      // When clicking a song from the homepage, songChange is fired with half empty metadata
      if (_retryCount++ < 10) _songRetry = setTimeout(onSongChange, 200);
    }

    updateLyricsPageProperties();

    // Custom code added by lily
    if (!toggles.UseCustomColor) {
      const imgSrc = getCurrentBackground();

      if (_colorCache.has(imgSrc)) {
        const color = _colorCache.get(imgSrc);
        _colorCache.delete(imgSrc);
        _colorCache.set(imgSrc, color);
        setAccentColor(color);
      } else {
        if (!_pendingColors.has(imgSrc)) {
          const pending = new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            const finish = value => { clearTimeout(timer); img.onload = img.onerror = null; resolve(value); };
            const timer = setTimeout(() => finish(null), 15000);
            img.onerror = () => finish(null);
            img.onload = () => {
              try {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 50;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, 50, 50);
                const data = ctx.getImageData(0, 0, 50, 50).data;
                const colors = [];
                for (let i=0;i<data.length;i+=4) colors.push({r:data[i],g:data[i+1],b:data[i+2]});
                finish(findColor(colors) || findColor(colors, true));
              } catch { finish(null); }
            };
            img.src = imgSrc;
          }).then(color => {
            _pendingColors.delete(imgSrc);
            if (color) {
              _colorCache.set(imgSrc, color);
              while (_colorCache.size > 64) _colorCache.delete(_colorCache.keys().next().value);
            }
            return color;
          });
          _pendingColors.set(imgSrc, pending);
        }
        _pendingColors.get(imgSrc).then(color => {
          if (color && generation === _songGeneration && !toggles.UseCustomColor) setAccentColor(color);
        });
      }
    } else {
      setAccentColor(localStorage.getItem("CustomColor") || "#ffc0ea");
    }

    // Update background
    document.documentElement.style.setProperty(
      "--image_url",
      `url("${getCurrentBackground()}")`
    );
  }

  // Gets the most prominent color in a list of RGB values
  function findColor(rgbList, skipFilters = false) {
    const colorCount = {};
    let maxColor = "";
    let maxCount = 0;

    for (let i = 0; i < rgbList.length; i++) {
      if (
        !skipFilters &&
        (isTooDark(rgbList[i]) || isTooCloseToWhite(rgbList[i]))
      ) {
        continue;
      }

      const color = `${rgbList[i].r},${rgbList[i].g},${rgbList[i].b}`;
      colorCount[color] = (colorCount[color] || 0) + 1;

      if (colorCount[color] > maxCount) {
        maxColor = color;
        maxCount = colorCount[color];
      }
    }

    return maxColor ? rgbToHex(...maxColor.split(",").map(Number)) : null;
  }

  // Converts RGB to Hex
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  // Checks if a color is too dark
  function isTooDark(rgb) {
    const brightness = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    // Adjust this value to control the "darkness" threshold
    const threshold = 100;
    return brightness < threshold;
  }

  // Checks if a color is too close to white
  function isTooCloseToWhite(rgb) {
    const threshold = 200;
    return rgb.r > threshold && rgb.g > threshold && rgb.b > threshold;
  }

  loadSliders();
  loadToggles();
  Spicetify.Player.addEventListener("songchange", onSongChange);
  if (window.navigator.userAgent.indexOf("Win") !== -1)
    document.body.classList.add("windows");
  galaxyFade();

  function scrollToTop() {
    const element = document.querySelector(".main-entityHeader-container");
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".main-entityHeader-topbarTitle")) scrollToTop();
  });

  // Window Zoom Variable
  function updateZoomVariable() {
    let prevOuterWidth = window.outerWidth;
    let prevInnerWidth = window.innerWidth;
    let prevRatio = window.devicePixelRatio;

    function calculateAndApplyZoom() {
      const newOuterWidth = window.outerWidth;
      const newInnerWidth = window.innerWidth;
      const newRatio = window.devicePixelRatio;

      if (
        prevOuterWidth <= 160 ||
        prevRatio !== newRatio ||
        prevOuterWidth !== newOuterWidth ||
        prevInnerWidth !== newInnerWidth
      ) {
        const zoomFactor = newOuterWidth / newInnerWidth || 1;
        document.documentElement.style.setProperty("--zoom", zoomFactor);
        console.debug(
          `[Hazy] Zoom Updated: ${newOuterWidth} / ${newInnerWidth} = ${zoomFactor}`
        );

        // Update previous values
        prevOuterWidth = newOuterWidth;
        prevInnerWidth = newInnerWidth;
        prevRatio = newRatio;
      }
    }

    calculateAndApplyZoom();
    window.addEventListener("resize", calculateAndApplyZoom);
  }

  updateZoomVariable();

  function waitForElement(elements, func, timeout = 100) {
    const queries = elements.map((element) => document.querySelector(element));
    if (queries.every((a) => a)) {
      func(queries);
    } else if (timeout > 0) {
      setTimeout(waitForElement, 300, elements, func, timeout - 1);
    }
  }

  waitForElement(
    [".Root__globalNav"],
    (element) => {
      const isCenteredGlobalNav = Spicetify.Platform.version >= "1.2.46.462";
      let addedClass = "control-nav";
      if (element?.[0]?.classList.contains("Root__globalNav"))
        addedClass = isCenteredGlobalNav ? "global-nav-centered" : "global-nav";
      document.body.classList.add(addedClass);
    },
    10000
  );

  Spicetify.Platform.History.listen(updateLyricsPageProperties);

  waitForElement([".main-view-container"], ([mainViewContainer]) => {
    const mainViewContainerResizeObserver = new ResizeObserver(
      updateLyricsPageProperties
    );
    mainViewContainerResizeObserver.observe(mainViewContainer);
  });

  // Fixes container shifting & active line clipping
  // Taken from Bloom | https://github.com/nimsandu/spicetify-bloom
  function updateLyricsPageProperties() {
    const nativeLyrics = Spicetify.Platform.History.location.pathname === "/lyrics"
      || document.querySelector('.Root__lyrics-cinema .lyrics-lyricsContent-provider');
    if (!nativeLyrics) {
      _lyricsObserver?.disconnect();
      _lyricsObserver = null; _lyricsRoot = null;
      cancelAnimationFrame(_lyricsFrame); _lyricsFrame = 0;
      return;
    }
    const root = document.querySelector('.Root__lyrics-cinema .lyrics-lyricsContent-provider')?.closest('.Root__lyrics-cinema')
      || document.querySelector('.Root__main-view');
    const measure = () => {
      _lyricsFrame = 0;
      const wrapper = root?.querySelector('.lyrics-lyrics-contentWrapper');
      if (!wrapper?.parentElement) return;
      wrapper.style.maxWidth = wrapper.style.width = '';
      const margin = parseFloat(getComputedStyle(wrapper).marginLeft) || 0;
      const width = Math.round(.95 * (wrapper.parentElement.clientWidth - wrapper.offsetLeft - margin));
      const lyric = root.querySelectorAll('.lyrics-lyricsContent-lyric')[2];
      const measured = wrapper.getBoundingClientRect().width;
      document.documentElement.style.setProperty('--lyrics-text-direction', /[\u0591-\u07FF]/.test(lyric?.textContent || '') ? 'right' : 'left');
      document.documentElement.style.setProperty('--lyrics-active-max-width', `${width}px`);
      wrapper.style.maxWidth = wrapper.style.width = `${measured}px`;
    };
    const schedule = () => { if (!_lyricsFrame) _lyricsFrame = requestAnimationFrame(measure); };
    if (_lyricsRoot !== root) {
      _lyricsObserver?.disconnect();
      _lyricsRoot = root;
      if (root) {
        _lyricsObserver = new MutationObserver(schedule);
        _lyricsObserver.observe(root, { childList: true, subtree: true });
      }
    }
    schedule();
  }

  function setFadeDirection(scrollNode) {
    let fadeDirection = "full";
    if (scrollNode.scrollTop === 0) {
      fadeDirection = "bottom";
    } else if (
      scrollNode.scrollHeight -
        scrollNode.scrollTop -
        scrollNode.clientHeight ===
      0
    ) {
      fadeDirection = "top";
    }
    scrollNode.setAttribute("fade", fadeDirection);
  }

  // Add fade and dimness effects to mainview and the artist image on scroll
  // Taken from Galaxy | https://github.com/harbassan/spicetify-galaxy/
  function galaxyFade() {
    const setupFade = (selector, onScrollCallback) => {
      waitForElement([selector], ([scrollNode]) => {
        let ticking = false;

        scrollNode.addEventListener("scroll", () => {
          if (!ticking) {
            window.requestAnimationFrame(() => {
              onScrollCallback(scrollNode);
              ticking = false;
            });
            ticking = true;
          }
        });

        // Initial trigger
        onScrollCallback(scrollNode);
      });
    };

    // Apply artist fade function
    const applyArtistFade = (scrollNode) => {
      const scrollValue = scrollNode.scrollTop;
      const fadeValue = Math.max(0, (-0.3 * scrollValue + 100) / 100);
      document.documentElement.style.setProperty("--artist-fade", fadeValue);
    };

    // Main view - apply artist fade + fade direction
    setupFade(
      ".Root__main-view [data-overlayscrollbars-viewport]",
      (scrollNode) => {
        applyArtistFade(scrollNode);
        setFadeDirection(scrollNode);
      }
    );

    // Nav bar - fade direction only
    setupFade(
      ".Root__nav-bar [data-overlayscrollbars-viewport]",
      (scrollNode) => {
        scrollNode.setAttribute("fade", "bottom");
        setFadeDirection(scrollNode);
      }
    );

    // Right sidebar - fade direction only
    setupFade(
      ".Root__right-sidebar [data-overlayscrollbars-viewport]",
      (scrollNode) => {
        scrollNode.setAttribute("fade", "bottom");
        setFadeDirection(scrollNode);
      }
    );
  }

  function loadToggles() {
    toggles.UseCustomBackground = JSON.parse(
      localStorage.getItem("UseCustomBackground")
    );
    toggles.UseCustomColor = JSON.parse(localStorage.getItem("UseCustomColor"));
    toggles.HideNowPlayingSidebar = JSON.parse(localStorage.getItem("HideNowPlayingSidebar"));

    if (toggles.HideNowPlayingSidebar) {
      document.body.classList.add("__hazy_hidenowplayingsidebar");
    }
    else {
      document.body.classList.remove("__hazy_hidenowplayingsidebar");
    }

    onSongChange();
  }

  // Input for custom background images (disabled until properly implemented)
  /* const bannerInput = document.createElement("input");
  bannerInput.type = "file";
  bannerInput.className = "banner-input";
  bannerInput.accept = [
    "image/jpeg",
    "image/apng",
    "image/avif",
    "image/gif",
    "image/png",
    "image/svg+xml",
    "image/webp",
  ].join(",");

  // When user selects a custom background image
  bannerInput.onchange = () => {
    if (!bannerInput.files.length) return;

    const file = bannerInput.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target.result;
      const [, , uid] = Spicetify.Platform.History.location.pathname.split("/");
      if (!uid) {
        try {
          localStorage.setItem("hazy:startupBg", result);
        } catch {
          Spicetify.showNotification("File too large");
          return;
        }
        document.querySelector("#home-select img").src = result;
      }
    };
    reader.readAsDataURL(file);
  }; */

  // Create edit home topbar button
  const homeEdit = new Spicetify.Topbar.Button("Hazy Settings", "edit", () => {
    if (document.getElementById("hazy-settings")) return;
    const content = document.createElement("div");
    content.id = "hazy-settings";
    const body = document.createElement("div");
    body.className = "hz-settings-body";
    content.append(body);
    const make = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    function section(title, description) {
      const node = make("section", null, "hz-section");
      node.append(make("h3", title), make("p", description, "hz-description"));
      body.append(node);
      return node;
    }
    const toggleInputs = new Map();
    function toggle(parent, opt) {
      const row = make("div", null, "hz-row");
      row.append(make("span", opt.name));
      const button = make("button", null, "hz-switch");
      button.type = "button";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-label", opt.name);
      button.setAttribute("aria-checked", String(JSON.parse(localStorage.getItem(opt.id)) ?? opt.defVal));
      button.append(make("span"));
      button.onclick = () => button.setAttribute("aria-checked", String(button.getAttribute("aria-checked") !== "true"));
      toggleInputs.set(opt.id, button);
      row.append(button);
      parent.append(row);
    }
    const background = section("Background", "Choose an image or keep the current song’s artwork.");
    const preview = make("div", null, "hz-background-preview");
    const image = make("img");
    image.alt = "Background preview";
    image.src = startImage;
    const imageField = make("label", "Background image URL", "hz-image-field");
    const srcInput = make("input");
    srcInput.type = "url";
    srcInput.placeholder = "https://…";
    srcInput.value = startImage.startsWith("data:image") ? "" : startImage;
    imageField.append(srcInput);
    preview.append(image, imageField);
    background.append(preview);
    srcInput.onchange = () => { image.src = srcInput.value.trim() || startImage; };
    image.onerror = () => { image.removeAttribute("src"); };
    toggle(background, toggleInfo[0]);
    const sliderInputs = new Map();
    for (const opt of sliders) {
      const row = make("label", null, "hz-row");
      row.append(make("span", opt.name));
      const controls = make("span", null, "hz-slider-controls");
      const range = make("input");
      range.type = "range";
      const number = make("input");
      number.type = "number";
      for (const input of [range, number]) {
        input.min = opt.min; input.max = opt.max; input.step = opt.step;
        input.value = localStorage.getItem(opt.id + "Amount") ?? opt.defVal;
        input.setAttribute("aria-label", opt.name);
      }
      const paint = () => range.style.setProperty("--hz-range-progress", `${(Number(range.value) - opt.min) / (opt.max - opt.min) * 100}%`);
      paint();
      const clamp = () => {
        const value = Number.isFinite(number.valueAsNumber) ? number.valueAsNumber : opt.defVal;
        range.value = Math.max(opt.min, Math.min(opt.max, Math.round((value - opt.min) / opt.step) * opt.step + opt.min));
        number.value = range.value;
        paint();
      };
      range.oninput = () => { number.value = range.value; paint(); };
      number.onchange = clamp;
      controls.append(range, number, make("span", opt.end || "%", "hz-unit"));
      row.append(controls);
      background.append(row);
      sliderInputs.set(opt.id, { range, number, clamp, paint });
    }
    const accent = section("Accent", "Use album colours or choose a fixed accent.");
    toggle(accent, toggleInfo[1]);
    const colorRow = make("label", null, "hz-row");
    colorRow.append(make("span", "Accent colour"));
    const color = make("input");
    color.type = "color";
    color.value = localStorage.getItem("CustomColor") || "#30bf63";
    color.setAttribute("aria-label", "Accent colour");
    colorRow.append(color);
    accent.append(colorRow);
    const layout = section("Layout", "Adjust the playback sidebar.");
    toggle(layout, toggleInfo[2]);
    const footer = make("div", null, "hz-footer");
    const status = make("p", "Choose Apply to save your changes.");
    status.setAttribute("role", "status");
    const actions = make("div", null, "hz-actions");
    const reset = make("button", "Reset defaults");
    const save = make("button", "Apply", "hz-primary");
    actions.append(reset, save);
    footer.append(status, actions);
    content.append(footer);
    reset.onclick = () => {
      for (const opt of toggleInfo) toggleInputs.get(opt.id).setAttribute("aria-checked", String(opt.defVal));
      for (const opt of sliders) { const inputs = sliderInputs.get(opt.id); inputs.range.value = inputs.number.value = opt.defVal; inputs.paint(); }
      srcInput.value = defImage; image.src = defImage; color.value = "#30bf63";
      status.textContent = "Defaults restored. Choose Apply to save.";
    };
    save.onclick = async () => {
      save.disabled = true; reset.disabled = true;
      try {
        const url = srcInput.value.trim() || startImage;
        if (url !== startImage) {
          const parsed = new URL(url);
          if (!["https:", "http:", "data:"].includes(parsed.protocol)) throw new Error("Enter a valid image URL.");
          await new Promise((resolve, reject) => {
            const check = new Image();
            const timer = setTimeout(() => reject(new Error("Could not load the image. Check its URL.")), 7000);
            check.onload = () => { clearTimeout(timer); resolve(); };
            check.onerror = () => { clearTimeout(timer); reject(new Error("Could not load the image. Check its URL.")); };
            check.src = url;
          });
        }
        localStorage.setItem("hazy:startupBg", url); startImage = url; image.src = url;
        localStorage.setItem("CustomColor", color.value);
        for (const opt of toggleInfo) localStorage.setItem(opt.id, toggleInputs.get(opt.id).getAttribute("aria-checked"));
        for (const opt of sliders) { const inputs = sliderInputs.get(opt.id); inputs.clamp(); localStorage.setItem(opt.id + "Amount", inputs.range.value); }
        loadSliders(); loadToggles();
        status.textContent = "Changes applied.";
      } catch (error) { status.textContent = error instanceof TypeError ? "Enter a valid image URL." : error.message; }
      finally { save.disabled = false; reset.disabled = false; }
    };
    Spicetify.PopupModal.display({ title: "Hazy settings", content });
    const overlay = content.closest(".GenericModal__overlay");
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    overlay?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-out" });
    let closing = false;
    async function close() {
      if (closing) return;
      closing = true;
      overlay?.removeEventListener("click", click, true);
      window.removeEventListener("keydown", keydown, true);
      try { await overlay?.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: "ease-in", fill: "forwards" }).finished; } catch {}
      if (content.isConnected) Spicetify.PopupModal.hide();
    }
    function click(event) {
      if (event.target === overlay || event.target.closest(".spicetify-popup-closeBtn")) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    }
    function keydown(event) {
      if (!content.isConnected) { window.removeEventListener("keydown", keydown, true); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
    }
    overlay?.addEventListener("click", click, true);
    window.addEventListener("keydown", keydown, true);
  });
  homeEdit.element.classList.toggle("hidden", false);
  function matchSettingsControl(attempt = 0) {
    const native = document.querySelector('button[aria-label="Home"]');
    const TooltipWrapper = Spicetify.ReactComponent?.TooltipWrapper;
    if (!native || !TooltipWrapper || !Spicetify.ReactDOM?.createRoot) {
      if (attempt < 100) setTimeout(() => matchSettingsControl(attempt + 1), 100);
      return;
    }
    const button = homeEdit.button || homeEdit.element.querySelector("button");
    if (!button) return;
    homeEdit.tippy?.destroy();
    button.removeAttribute("title");
    button.className = [...native.classList].filter(name => name !== "main-globalNav-navLinkActive").join(" ");
    button.setAttribute("data-hazy-settings", "true");
    button.style.transition = getComputedStyle(native).transition;
    button.setAttribute("data-encore-id", "buttonTertiary");
    homeEdit.element.style.display = "inline-flex";
    function SettingsTooltip() {
      const [visible, setVisible] = Spicetify.React.useState(false);
      Spicetify.React.useLayoutEffect(() => { homeEdit.element.firstElementChild?.appendChild(button); }, []);
      return Spicetify.React.createElement(TooltipWrapper,
        { label: "Hazy Settings", placement: "bottom", showDelay: 200, isOpen: visible },
        Spicetify.React.createElement("span", {
          style: { display: "inline-flex" },
          onMouseEnter: () => setVisible(true), onMouseLeave: () => setVisible(false),
          onFocus: () => setVisible(true), onBlur: () => setVisible(false), onClick: () => setVisible(false)
        }));
    }
    Spicetify.ReactDOM.createRoot(homeEdit.element).render(Spicetify.React.createElement(SettingsTooltip));
  }
  matchSettingsControl();
})();
