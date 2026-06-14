(() => {
    const splashStyle = document.createElement("style");
    splashStyle.textContent = `
        html::before {
            content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #0a0a0a; z-index: 999999;
            transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 1;
        }
        html.sr-splash-done::before {
            opacity: 0;
            pointer-events: none;
        }
    `;
    document.documentElement.appendChild(splashStyle);

    const splash = document.createElement("div");
    splash.id = "sr-splash";
    splash.innerHTML = `
        <style>
            #sr-splash {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: #0a0a0a; z-index: 999999;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                opacity: 1;
            }
            #sr-splash .sr-content {
                display: flex; flex-direction: column;
                align-items: center;
                opacity: 0;
                transform: scale(0.85) translateY(10px);
                animation: sr-fadein 1.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
            }
            #sr-splash svg {
                width: 160px; height: 160px;
                animation: sr-pulse 2.5s ease-in-out infinite;
                filter: drop-shadow(0 0 40px rgba(29, 185, 84, 0.25));
            }
            #sr-splash .sr-dots {
                display: flex; gap: 12px; margin-top: 40px;
            }
            #sr-splash .sr-dot {
                width: 8px; height: 8px; border-radius: 50%;
                background: rgba(255, 255, 255, 0.35);
                animation: sr-bounce 1.6s ease-in-out infinite;
            }
            #sr-splash .sr-dot:nth-child(2) { animation-delay: 0.2s; }
            #sr-splash .sr-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes sr-fadein {
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes sr-pulse {
                0%, 100% { transform: scale(1); opacity: 0.85; }
                50% { transform: scale(1.05); opacity: 1; }
            }
            @keyframes sr-bounce {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
                40% { transform: translateY(-10px); opacity: 0.9; }
            }
        </style>
        <div class="sr-content">
            <svg viewBox="0 0 24 24" fill="#1DB954">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            <div class="sr-dots">
                <div class="sr-dot"></div>
                <div class="sr-dot"></div>
                <div class="sr-dot"></div>
            </div>
        </div>
    `;
    document.documentElement.appendChild(splash);
    setTimeout(() => {
        splash.style.opacity = "0";
        document.documentElement.classList.add("sr-splash-done");
        setTimeout(() => { splash.remove(); splashStyle.remove(); }, 800);
    }, 3000);

    if (localStorage.getItem("brightAmount") === null) {
        localStorage.setItem("brightAmount", "50");
    }
    // Hazy theme engine (bundled locally for performance)
    (function hazy(){if(!Spicetify?.Platform||!Spicetify?.Platform?.History?.listen){setTimeout(hazy,100);return}const defImage="https://i.imgur.com/Wl2D0h0.png";let startImage=localStorage.getItem("hazy:startupBg")||defImage;const toggleInfo=[{id:"UseCustomBackground",name:"Custom background",defVal:false},{id:"UseCustomColor",name:"Custom color",defVal:false},{id:"HideNowPlayingSidebar",name:"Hide now playing sidebar",defVal:false}];const toggles={UseCustomBackground:false,UseCustomColor:false,HideNowPlayingSidebar:false};const sliders=[{id:"blur",name:"Blur",min:0,max:50,step:1,defVal:15,end:"px"},{id:"cont",name:"Contrast",min:0,max:200,step:2,defVal:50},{id:"satu",name:"Saturation",min:0,max:200,step:2,defVal:70},{id:"bright",name:"Brightness",min:0,max:200,step:2,defVal:120}];(function sidebar(){if(localStorage.getItem("Hazy Sidebar Activated"))return;const parsedObject=JSON.parse(localStorage.getItem("spicetify-exp-features"));let reload=false;const features=["enableYLXSidebar","enableRightSidebar","enableRightSidebarTransitionAnimations","enableRightSidebarLyrics","enableRightSidebarExtractedColors","enablePanelSizeCoordination"];for(const feature of features){if(!parsedObject?.[feature])continue;if(!parsedObject?.[feature]?.value){parsedObject[feature].value=true;reload=true}}localStorage.setItem("spicetify-exp-features",JSON.stringify(parsedObject));localStorage.setItem("Hazy Sidebar Activated",true);if(reload){window.location.reload();reload=false}})();function loadSliders(){sliders.forEach(opt=>{const val=localStorage.getItem(`${opt.id}Amount`)||opt.defVal;document.documentElement.style.setProperty(`--${opt.id}`,`${val}${opt.end||"%"}`)})}function setAccentColor(color){const root=document.documentElement.style;root.setProperty("--spice-button",color);root.setProperty("--spice-button-active",color);root.setProperty("--spice-accent",color)}async function fetchFadeTime(){try{const response=await Spicetify.Platform.PlayerAPI._prefs.get({key:"audio.crossfade_v2"});if(!response.entries["audio.crossfade_v2"].bool){document.documentElement.style.setProperty("--fade-time","0.4s");return}const fadeTimeResponse=await Spicetify.Platform.PlayerAPI._prefs.get({key:"audio.crossfade.time_v2"});const fadeTime=fadeTimeResponse.entries["audio.crossfade.time_v2"].number;document.documentElement.style.setProperty("--fade-time",`${fadeTime/1000}s`)}catch(error){document.documentElement.style.setProperty("--fade-time","0.4s")}}function getCurrentBackground(replace){let url=Spicetify?.Player?.data?.item?.metadata?.image_url;if(toggles.UseCustomBackground||!url||!URL.canParse(url))return startImage;if(replace)url=url.replace("spotify:image:","https://i.scdn.co/image/");return url}const _colorCacheKeys=[];const _colorCache={};const _COLOR_CACHE_MAX=50;const _canvas=document.createElement("canvas");_canvas.width=50;_canvas.height=50;const _ctx=_canvas.getContext("2d",{willReadFrequently:true});let _fadeTimeFetched=false;async function onSongChange(){if(!_fadeTimeFetched){_fadeTimeFetched=true;fetchFadeTime()}const album_uri=Spicetify?.Player?.data?.item?.metadata?.album_uri;if(album_uri!==undefined&&!album_uri.includes("spotify:show")){}else if(Spicetify?.Player?.data?.item?.uri?.includes("spotify:episode")){}else if(Spicetify?.Player?.data?.item?.isLocal){}else if(Spicetify?.Player?.data?.item?.provider==="ad"){return}else{setTimeout(onSongChange,200)}updateLyricsPageProperties();if(!toggles.UseCustomColor){const imgSrc=getCurrentBackground(true);if(_colorCache[imgSrc]){setAccentColor(_colorCache[imgSrc])}else{const img=new Image();img.crossOrigin="Anonymous";img.onload=function(){_ctx.clearRect(0,0,50,50);_ctx.drawImage(img,0,0,50,50);const imageData=_ctx.getImageData(0,0,50,50).data;const rgbList=[];for(let i=0;i<imageData.length;i+=4)rgbList.push({r:imageData[i],g:imageData[i+1],b:imageData[i+2]});let hexColor=findColor(rgbList);if(!hexColor)hexColor=findColor(rgbList,true);if(_colorCacheKeys.length>=_COLOR_CACHE_MAX){const oldest=_colorCacheKeys.shift();delete _colorCache[oldest]}_colorCacheKeys.push(imgSrc);_colorCache[imgSrc]=hexColor;setAccentColor(hexColor);img.onload=null;img.src=""};img.src=imgSrc}}else{setAccentColor(localStorage.getItem("CustomColor")||"#ffc0ea")}document.documentElement.style.setProperty("--image_url",`url("${getCurrentBackground(false)}")`)}function findColor(rgbList,skipFilters=false){const colorCount={};let maxColor="";let maxCount=0;for(let i=0;i<rgbList.length;i++){if(!skipFilters&&(isTooDark(rgbList[i])||isTooCloseToWhite(rgbList[i])))continue;const color=`${rgbList[i].r},${rgbList[i].g},${rgbList[i].b}`;colorCount[color]=(colorCount[color]||0)+1;if(colorCount[color]>maxCount){maxColor=color;maxCount=colorCount[color]}}return maxColor?rgbToHex(...maxColor.split(",").map(Number)):null}function rgbToHex(r,g,b){return"#"+[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("")}function isTooDark(rgb){return(0.299*rgb.r+0.587*rgb.g+0.114*rgb.b)<100}function isTooCloseToWhite(rgb){return rgb.r>200&&rgb.g>200&&rgb.b>200}loadSliders();loadToggles();Spicetify.Player.addEventListener("songchange",onSongChange);if(window.navigator.userAgent.indexOf("Win")!==-1)document.body.classList.add("windows");galaxyFade();function scrollToTop(){const element=document.querySelector(".main-entityHeader-container");element.scrollIntoView({behavior:"smooth",block:"start"})}document.addEventListener("click",event=>{if(event.target.closest(".main-entityHeader-topbarTitle"))scrollToTop()});function updateZoomVariable(){let prevOuterWidth=window.outerWidth;let prevInnerWidth=window.innerWidth;let prevRatio=window.devicePixelRatio;function calculateAndApplyZoom(){const newOuterWidth=window.outerWidth;const newInnerWidth=window.innerWidth;const newRatio=window.devicePixelRatio;if(prevOuterWidth<=160||prevRatio!==newRatio||prevOuterWidth!==newOuterWidth||prevInnerWidth!==newInnerWidth){const zoomFactor=newOuterWidth/newInnerWidth||1;document.documentElement.style.setProperty("--zoom",zoomFactor);prevOuterWidth=newOuterWidth;prevInnerWidth=newInnerWidth;prevRatio=newRatio}}calculateAndApplyZoom();window.addEventListener("resize",calculateAndApplyZoom)}updateZoomVariable();function waitForElement(elements,func,timeout=100){const queries=elements.map(element=>document.querySelector(element));if(queries.every(a=>a)){func(queries)}else if(timeout>0){setTimeout(waitForElement,300,elements,func,timeout-1)}}waitForElement([".Root__globalNav"],element=>{const isCenteredGlobalNav=Spicetify.Platform.version>="1.2.46.462";let addedClass="control-nav";if(element?.[0]?.classList.contains("Root__globalNav"))addedClass=isCenteredGlobalNav?"global-nav-centered":"global-nav";document.body.classList.add(addedClass)},10000);Spicetify.Platform.History.listen(updateLyricsPageProperties);waitForElement([".Root__lyrics-cinema"],([lyricsCinema])=>{const lyricsCinemaObserver=new MutationObserver(updateLyricsPageProperties);lyricsCinemaObserver.observe(lyricsCinema,{attributes:true,attributeFilter:["class"]})});waitForElement([".main-view-container"],([mainViewContainer])=>{const mainViewContainerResizeObserver=new ResizeObserver(updateLyricsPageProperties);mainViewContainerResizeObserver.observe(mainViewContainer)});let _lyricsTimer=null;function updateLyricsPageProperties(){if(_lyricsTimer)return;_lyricsTimer=requestAnimationFrame(()=>{_lyricsTimer=null;_updateLyricsPagePropertiesImpl()});}function _updateLyricsPagePropertiesImpl(){function setLyricsPageProperties(){function calculateLyricsMaxWidth(lyricsContentWrapper){const lyricsContentContainer=lyricsContentWrapper.parentElement;const marginLeft=Number.parseInt(window.getComputedStyle(lyricsContentWrapper).marginLeft,10);const totalOffset=lyricsContentWrapper.offsetLeft+marginLeft;return Math.round(0.95*(lyricsContentContainer.clientWidth-totalOffset))}waitForElement([".lyrics-lyrics-contentWrapper"],([lyricsContentWrapper])=>{lyricsContentWrapper.style.maxWidth="";lyricsContentWrapper.style.width="";const lyric=document.querySelector(".lyrics-lyricsContent-lyric")?.[2];if(lyric)document.documentElement.style.setProperty("--lyrics-text-direction",/[֑-߿]/.test(lyric.innerText)?"right":"left");document.documentElement.style.setProperty("--lyrics-active-max-width",`${calculateLyricsMaxWidth(lyricsContentWrapper)}px`);const lyricsWrapperWidth=lyricsContentWrapper.getBoundingClientRect().width;lyricsContentWrapper.style.maxWidth=`${lyricsWrapperWidth}px`;lyricsContentWrapper.style.width=`${lyricsWrapperWidth}px`})}function lyricsCallback(mutationsList,lyricsObserver){for(const mutation of mutationsList)for(const addedNode of mutation.addedNodes)if(addedNode.classList?.contains("lyrics-lyricsContent-provider"))setLyricsPageProperties();lyricsObserver.disconnect}waitForElement([".lyrics-lyricsContent-provider"],([lyricsContentProvider])=>{setLyricsPageProperties();const lyricsObserver=new MutationObserver(lyricsCallback);lyricsObserver.observe(lyricsContentProvider.parentElement,{childList:true})})}function setFadeDirection(scrollNode){let fadeDirection="full";if(scrollNode.scrollTop===0){fadeDirection="bottom"}else if(scrollNode.scrollHeight-scrollNode.scrollTop-scrollNode.clientHeight===0){fadeDirection="top"}scrollNode.setAttribute("fade",fadeDirection)}function galaxyFade(){const setupFade=(selector,onScrollCallback)=>{waitForElement([selector],([scrollNode])=>{let ticking=false;scrollNode.addEventListener("scroll",()=>{if(!ticking){window.requestAnimationFrame(()=>{onScrollCallback(scrollNode);ticking=false});ticking=true}},{passive:true});onScrollCallback(scrollNode)})};const applyArtistFade=scrollNode=>{const scrollValue=scrollNode.scrollTop;const fadeValue=Math.max(0,(-0.3*scrollValue+100)/100);document.documentElement.style.setProperty("--artist-fade",fadeValue)};setupFade(".Root__main-view [data-overlayscrollbars-viewport]",scrollNode=>{applyArtistFade(scrollNode);setFadeDirection(scrollNode)});setupFade(".Root__nav-bar [data-overlayscrollbars-viewport]",scrollNode=>{scrollNode.setAttribute("fade","bottom");setFadeDirection(scrollNode)});setupFade(".Root__right-sidebar [data-overlayscrollbars-viewport]",scrollNode=>{scrollNode.setAttribute("fade","bottom");setFadeDirection(scrollNode)})}function loadToggles(){toggles.UseCustomBackground=JSON.parse(localStorage.getItem("UseCustomBackground"));toggles.UseCustomColor=JSON.parse(localStorage.getItem("UseCustomColor"));toggles.HideNowPlayingSidebar=JSON.parse(localStorage.getItem("HideNowPlayingSidebar"));if(toggles.HideNowPlayingSidebar){document.body.classList.add("__hazy_hidenowplayingsidebar")}else{document.body.classList.remove("__hazy_hidenowplayingsidebar")}onSongChange()}const homeEdit=new Spicetify.Topbar.Button("Hazy Settings","edit",()=>{const content=document.createElement("div");content.innerHTML=`<div class="main-playlistEditDetailsModal-albumCover" id="home-select"><div class="main-entityHeader-image" draggable="false"><img aria-hidden="false" draggable="false" loading="eager" class="main-image-image main-entityHeader-image main-entityHeader-shadow"></div><div class="main-playlistEditDetailsModal-imageChangeButton"><div class="main-editImage-buttonContainer"></div></div></div>`;function createToggle(opt){let{id,name,defVal}=opt;const toggleRow=document.createElement("div");toggleRow.classList.add("hazyOptionRow");toggleRow.innerHTML=`<span class="hazyOptionDesc">${name}:</span><button class="hazyOptionToggle"><span class="toggleWrapper"><span class="toggle"></span></span></button>`;toggleRow.setAttribute("name",id);toggleRow.querySelector("button").addEventListener("click",()=>toggleRow.querySelector(".toggle").classList.toggle("enabled"));const isEnabled=JSON.parse(localStorage.getItem(id))??defVal;toggleRow.querySelector(".toggle").classList.toggle("enabled",isEnabled);content.append(toggleRow)}function createSlider(opt){let{id,name,min,max,step,defVal,end}=opt;const val=localStorage.getItem(`${id}Amount`)||defVal;const slider=document.createElement("div");slider.classList.add("hazyOptionRow");slider.innerHTML=`<div class="slider-container"><label for="${id}-input">${name}:</label><input class="slider" id="${id}-input" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><div class="slider-value"><p id="${id}-value" contenteditable="true">${val}${end||"%"}</p></div></div>`;slider.querySelector(`#${id}-value`).addEventListener("input",()=>{let content=slider.querySelector(`#${id}-value`).textContent.trim();const number=Number.parseInt(content);if(content.length>3){content=slider.querySelector(`#${id}-value`).textContent=content.slice(0,3)}slider.querySelector(`#${id}-input`).value=number});slider.querySelector(`#${id}-input`).addEventListener("input",()=>{slider.querySelector(`#${id}-value`).textContent=`${slider.querySelector(`#${id}-input`).value}${opt.end||"%"}`});content.append(slider)}const srcInput=document.createElement("input");srcInput.type="text";srcInput.classList.add("main-playlistEditDetailsModal-textElement","main-playlistEditDetailsModal-titleInput");srcInput.id="src-input";srcInput.placeholder="Background image URL";if(!startImage.startsWith("data:image")){srcInput.value=startImage}content.append(srcInput);toggleInfo.forEach(createToggle);const colorRow=document.createElement("div");colorRow.classList.add("hazyOptionRow");const colorLabel=document.createElement("label");colorLabel.id="color-label";colorLabel.htmlFor="color";colorLabel.textContent="Color:";colorLabel.style.textAlign="right";colorLabel.style.marginRight="10px";colorLabel.style.fontSize="0.875rem";colorRow.append(colorLabel);const colorInput=document.createElement("input");colorInput.type="color";colorInput.id="color-input";colorInput.value=localStorage.getItem("CustomColor")||"#30bf63";colorInput.style.border="none";colorRow.append(colorInput);content.append(colorRow);sliders.forEach(createSlider);loadSliders();const img=content.querySelector("img");img.src=localStorage.getItem("hazy:startupBg")||defImage;srcInput.addEventListener("input",()=>{img.src=srcInput.value});const buttonsRow=document.createElement("div");buttonsRow.style.display="flex";buttonsRow.style.paddingTop="15px";buttonsRow.style.alignItems="flex-end";const resetButton=document.createElement("button");resetButton.id="value-reset";resetButton.innerHTML="Reset";const saveButton=document.createElement("button");saveButton.id="home-save";saveButton.innerHTML="Apply";saveButton.onclick=async()=>{let invalidImage=false;try{await fetch(srcInput.value,{mode:"no-cors"})}catch(error){invalidImage=true}if(!srcInput.value||!URL.canParse(srcInput.value)||invalidImage){saveButton.innerHTML="Invalid image";saveButton.classList.add("applyfailed");saveButton.disabled=true;setTimeout(()=>{saveButton.innerHTML="Apply";saveButton.classList.remove("applyfailed");saveButton.disabled=false},3000);return}saveButton.innerHTML="Applied!";saveButton.classList.add("applied");saveButton.disabled=true;setTimeout(()=>{saveButton.innerHTML="Apply";saveButton.classList.remove("applied");saveButton.disabled=false},1000);startImage=srcInput.value||content.querySelector("img").src;localStorage.setItem("hazy:startupBg",startImage);localStorage.setItem("CustomColor",document.getElementById("color-input").value);toggleInfo.forEach(opt=>localStorage.setItem(opt.id,document.querySelector(`.hazyOptionRow[name=${opt.id}] .toggle`).classList.contains("enabled")));sliders.forEach(opt=>localStorage.setItem(opt.id+"Amount",document.querySelector(`.hazyOptionRow #${opt.id}-input`).value));loadSliders();loadToggles()};resetButton.onclick=()=>{sliders.forEach(opt=>{document.querySelector(`.hazyOptionRow #${opt.id}-input`).value=opt.defVal;document.querySelector(`.hazyOptionRow #${opt.id}-value`).textContent=`${opt.defVal}${opt.end||"%"}`});toggleInfo.forEach(opt=>{document.querySelector(`.hazyOptionRow[name=${opt.id}] .toggle`).classList.toggle("enabled",opt.defVal)});document.getElementById("src-input").value=defImage;img.src=defImage;document.getElementById("color-input").value="#30bf63"};const issueButton=document.createElement("a");issueButton.classList.add("issue-button");issueButton.innerHTML="Report Issue";issueButton.href="https://github.com/Astromations/Hazy/issues";buttonsRow.append(issueButton,resetButton,saveButton);content.append(buttonsRow);Spicetify.PopupModal.display({title:"Hazy Settings",content})});homeEdit.element.classList.toggle("hidden",false)})();

    function setupLyricsRedirect() {
        if (!Spicetify?.Platform?.History) {
            setTimeout(setupLyricsRedirect, 300);
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
                if (el.dataset.srHidden) return;
                const svg = el.querySelector('path[d*="M13.426"]');
                if (svg) {
                    el.parentElement.style.display = "none";
                    el.dataset.srHidden = "true";
                }
            });
        };

        redirectLyricsButton();
        hideNavLink();
        let _mutTimer = null;
        new MutationObserver(() => {
            if (_mutTimer) return;
            _mutTimer = requestAnimationFrame(() => {
                _mutTimer = null;
                redirectLyricsButton();
                hideNavLink();
            });
        }).observe(document.body, { childList: true, subtree: true });
    }
    setupLyricsRedirect();
})();