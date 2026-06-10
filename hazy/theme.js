(() => {
    const splashStyle = document.createElement("style");
    splashStyle.textContent = `
        html::before {
            content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #0a0a0a; z-index: 999999;
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
                transition: opacity 2s cubic-bezier(0.4, 0, 0.2, 1);
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
        setTimeout(() => { splash.remove(); splashStyle.remove(); }, 2000);
    }, 3000);

    if (localStorage.getItem("brightAmount") === null) {
        localStorage.setItem("brightAmount", "50");
    }
    const script = document.createElement("SCRIPT");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", "https://cdn.jsdelivr.net/gh/astromations/hazy/hazy.js");
    document.head.appendChild(script);

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
                if (el.innerHTML.includes("M13.426")) {
                    el.parentElement.style.display = "none";
                }
            });
        };

        redirectLyricsButton();
        hideNavLink();
        new MutationObserver(() => {
            redirectLyricsButton();
            hideNavLink();
        }).observe(document.body, { childList: true, subtree: true });
    }
    setupLyricsRedirect();
})();