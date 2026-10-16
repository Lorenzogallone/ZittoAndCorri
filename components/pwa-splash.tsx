"use client";

import { useLayoutEffect } from "react";

// Splash PWA pre-hydration: arriva con l'HTML del server (CSS+markup+script
// inline) così appare appena la risposta viene parsata, prima del JS. Lo script
// lo toglie subito fuori dalla PWA o se è già stato mostrato in questa sessione.
const PWA_SPLASH_HTML = `
<style>
  #pwa-splash{display:none}
  @media (display-mode: standalone){
    #pwa-splash{display:flex;position:fixed;inset:0;z-index:99999;flex-direction:column;align-items:center;justify-content:center;gap:28px;background:#fbfaf9;transition:opacity .4s ease}
    @media (prefers-color-scheme: dark){#pwa-splash{background:#0d0d0f}}
    #pwa-splash .ps-stage{position:relative;display:flex;align-items:center;justify-content:center}
    #pwa-splash .ps-glow{position:absolute;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle, rgba(232,118,90,.30) 0%, rgba(232,118,90,0) 70%);animation:ps-breathe 3s ease-in-out infinite}
    #pwa-splash .ps-icon{position:relative;display:flex;align-items:center;justify-content:center;width:92px;height:92px;border-radius:28px;color:#fff;background:linear-gradient(145deg,#f29078,#e8765a 55%,#d85f44);box-shadow:0 14px 32px -10px rgba(232,118,90,.6);animation:ps-float 3s ease-in-out infinite}
    #pwa-splash .ps-text{display:flex;flex-direction:column;align-items:center;gap:6px}
    #pwa-splash h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#1c1c21;text-align:center;font-family:var(--font-inter),system-ui,sans-serif}
    #pwa-splash p{margin:0;font-size:12.5px;font-weight:500;letter-spacing:.01em;color:#8b8b94;text-align:center;font-family:var(--font-inter),system-ui,sans-serif}
    @media (prefers-color-scheme: dark){#pwa-splash h1{color:#f4f4f5}}
    #pwa-splash .ps-track{position:relative;width:140px;height:4px;border-radius:9999px;overflow:hidden;background:rgba(139,139,148,.2)}
    #pwa-splash .ps-bar{position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:9999px;background:linear-gradient(90deg,transparent,#e8765a,transparent);animation:ps-load 1.4s infinite ease-in-out}
    @keyframes ps-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    @keyframes ps-breathe{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.06)}}
    @keyframes ps-load{0%{transform:translateX(-120%)}100%{transform:translateX(350%)}}
  }
</style>
<div id="pwa-splash" aria-hidden="true">
  <div class="ps-stage">
    <div class="ps-glow"></div>
    <div class="ps-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    </div>
  </div>
  <div class="ps-text">
    <h1>Zitto e Corri</h1>
    <p>Il tuo coach di corsa personale</p>
  </div>
  <div class="ps-track"><div class="ps-bar"></div></div>
</div>
<script>(function(){try{var s=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!s||sessionStorage.getItem("pwa-splash-shown")){var e=document.getElementById("pwa-splash");if(e)e.remove();}}catch(err){}try{setTimeout(function(){var e=document.getElementById("pwa-splash");if(e){e.style.opacity="0";e.style.pointerEvents="none";setTimeout(function(){if(e&&e.parentNode)e.parentNode.removeChild(e);},400);}},6000);}catch(err){}})();</script>
`;

// Oggetto stabile a livello di modulo: React 19 confronta le prop per identità
// e, con un oggetto nuovo, riscrive innerHTML. Quando il markup stava nel layout
// server, ogni server action (es. elimina obiettivo) o router.refresh() mandava
// un layout nuovo → lo splash veniva reinserito e, senza più script a
// toglierlo, restava sopra l'app con la barra di caricamento all'infinito.
const SPLASH_MARKUP = { __html: PWA_SPLASH_HTML };

function removeSplash(el: HTMLElement) {
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  setTimeout(() => el.remove(), 300);
}

/** Splash della PWA: si dissolve appena l'app è idratata. */
export function PwaSplash() {
  useLayoutEffect(() => {
    const el = document.getElementById("pwa-splash");
    if (!el) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem("pwa-splash-shown") === "true";
      // Segna subito la sessione: se iOS rilancia il documento mentre la
      // dissolvenza è in corso, lo script inline non deve rimostrarla.
      sessionStorage.setItem("pwa-splash-shown", "true");
    } catch {
      // sessionStorage non disponibile: la splash resta comunque temporizzata.
    }
    // Già vista (es. il componente è stato rimontato): via subito, senza flash.
    if (shown) {
      el.remove();
      return;
    }
    // Un attimo visibile dopo l'hydration per evitare un flash, poi dissolve.
    const timer = setTimeout(() => removeSplash(el), 350);
    return () => clearTimeout(timer);
  }, []);

  return <div id="pwa-splash-root" suppressHydrationWarning dangerouslySetInnerHTML={SPLASH_MARKUP} />;
}
