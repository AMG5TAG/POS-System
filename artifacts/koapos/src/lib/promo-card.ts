/**
 * Inventory › Promotions — renders promo cards to a standalone HTML document.
 *
 * The same document is the on-screen preview (an iframe) and the print job
 * (Print Bridge → headless Chrome, or the browser dialog), so what staff see
 * is what prints. Every image is passed in as a data URL: the bridge renders
 * from a temp file with no session cookie, so `/api/storage/...` photos and
 * the app's own assets would otherwise be blank.
 *
 * Each template is a fixed-size "stage" laid out in the template artwork's own
 * pixels (from `src/assets/promo-template-*.png`, which are the merchant's
 * designs with the sample text removed), then scaled to the paper. Text boxes
 * carry `data-fit`: an inline script shrinks each one until its words fit, so
 * a long product name never runs into the logo.
 */
import { escHtml } from "@/lib/html-escape";

export type PromoTemplate = "classic" | "products" | "computers";

export interface PromoSpecs {
  cpu: string; ram: string; storage: string; gpu: string;
  display: string; os: string; warranty: string; grade: string;
}

export interface PromoCopy {
  headline: string;
  subtitle: string;
  banner: string;
  features: string[];
  pitch: string;
  blurb: string;
  specs: PromoSpecs;
}

export interface PromoCardData {
  template: PromoTemplate;
  copy: PromoCopy;
  productName: string;
  price: number;
  /** Data URL of the product's main photo (square templates). */
  photo?: string | null;
  /** Data URL of the shop-page QR (square templates). */
  qr?: string | null;
}

export interface PromoAssets {
  /** Data URLs of the three blank template backgrounds. */
  backgrounds: Record<PromoTemplate, string>;
  /**
   * The K coin's words ("Earn 1% Kredit Back as Store Credit") are part of the
   * artwork, so it is shown only while that is what the loyalty programme
   * actually pays; otherwise it is covered.
   */
  showLoyaltyCoin: boolean;
}

/** Square stock for the Products/Computers cards, in inches. */
export const SQUARE_SIZES = [4, 5, 6, 8] as const;
export type SquareSize = (typeof SQUARE_SIZES)[number];

export const CLASSIC_SIZE_IN = { w: 4, h: 6 } as const;

const STAGE: Record<PromoTemplate, { w: number; h: number }> = {
  classic: { w: 1240, h: 1860 },
  products: { w: 1080, h: 1080 },
  computers: { w: 1080, h: 1080 },
};

export const PROMO_SPEC_TILES: Array<{ key: keyof PromoSpecs; label: string }> = [
  { key: "cpu", label: "Processor" },
  { key: "ram", label: "RAM" },
  { key: "storage", label: "Storage" },
  { key: "display", label: "Screen" },
  { key: "gpu", label: "Graphics" },
  { key: "os", label: "Operating system" },
  { key: "warranty", label: "Warranty" },
  { key: "grade", label: "Grade" },
];

export function emptyPromoCopy(): PromoCopy {
  return {
    headline: "", subtitle: "", banner: "", features: [], pitch: "", blurb: "",
    specs: { cpu: "", ram: "", storage: "", gpu: "", display: "", os: "", warranty: "", grade: "" },
  };
}

/** Paper for a template, in inches. */
export function promoPaper(template: PromoTemplate, square: SquareSize): { w: number; h: number } {
  return template === "classic" ? CLASSIC_SIZE_IN : { w: square, h: square };
}

/** "$695" for whole dollars, "$1,299.95" otherwise. */
export function formatPromoPrice(price: number): string {
  const whole = Math.abs(price - Math.round(price)) < 0.005;
  return "$" + price.toLocaleString("en-AU", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** A fixed box whose text shrinks from `max` px until it fits. */
function box(
  cls: string,
  pos: { l: number; t: number; w: number; h: number },
  max: number,
  inner: string,
  opts: { nowrap?: boolean; min?: number } = {},
): string {
  const style = `left:${pos.l}px;top:${pos.t}px;width:${pos.w}px;height:${pos.h}px;font-size:${max}px`;
  return `<div class="fit ${cls}${opts.nowrap ? " nowrap" : ""}" style="${style}" data-fit="${max}" data-min="${opts.min ?? 10}"><div class="in">${inner}</div></div>`;
}

const e = (s: string) => escHtml(s);

function classicStage(d: PromoCardData): string {
  const name = d.copy.headline || d.productName;
  const feats = d.copy.features.filter((f) => f.trim()).slice(0, 5);
  return [
    box("c-name", { l: 170, t: 190, w: 900, h: 400 }, 130, e(name)),
    feats.length
      ? box("c-feats", { l: 215, t: 625, w: 860, h: 540 }, 66,
        `<ul>${feats.map((f) => `<li>${e(f)}</li>`).join("")}</ul>`, { nowrap: true })
      : "",
    d.copy.pitch ? box("c-pitch", { l: 150, t: 1185, w: 940, h: 215 }, 66, e(d.copy.pitch)) : "",
    `<div class="c-price-label">PRICE</div>`,
    box("c-price", { l: 150, t: 1495, w: 640, h: 200 }, 175, e(formatPromoPrice(d.price)), { nowrap: true }),
  ].join("");
}

function squareCommon(d: PromoCardData, assets: PromoAssets, photoBox: { l: number; t: number; w: number; h: number }, pitchBox: { l: number; t: number; w: number; h: number }): string {
  const name = d.copy.headline || d.productName;
  const parts = [
    box("s-title", { l: 335, t: 26, w: 735, h: 90 }, 78, e(name), { nowrap: true }),
    d.copy.subtitle ? box("s-sub", { l: 335, t: 114, w: 735, h: 48 }, 36, e(d.copy.subtitle), { nowrap: true }) : "",
    d.copy.banner ? box("s-banner", { l: 368, t: 186, w: 655, h: 36 }, 23, e(d.copy.banner), { nowrap: true }) : "",
    box("s-price", { l: 482, t: 256, w: 220, h: 80 }, 66, e(formatPromoPrice(d.price)), { nowrap: true }),
    d.photo ? `<img class="s-photo" src="${d.photo}" style="left:${photoBox.l}px;top:${photoBox.t}px;width:${photoBox.w}px;height:${photoBox.h}px" alt="">` : "",
    (d.copy.pitch || d.copy.blurb)
      ? box("s-pitch", pitchBox, 24,
        `${d.copy.pitch ? `<div class="h">${e(d.copy.pitch)}</div>` : ""}${d.copy.blurb ? `<div class="b">${e(d.copy.blurb)}</div>` : ""}`)
      : "",
    d.qr ? `<div class="s-qr"><img src="${d.qr}" alt=""></div>` : "",
    assets.showLoyaltyCoin ? "" : `<div class="s-coin-cover"></div>`,
  ];
  return parts.join("");
}

function productsStage(d: PromoCardData, assets: PromoAssets): string {
  const rows = [377, 437, 497, 556, 615];
  const list = d.copy.features.filter((f) => f.trim()).slice(0, 5);
  const feats = list.map((f, i) =>
    box("s-feat", { l: 245, t: rows[i]! - 28, w: 380, h: 56 }, 29, e(f), { nowrap: true }));
  // The template's five tick circles are artwork; cover the ones with no feature.
  const covers = rows.slice(list.length).map((y) =>
    `<div class="tick-cover" style="top:${y - 31}px"></div>`);
  return squareCommon(d, assets, { l: 640, t: 345, w: 425, h: 265 }, { l: 297, t: 682, w: 395, h: 186 })
    + feats.join("") + covers.join("");
}

function computersStage(d: PromoCardData, assets: PromoAssets): string {
  // Column 1: CPU, storage, graphics, warranty; column 2: RAM, screen, OS,
  // grade — the order the template's icons are drawn in.
  const rows = [392, 465, 538, 606];
  const col1: Array<keyof PromoSpecs> = ["cpu", "storage", "gpu", "warranty"];
  const col2: Array<keyof PromoSpecs> = ["ram", "display", "os", "grade"];
  const cell = (key: keyof PromoSpecs, l: number, w: number, y: number) =>
    d.copy.specs[key] ? box("s-spec", { l, t: y - 34, w, h: 68 }, 28, e(d.copy.specs[key])) : "";
  const cells = rows.flatMap((y, i) => [cell(col1[i]!, 232, 215, y), cell(col2[i]!, 528, 186, y)]);
  return squareCommon(d, assets, { l: 722, t: 262, w: 348, h: 390 }, { l: 376, t: 682, w: 342, h: 186 })
    + cells.join("");
}

const CSS = `
html,body{margin:0;padding:0;background:#fff}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.stage{position:absolute;left:0;top:0;transform-origin:0 0}
.stage>.bg{position:absolute;left:0;top:0;width:100%;height:100%}
.fit{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;text-align:center;line-height:1.12;color:#000}
.fit .in{max-width:100%;overflow-wrap:anywhere}
.fit.nowrap .in{white-space:nowrap;overflow-wrap:normal;max-width:none}
.c-name{font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:-.01em}
.c-feats{justify-content:flex-start;font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-weight:400;text-transform:uppercase}
.c-feats ul{margin:0;padding:0 0 0 1.25em;text-align:left;line-height:1.5}
.c-feats li::marker{font-size:1.1em}
.c-pitch{font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-style:italic;text-transform:uppercase;line-height:1.45}
.c-price-label{position:absolute;left:385px;top:1425px;font:400 56px Inter,"Helvetica Neue",Arial,sans-serif;color:#000}
.c-price{font-family:"Archivo Black","Arial Black",Arial,sans-serif;font-weight:900}
.s-title{font-family:Lexend,"Arial Black",Arial,sans-serif;font-weight:700;text-transform:uppercase}
.s-sub{font-family:Lexend,Arial,sans-serif;font-weight:400;text-transform:uppercase}
.s-banner{font-family:Lexend,Arial,sans-serif;font-weight:700;text-transform:uppercase;color:#111}
.s-price{justify-content:flex-start;font-family:Lexend,"Arial Black",Arial,sans-serif;font-weight:700}
.s-feat{justify-content:flex-start;text-align:left;font-family:Lexend,Arial,sans-serif;font-weight:400;text-transform:uppercase}
.s-spec{justify-content:flex-start;text-align:left;font-family:Lexend,Arial,sans-serif;font-weight:400;text-transform:uppercase;line-height:1.25}
.s-pitch{flex-direction:column;align-items:flex-start;justify-content:center;text-align:left;font-family:Lexend,Arial,sans-serif;line-height:1.55}
.s-pitch .h{font-weight:700;text-transform:uppercase}
.s-pitch .b{font-weight:400;font-size:.9em}
.s-photo{position:absolute;object-fit:contain}
.s-qr{position:absolute;left:21px;top:777px;width:120px;height:120px;background:#fff;border-radius:14px;padding:7px}
.s-qr img{width:100%;height:100%;display:block;image-rendering:pixelated}
.s-coin-cover{position:absolute;left:782px;top:640px;width:232px;height:232px;border-radius:50%;background:#fff}
.tick-cover{position:absolute;left:176px;width:66px;height:62px;background:#fff}
`;

/* Shrinks every [data-fit] box until its content fits, once straight away
   (so a renderer that prints on `load` still gets fitted text) and again once
   the web fonts arrive. Sets window.__promoReady for the print path to wait on. */
const FIT_SCRIPT = `
(function(){
  function fit(){
    var els=document.querySelectorAll('[data-fit]');
    for(var i=0;i<els.length;i++){
      var el=els[i],inner=el.firstElementChild,s=parseFloat(el.getAttribute('data-fit')),min=parseFloat(el.getAttribute('data-min')||'10');
      el.style.fontSize=s+'px';
      while(s>min&&(inner.offsetHeight>el.clientHeight||inner.scrollWidth>el.clientWidth)){s-=1;el.style.fontSize=s+'px';}
    }
  }
  fit();
  var done=function(){fit();window.__promoReady=true;};
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(done,done);setTimeout(done,2500);}else{done();}
})();
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:ital,wght@0,400;0,800;1,400&family=Lexend:wght@400;700&display=block" rel="stylesheet">`;

/**
 * One document, one page per card. Every card in a document must share a paper
 * size (`@page` is per document), so callers group by `promoPaper` first.
 */
export function buildPromoCardsHtml(cards: PromoCardData[], assets: PromoAssets, square: SquareSize): string {
  if (!cards.length) return "";
  const paper = promoPaper(cards[0]!.template, square);
  const pages = cards.map((d) => {
    const st = STAGE[d.template];
    const scale = (paper.w * 96) / st.w;
    const body = d.template === "classic" ? classicStage(d)
      : d.template === "computers" ? computersStage(d, assets)
      : productsStage(d, assets);
    return `<div class="page" style="width:${paper.w}in;height:${paper.h}in"><div class="stage" style="width:${st.w}px;height:${st.h}px;transform:scale(${scale})"><img class="bg" src="${assets.backgrounds[d.template]}" alt="">${body}</div></div>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Promo cards</title>${FONTS}<style>@page{size:${paper.w}in ${paper.h}in;margin:0}${CSS}</style></head><body>${pages.join("")}<script>${FIT_SCRIPT}</script></body></html>`;
}
