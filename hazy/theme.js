(() => {
    if (localStorage.getItem("brightAmount") === null) {
        localStorage.setItem("brightAmount", "50");
    }
    const script = document.createElement("SCRIPT");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", "https://cdn.jsdelivr.net/gh/astromations/hazy/hazy.js");
    document.head.appendChild(script);
})();