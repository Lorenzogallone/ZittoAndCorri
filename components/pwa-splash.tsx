"use client";

import { useLayoutEffect } from "react";

// Splash PWA pre-hydration: arriva con l'HTML del server (CSS+markup+script
// inline) così appare appena la risposta viene parsata, prima del JS. Lo script
// lo toglie subito fuori dalla PWA o se è già stato mostrato in questa sessione.
//
// L'omino dell'icona corre sul posto (180 passi al minuto) davanti a un sole
// nel colore principale, con la pista che scorre e lo sfondo a puntini in
// parallasse. I colori sono le variabili del tema, già impostate dallo script
// del tema che nel layout viene prima: chiaro/scuro e accento scelti dall'utente.
// La figura è disegnata verso destra e poi specchiata, come nell'icona.
const PWA_SPLASH_HTML = `
<style>
  #pwa-splash{display:none}
  @media (display-mode: standalone){#pwa-splash{display:flex}}
  #pwa-splash{--ps-bg:var(--background,#fbfaf9);--ps-fg:var(--foreground,#1c1c21);--ps-muted:var(--muted-foreground,#8b8b94);--ps-accent:var(--primary,#e8765a);position:fixed;inset:0;z-index:99999;flex-direction:column;align-items:center;justify-content:center;gap:22px;overflow:hidden;background:var(--ps-bg);color:var(--ps-fg);font-family:var(--font-inter),system-ui,-apple-system,sans-serif;transition:opacity .45s ease}
  #pwa-splash::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,color-mix(in oklab,var(--ps-fg) 13%,transparent) 1px,transparent 1.5px);background-size:22px 22px;-webkit-mask-image:radial-gradient(ellipse 75% 50% at 50% 44%,#000 0%,transparent 72%);mask-image:radial-gradient(ellipse 75% 50% at 50% 44%,#000 0%,transparent 72%);animation:ps-drift 2.6s linear infinite}
  #pwa-splash .ps-stage{position:relative;display:flex;align-items:center;justify-content:center;width:264px;height:175px;animation:ps-in .8s cubic-bezier(.2,.8,.2,1) backwards}
  #pwa-splash .ps-glow{position:absolute;left:50%;top:56%;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;background:radial-gradient(circle,color-mix(in oklab,var(--ps-accent) 22%,transparent) 0%,transparent 62%);animation:ps-breathe 3.2s ease-in-out infinite}
  #pwa-splash svg{position:relative;overflow:visible;transform:scaleX(-1)}
  #pwa-splash .ps-sun-a{stop-color:var(--ps-accent);stop-opacity:.34}
  #pwa-splash .ps-sun-b{stop-color:var(--ps-accent);stop-opacity:.05}
  #pwa-splash .ps-fade-a{stop-color:var(--ps-fg);stop-opacity:0}
  #pwa-splash .ps-fade-b{stop-color:var(--ps-fg);stop-opacity:.45}
  #pwa-splash .ps-ground{animation:ps-ground .124s linear infinite}
  #pwa-splash .ps-streak{stroke:var(--ps-accent);stroke-width:2;stroke-linecap:round;opacity:0;animation:ps-streak .9s ease-out infinite}
  #pwa-splash .ps-streak:nth-child(2){animation-delay:-.3s}
  #pwa-splash .ps-streak:nth-child(3){animation-delay:-.6s}
  #pwa-splash .ps-body{animation:ps-bob .33s linear infinite}
  #pwa-splash .ps-far{opacity:.32}
  #pwa-splash .ps-shadow{fill:var(--ps-fg);opacity:.12;transform-box:fill-box;transform-origin:center;animation:ps-shadow .33s ease-in-out infinite}
  #pwa-splash .ps-j{transform-box:view-box}
  #pwa-splash .ps-thigh{transform-origin:48px 57px;animation:ps-thigh .66s linear infinite}
  #pwa-splash .ps-shin{transform-origin:48px 79.5px;animation:ps-shin .66s linear infinite}
  #pwa-splash .ps-upper{transform-origin:53.9px 37.9px;animation:ps-upper .66s cubic-bezier(.45,0,.55,1) infinite}
  #pwa-splash .ps-fore{transform-origin:53.9px 51.9px;animation:ps-fore .66s cubic-bezier(.45,0,.55,1) infinite}
  #pwa-splash .ps-b,#pwa-splash .ps-b .ps-j{animation-delay:-.33s}
  #pwa-splash .ps-node{fill:var(--ps-accent);stroke:var(--ps-bg);stroke-width:1.3;paint-order:stroke}
  #pwa-splash .ps-node circle{transform-box:fill-box;transform-origin:center;animation:ps-pulse 1.6s ease-in-out infinite}
  #pwa-splash .ps-node circle:nth-of-type(2){animation-delay:-1.2s}
  #pwa-splash .ps-node circle:nth-of-type(3){animation-delay:-.8s}
  #pwa-splash .ps-node circle:nth-of-type(4){animation-delay:-.4s}
  #pwa-splash .ps-link{stroke:var(--ps-accent);stroke-width:1.5;stroke-linecap:round}
  #pwa-splash .ps-text{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;animation:ps-in .8s .12s cubic-bezier(.2,.8,.2,1) backwards}
  #pwa-splash h1{margin:0;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.035em;text-align:center}
  #pwa-splash h1 span{color:var(--ps-accent)}
  #pwa-splash p{margin:0;font-size:13px;font-weight:500;color:var(--ps-muted);text-align:center}
  @keyframes ps-in{from{opacity:0;transform:translateY(12px) scale(.97)}}
  @keyframes ps-drift{to{background-position:22px 0}}
  @keyframes ps-breathe{0%,100%{opacity:.7;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}
  @keyframes ps-ground{to{stroke-dashoffset:12}}
  @keyframes ps-streak{0%{opacity:0;transform:translateX(6px)}25%{opacity:.75}100%{opacity:0;transform:translateX(-18px)}}
  @keyframes ps-bob{0%{transform:translateY(-0.57px)}8.33%{transform:translateY(-0.15px)}16.67%{transform:translateY(0.31px)}25%{transform:translateY(0.69px)}33.33%{transform:translateY(0.89px)}41.67%{transform:translateY(0.84px)}50%{transform:translateY(0.57px)}58.33%{transform:translateY(0.15px)}66.67%{transform:translateY(-0.31px)}75%{transform:translateY(-0.69px)}83.33%{transform:translateY(-0.89px)}91.67%{transform:translateY(-0.84px)}100%{transform:translateY(-0.57px)}}
  @keyframes ps-thigh{0%{transform:rotate(-25.1deg)}4.17%{transform:rotate(-25.9deg)}8.33%{transform:rotate(-25.3deg)}12.5%{transform:rotate(-23.4deg)}16.67%{transform:rotate(-20.1deg)}20.83%{transform:rotate(-15.5deg)}25%{transform:rotate(-9.6deg)}29.17%{transform:rotate(-2.3deg)}33.33%{transform:rotate(7.6deg)}37.5%{transform:rotate(10.5deg)}41.67%{transform:rotate(2.4deg)}45.83%{transform:rotate(-1.1deg)}50%{transform:rotate(-5.5deg)}54.17%{transform:rotate(-9.9deg)}58.33%{transform:rotate(-15.5deg)}62.5%{transform:rotate(-26.3deg)}66.67%{transform:rotate(-43.9deg)}70.83%{transform:rotate(-61.7deg)}75%{transform:rotate(-73.6deg)}79.17%{transform:rotate(-78.6deg)}83.33%{transform:rotate(-77.2deg)}87.5%{transform:rotate(-69.9deg)}91.67%{transform:rotate(-58.4deg)}95.83%{transform:rotate(-44.3deg)}100%{transform:rotate(-25.1deg)}}
  @keyframes ps-shin{0%{transform:rotate(26.5deg)}4.17%{transform:rotate(35.4deg)}8.33%{transform:rotate(41.7deg)}12.5%{transform:rotate(45.5deg)}16.67%{transform:rotate(46.7deg)}20.83%{transform:rotate(45.0deg)}25%{transform:rotate(40.4deg)}29.17%{transform:rotate(32.4deg)}33.33%{transform:rotate(18.9deg)}37.5%{transform:rotate(19.4deg)}41.67%{transform:rotate(48.1deg)}45.83%{transform:rotate(68.7deg)}50%{transform:rotate(85.9deg)}54.17%{transform:rotate(103.0deg)}58.33%{transform:rotate(117.3deg)}62.5%{transform:rotate(127.8deg)}66.67%{transform:rotate(134.1deg)}70.83%{transform:rotate(133.6deg)}75%{transform:rotate(127.2deg)}79.17%{transform:rotate(115.3deg)}83.33%{transform:rotate(101.6deg)}87.5%{transform:rotate(87.4deg)}91.67%{transform:rotate(73.1deg)}95.83%{transform:rotate(54.4deg)}100%{transform:rotate(26.5deg)}}
  @keyframes ps-upper{0%,100%{transform:rotate(40deg)}50%{transform:rotate(-40deg)}}
  @keyframes ps-fore{0%,100%{transform:rotate(-62deg)}50%{transform:rotate(-102deg)}}
  @keyframes ps-shadow{0%,100%{transform:scaleX(.88)}36%{transform:scaleX(1)}86%{transform:scaleX(.8)}}
  @keyframes ps-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}
  @media (prefers-reduced-motion: reduce){#pwa-splash::before,#pwa-splash *{animation-play-state:paused!important}#pwa-splash .ps-stage,#pwa-splash .ps-text{animation:none!important}}
</style>
<div id="pwa-splash" aria-hidden="true">
  <div class="ps-stage">
    <div class="ps-glow"></div>
    <svg width="264" height="175" viewBox="-30 -2 160 106">
      <defs>
        <linearGradient id="ps-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ps-sun-a"/><stop offset="1" class="ps-sun-b"/></linearGradient>
        <linearGradient id="ps-fade" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="130" y2="0"><stop offset="0" class="ps-fade-a"/><stop offset=".3" class="ps-fade-b"/><stop offset=".7" class="ps-fade-b"/><stop offset="1" class="ps-fade-a"/></linearGradient>
      </defs>
      <circle cx="50" cy="63" r="38.6" fill="url(#ps-sun)"/>
      <line class="ps-ground" x1="-30" y1="101.6" x2="130" y2="101.6" stroke="url(#ps-fade)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="7 5"/>
      <g><line class="ps-streak" x1="16" y1="42" x2="30" y2="42"/><line class="ps-streak" x1="8" y1="55" x2="26" y2="55"/><line class="ps-streak" x1="14" y1="68" x2="27" y2="68"/></g>
      <ellipse class="ps-shadow" cx="48" cy="101.8" rx="15" ry="1.8"/>
      <g class="ps-body" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <g class="ps-far">
          <g class="ps-j ps-upper ps-b"><line x1="53.9" y1="37.9" x2="53.9" y2="51.9" stroke-width="6.5"/><g class="ps-j ps-fore"><line x1="53.9" y1="51.9" x2="53.9" y2="64.2" stroke-width="5.5"/></g></g>
          <g class="ps-j ps-thigh ps-b"><line x1="48" y1="57" x2="48" y2="79.5" stroke-width="10"/><g class="ps-j ps-shin"><path d="M48 79.5 L48 100.5 L54 100.5" stroke-width="7"/></g></g>
        </g>
        <line x1="48" y1="56" x2="54.6" y2="35.6" stroke-width="13.5"/>
        <circle cx="58.4" cy="22.6" r="6.8" fill="currentColor" stroke="none"/>
        <g class="ps-j ps-thigh"><line x1="48" y1="57" x2="48" y2="79.5" stroke-width="10"/><g class="ps-j ps-shin"><path d="M48 79.5 L48 100.5 L54 100.5" stroke-width="7"/></g></g>
        <g class="ps-j ps-upper"><line x1="53.9" y1="37.9" x2="53.9" y2="51.9" stroke-width="6.5"/><g class="ps-j ps-fore"><line x1="53.9" y1="51.9" x2="53.9" y2="64.2" stroke-width="5.5"/></g></g>
        <g transform="translate(41 29.5)">
          <path class="ps-link" d="M-6.5 -5.5 L6.5 5.5 M6.5 -5.5 L-6.5 5.5"/>
          <g class="ps-node"><circle r="3.7"/><circle cx="-6.5" cy="-5.5" r="2.5"/><circle cx="6.5" cy="-5.5" r="2.5"/><circle cx="-6.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="5.5" r="2.5"/></g>
        </g>
      </g>
    </svg>
  </div>
  <div class="ps-text">
    <h1>Zitto e <span>Corri</span></h1>
    <p>Il tuo coach di corsa personale</p>
  </div>
</div>
<script>(function(){try{window.__zcSplashAt=Date.now();var s=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!s||sessionStorage.getItem("pwa-splash-shown")){var e=document.getElementById("pwa-splash");if(e)e.remove();}}catch(err){}try{setTimeout(function(){var e=document.getElementById("pwa-splash");if(e){e.style.opacity="0";e.style.pointerEvents="none";setTimeout(function(){if(e&&e.parentNode)e.parentNode.removeChild(e);},450);}},6000);}catch(err){}})();</script>
`;

// Oggetto stabile a livello di modulo: React 19 confronta le prop per identità
// e, con un oggetto nuovo, riscrive innerHTML. Quando il markup stava nel layout
// server, ogni server action (es. elimina obiettivo) o router.refresh() mandava
// un layout nuovo → lo splash veniva reinserito e, senza più script a
// toglierlo, restava sopra l'app con la barra di caricamento all'infinito.
const SPLASH_MARKUP = { __html: PWA_SPLASH_HTML };

// Tempo minimo a schermo dalla comparsa: se l'app si idrata subito, l'omino fa
// comunque qualche passo invece di lampeggiare.
const MIN_VISIBLE_MS = 900;

function removeSplash(el: HTMLElement) {
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  setTimeout(() => el.remove(), 450);
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
    const since = (window as { __zcSplashAt?: number }).__zcSplashAt;
    const elapsed = since ? Date.now() - since : 0;
    const timer = setTimeout(() => removeSplash(el), Math.max(350, MIN_VISIBLE_MS - elapsed));
    return () => clearTimeout(timer);
  }, []);

  return <div id="pwa-splash-root" suppressHydrationWarning dangerouslySetInnerHTML={SPLASH_MARKUP} />;
}
