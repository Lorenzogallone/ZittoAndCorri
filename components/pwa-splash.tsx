"use client";

import { useLayoutEffect } from "react";

// Splash PWA pre-hydration: arriva con l'HTML del server (CSS+markup+script
// inline) così appare appena la risposta viene parsata, prima del JS. Lo script
// lo toglie subito fuori dalla PWA o se è già stato mostrato in questa sessione.
//
// L'omino dell'icona corre sul posto (180 passi al minuto, busto inclinato e
// fase di volo come nell'icona) davanti a un sole nel colore principale, con
// la pista che scorre e lo sfondo a puntini in parallasse. I colori sono le variabili del tema, già impostate dallo script
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
  #pwa-splash .ps-ground{animation:ps-ground .107s linear infinite}
  #pwa-splash .ps-streak{stroke:var(--ps-accent);stroke-width:2;stroke-linecap:round;opacity:0;animation:ps-streak .9s ease-out infinite}
  #pwa-splash .ps-streak:nth-child(2){animation-delay:-.3s}
  #pwa-splash .ps-streak:nth-child(3){animation-delay:-.6s}
  #pwa-splash .ps-body{animation:ps-bob .33s linear -.27s infinite}
  #pwa-splash .ps-far{opacity:.5}
  /* Sagoma della gamba e del braccio vicini ripassata nel colore dello sfondo:
     li stacca dal busto come le separazioni bianche dell'icona, senza giunture. */
  #pwa-splash .ps-outline{fill:var(--ps-bg);stroke:var(--ps-bg);stroke-width:2.6;stroke-linejoin:round}
  #pwa-splash .ps-shadow{fill:var(--ps-fg);opacity:.12;transform-box:fill-box;transform-origin:center;animation:ps-shadow .33s linear -.27s infinite}
  #pwa-splash .ps-j{transform-box:view-box}
  #pwa-splash .ps-thigh{transform-origin:48px 57px;animation:ps-thigh .66s linear -.27s infinite}
  #pwa-splash .ps-shin{transform-origin:48px 79.5px;animation:ps-shin .66s linear -.27s infinite}
  #pwa-splash .ps-upper{transform-origin:48.6px 37px;animation:ps-upper .66s linear -.27s infinite}
  #pwa-splash .ps-fore{transform-origin:48.6px 50.5px;animation:ps-fore .66s linear -.27s infinite}
  /* L'altro lato è sfasato di mezzo ciclo. Tutto parte dalla posa in volo
     dell'icona, che resta ferma con il movimento ridotto. */
  #pwa-splash .ps-b,#pwa-splash .ps-b .ps-j{animation-delay:-.6s}
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
  @keyframes ps-bob{0%{transform:translateY(-0.16px)}8.33%{transform:translateY(0.50px)}16.67%{transform:translateY(1.04px)}25%{transform:translateY(1.29px)}33.33%{transform:translateY(1.20px)}41.67%{transform:translateY(0.79px)}50%{transform:translateY(0.16px)}58.33%{transform:translateY(-0.50px)}66.67%{transform:translateY(-1.04px)}75%{transform:translateY(-1.29px)}83.33%{transform:translateY(-1.20px)}91.67%{transform:translateY(-0.79px)}100%{transform:translateY(-0.16px)}}
  @keyframes ps-thigh{0%{transform:rotate(-26.4deg)}4.17%{transform:rotate(-25.8deg)}8.33%{transform:rotate(-23.4deg)}12.5%{transform:rotate(-19.3deg)}16.67%{transform:rotate(-13.5deg)}20.83%{transform:rotate(-5.8deg)}25%{transform:rotate(4.3deg)}29.17%{transform:rotate(9.0deg)}33.33%{transform:rotate(9.2deg)}37.5%{transform:rotate(12.0deg)}41.67%{transform:rotate(11.6deg)}45.83%{transform:rotate(7.9deg)}50%{transform:rotate(2.7deg)}54.17%{transform:rotate(-4.0deg)}58.33%{transform:rotate(-14.0deg)}62.5%{transform:rotate(-28.1deg)}66.67%{transform:rotate(-42.1deg)}70.83%{transform:rotate(-51.5deg)}75%{transform:rotate(-54.8deg)}79.17%{transform:rotate(-52.5deg)}83.33%{transform:rotate(-48.3deg)}87.5%{transform:rotate(-45.1deg)}91.67%{transform:rotate(-42.4deg)}95.83%{transform:rotate(-35.0deg)}100%{transform:rotate(-26.4deg)}}
  @keyframes ps-shin{0%{transform:rotate(37.4deg)}4.17%{transform:rotate(44.9deg)}8.33%{transform:rotate(49.1deg)}12.5%{transform:rotate(49.9deg)}16.67%{transform:rotate(46.9deg)}20.83%{transform:rotate(39.7deg)}25%{transform:rotate(26.6deg)}29.17%{transform:rotate(24.9deg)}33.33%{transform:rotate(38.3deg)}37.5%{transform:rotate(47.5deg)}41.67%{transform:rotate(57.8deg)}45.83%{transform:rotate(70.9deg)}50%{transform:rotate(84.4deg)}54.17%{transform:rotate(96.2deg)}58.33%{transform:rotate(105.9deg)}62.5%{transform:rotate(113.2deg)}66.67%{transform:rotate(114.9deg)}70.83%{transform:rotate(110.3deg)}75%{transform:rotate(97.7deg)}79.17%{transform:rotate(80.8deg)}83.33%{transform:rotate(65.7deg)}87.5%{transform:rotate(57.1deg)}91.67%{transform:rotate(53.4deg)}95.83%{transform:rotate(45.8deg)}100%{transform:rotate(37.4deg)}}
  @keyframes ps-upper{0%{transform:rotate(12.5deg)}8.33%{transform:rotate(-7.7deg)}16.67%{transform:rotate(-33.2deg)}25%{transform:rotate(-57.4deg)}33.33%{transform:rotate(-73.7deg)}41.67%{transform:rotate(-77.7deg)}50%{transform:rotate(-68.5deg)}58.33%{transform:rotate(-48.3deg)}66.67%{transform:rotate(-22.8deg)}75%{transform:rotate(1.4deg)}83.33%{transform:rotate(17.7deg)}91.67%{transform:rotate(21.7deg)}100%{transform:rotate(12.5deg)}}
  @keyframes ps-fore{0%{transform:rotate(-49.9deg)}8.33%{transform:rotate(-53.9deg)}16.67%{transform:rotate(-59.0deg)}25%{transform:rotate(-63.9deg)}33.33%{transform:rotate(-67.1deg)}41.67%{transform:rotate(-67.9deg)}50%{transform:rotate(-66.1deg)}58.33%{transform:rotate(-62.1deg)}66.67%{transform:rotate(-57.0deg)}75%{transform:rotate(-52.1deg)}83.33%{transform:rotate(-48.9deg)}91.67%{transform:rotate(-48.1deg)}100%{transform:rotate(-49.9deg)}}
  @keyframes ps-shadow{0%{transform:scaleX(0.876)}8.33%{transform:scaleX(0.933)}16.67%{transform:scaleX(0.978)}25%{transform:scaleX(0.999)}33.33%{transform:scaleX(0.991)}41.67%{transform:scaleX(0.957)}50%{transform:scaleX(0.904)}58.33%{transform:scaleX(0.847)}66.67%{transform:scaleX(0.802)}75%{transform:scaleX(0.781)}83.33%{transform:scaleX(0.789)}91.67%{transform:scaleX(0.823)}100%{transform:scaleX(0.876)}}
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
      <circle cx="50" cy="62.5" r="38.5" fill="url(#ps-sun)"/>
      <line class="ps-ground" x1="-30" y1="101" x2="130" y2="101" stroke="url(#ps-fade)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="7 5"/>
      <g><line class="ps-streak" x1="14" y1="38" x2="28" y2="38"/><line class="ps-streak" x1="6" y1="51" x2="24" y2="51"/><line class="ps-streak" x1="12" y1="64" x2="25" y2="64"/></g>
      <ellipse class="ps-shadow" cx="49" cy="101" rx="15" ry="1.8"/>
      <g class="ps-body" fill="currentColor">
        <g class="ps-far">
          <g transform="rotate(28 48 57)"><g class="ps-j ps-upper ps-b"><path d="M44.8 37L45.5 50.5A3.1 3.1 0 0 0 51.7 50.5L52.4 37A3.8 3.8 0 0 0 44.8 37Z"/><g class="ps-j ps-fore"><path d="M45.5 50.5L46.1 61.5A2.5 2.5 0 0 0 51.1 61.5L51.7 50.5A3.1 3.1 0 0 0 45.5 50.5Z"/><circle cx="48.6" cy="62.3" r="3"/></g></g></g>
          <g class="ps-j ps-thigh ps-b"><path d="M42.2 57L44 79.5A4 4 0 0 0 52 79.5L53.8 57A5.8 5.8 0 0 0 42.2 57Z"/><g class="ps-j ps-shin"><path d="M44 79.5L45.5 100.5A2.5 2.5 0 0 0 50.5 100.5L52 79.5A4 4 0 0 0 44 79.5ZM47.2 99.1L54.3 99.1A2.2 2.2 0 0 1 54.3 103.5L47.2 103.5A2.2 2.2 0 0 1 47.2 99.1Z"/></g></g>
        </g>
        <g transform="rotate(28 48 57)">
          <path d="M43 58C41 51 40 45 40.6 39.5C41.2 34.6 44.4 32 48.4 32C52.8 32 55.6 34.8 56.2 39.8C56.8 45.5 55.2 51.5 54 58C52.6 61.6 44.4 61.6 43 58Z"/>
          <path d="M48.6 33L48.9 28.2" stroke="currentColor" stroke-width="4.4" stroke-linecap="round"/>
          <circle cx="49" cy="22.6" r="5.8"/>
          <g transform="translate(36.5 34) rotate(-28)">
            <path class="ps-link" d="M-6 -5.2 L6 5.2 M6 -5.2 L-6 5.2"/>
            <g class="ps-node"><circle r="3.5"/><circle cx="-6" cy="-5.2" r="2.4"/><circle cx="6" cy="-5.2" r="2.4"/><circle cx="-6" cy="5.2" r="2.4"/><circle cx="6" cy="5.2" r="2.4"/></g>
          </g>
        </g>
        <g class="ps-outline ps-j ps-thigh"><path d="M42.2 57L44 79.5A4 4 0 0 0 52 79.5L53.8 57A5.8 5.8 0 0 0 42.2 57Z"/><g class="ps-j ps-shin"><path d="M44 79.5L45.5 100.5A2.5 2.5 0 0 0 50.5 100.5L52 79.5A4 4 0 0 0 44 79.5ZM47.2 99.1L54.3 99.1A2.2 2.2 0 0 1 54.3 103.5L47.2 103.5A2.2 2.2 0 0 1 47.2 99.1Z"/></g></g>
        <g class="ps-j ps-thigh"><path d="M42.2 57L44 79.5A4 4 0 0 0 52 79.5L53.8 57A5.8 5.8 0 0 0 42.2 57Z"/><g class="ps-j ps-shin"><path d="M44 79.5L45.5 100.5A2.5 2.5 0 0 0 50.5 100.5L52 79.5A4 4 0 0 0 44 79.5ZM47.2 99.1L54.3 99.1A2.2 2.2 0 0 1 54.3 103.5L47.2 103.5A2.2 2.2 0 0 1 47.2 99.1Z"/></g></g>
        <g transform="rotate(28 48 57)"><g class="ps-outline ps-j ps-upper"><path d="M44.8 37L45.5 50.5A3.1 3.1 0 0 0 51.7 50.5L52.4 37A3.8 3.8 0 0 0 44.8 37Z"/><g class="ps-j ps-fore"><path d="M45.5 50.5L46.1 61.5A2.5 2.5 0 0 0 51.1 61.5L51.7 50.5A3.1 3.1 0 0 0 45.5 50.5Z"/><circle cx="48.6" cy="62.3" r="3"/></g></g><g class="ps-j ps-upper"><path d="M44.8 37L45.5 50.5A3.1 3.1 0 0 0 51.7 50.5L52.4 37A3.8 3.8 0 0 0 44.8 37Z"/><g class="ps-j ps-fore"><path d="M45.5 50.5L46.1 61.5A2.5 2.5 0 0 0 51.1 61.5L51.7 50.5A3.1 3.1 0 0 0 45.5 50.5Z"/><circle cx="48.6" cy="62.3" r="3"/></g></g></g>
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
