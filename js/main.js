/* ==========================================================================
   IVALUA — THE CURRENT
   Engine: raw WebGL fragment shader (no 3D lib needed for a full-screen
   field), Lenis smooth scroll, GSAP ScrollTrigger choreography.
   ========================================================================== */
(() => {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 700px)").matches;

  /* ================= WebGL current ================= */
  const canvas = document.getElementById("gl");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });

  const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform float uGlow;    // section-driven brightness 0..1
uniform float uEmber;   // ember filament presence 0..1

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.,0.)), u.x),
             mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.87, 0.48, -0.48, 0.87);
  for(int i = 0; i < 5; i++){
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv;
  p.x *= uRes.x / uRes.y;

  // anisotropic: stretch horizontally so the field reads as a current
  vec2 q = vec2(p.x * 0.55, p.y * 2.1);
  q += (uMouse - 0.5) * 0.18;

  float t = uTime * 0.045;

  vec2 w1 = vec2(fbm(q + t), fbm(q + vec2(5.2, 1.3) - t * 0.7));
  vec2 w2 = vec2(fbm(q + 3.5 * w1 + vec2(1.7, 9.2) + t * 0.4),
                 fbm(q + 3.5 * w1 + vec2(8.3, 2.8) - t * 0.3));
  float f = fbm(q + 3.0 * w2);

  // filament ridges flowing along x
  float ridge = abs(sin(f * 9.0 + q.x * 2.0 - uTime * 0.12));
  float fil = pow(1.0 - ridge, 6.0);

  // second finer layer
  float ridge2 = abs(sin(f * 16.0 - q.x * 3.0 + uTime * 0.07));
  float fil2 = pow(1.0 - ridge2, 10.0) * 0.6;

  // palette — brand hues: void indigo -> teal -> luminous cyan
  vec3 cVoid = vec3(0.043, 0.039, 0.086);
  vec3 cIndigo = vec3(0.145, 0.153, 0.30);
  vec3 cTeal = vec3(0.039, 0.42, 0.55);
  vec3 cCyan = vec3(0.34, 0.75, 0.84);
  vec3 cEmber = vec3(0.99, 0.55, 0.14);

  vec3 col = cVoid;
  col = mix(col, cIndigo, smoothstep(0.15, 0.8, f));
  col += cTeal * fil * (0.45 + 0.55 * f);
  col += cCyan * fil2 * f;

  // rare ember filament — a different noise channel, gated
  float eMask = smoothstep(0.78, 0.95, fbm(q * 0.8 + vec2(31.7, 17.3) + t * 0.5));
  col += cEmber * fil * eMask * uEmber * 1.4;

  // vertical falloff so text zones stay calm
  float band = smoothstep(0.0, 0.35, uv.y) * smoothstep(1.0, 0.6, uv.y);
  col = mix(cVoid, col, 0.35 + 0.65 * band);

  // glow scaling by section
  col = mix(cVoid, col, 0.18 + 0.82 * uGlow);

  // vignette
  float vig = smoothstep(1.25, 0.4, length(uv - 0.5));
  col *= 0.75 + 0.25 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

  const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  let glOK = false, uni = {};
  if (gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (vs && fs) {
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog); gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ["uRes","uTime","uMouse","uGlow","uEmber"].forEach(n => uni[n] = gl.getUniformLocation(prog, n));
      glOK = true;
    }
  }
  if (!glOK) document.body.classList.add("no-gl");

  const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
  function sizeGL(){
    canvas.width = Math.floor(innerWidth * DPR);
    canvas.height = Math.floor(innerHeight * DPR);
    if (glOK) { gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uni.uRes, canvas.width, canvas.height); }
  }
  sizeGL();
  addEventListener("resize", sizeGL);

  // mouse easing
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  addEventListener("pointermove", e => { mouse.tx = e.clientX / innerWidth; mouse.ty = 1 - e.clientY / innerHeight; }, { passive: true });

  // section-driven glow: bright at hero, dim through the middle, reprise at CTA
  let glow = 1, ember = 0;
  function computeGlow(){
    const y = scrollY, h = innerHeight;
    const doc = document.documentElement.scrollHeight - h;
    const heroOut = Math.min(y / (h * 0.9), 1);            // 0 at top -> 1 past hero
    const ctaIn = Math.max(0, (y - (doc - h * 1.2)) / (h * 1.0)); // rises near end
    glow = Math.max(1 - heroOut * 0.8, Math.min(ctaIn, 1));
    // ember presence peaks around the IVA section
    const ivaEl = document.getElementById("iva");
    if (ivaEl) {
      const r = ivaEl.getBoundingClientRect();
      const c = 1 - Math.min(Math.abs((r.top + r.height / 2) - h / 2) / (h * 1.1), 1);
      ember = Math.max(c, ctaIn * 0.5);
    }
  }

  let raf, t0 = performance.now(), hidden = false;
  document.addEventListener("visibilitychange", () => { hidden = document.hidden; });

  function frame(now){
    if (glOK && !hidden) {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      computeGlow();
      gl.uniform1f(uni.uTime, (now - t0) / 1000);
      gl.uniform2f(uni.uMouse, mouse.x, mouse.y);
      gl.uniform1f(uni.uGlow, glow);
      gl.uniform1f(uni.uEmber, ember);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!prefersReduced) raf = requestAnimationFrame(frame);
  }

  if (glOK) {
    if (prefersReduced) {
      // single static frame
      gl.uniform1f(uni.uTime, 12); gl.uniform2f(uni.uMouse, 0.5, 0.5);
      gl.uniform1f(uni.uGlow, 1); gl.uniform1f(uni.uEmber, 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  /* ================= Smooth scroll ================= */
  let lenis = null;
  if (!prefersReduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.0 });
    function rafLenis(time){ lenis.raf(time); requestAnimationFrame(rafLenis); }
    requestAnimationFrame(rafLenis);
  }

  /* ================= Anchor smoothing ================= */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 });
      else target.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth" });
    });
  });

  /* ================= GSAP setup ================= */
  const hasGSAP = window.gsap && window.ScrollTrigger;
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    if (lenis) lenis.on("scroll", ScrollTrigger.update);
  }

  /* ================= Loader veil + hero entrance ================= */
  const veil = document.getElementById("veil");
  const count = document.getElementById("veilCount");

  function heroEntrance(){
    if (!hasGSAP || prefersReduced) {
      document.querySelectorAll(".hero [data-reveal], .hero__word").forEach(el => { el.style.opacity = 1; el.style.transform = "none"; });
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.fromTo("[data-w]", { yPercent: 110 }, { yPercent: 0, duration: 1.3, stagger: 0.09 }, 0)
      .to(".hero__eyebrow", { opacity: 1, y: 0, duration: 0.9 }, 0.35)
      .to(".hero__sub", { opacity: 1, y: 0, duration: 0.9 }, 0.55)
      .to(".hero__ctas", { opacity: 1, y: 0, duration: 0.9 }, 0.68)
      .to(".hero__meta [data-reveal]", { opacity: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.8);
  }

  function dismissVeil(){
    if (prefersReduced || !hasGSAP) { veil.remove(); heroEntrance(); return; }
    gsap.to(veil, { opacity: 0, duration: 0.6, ease: "power2.inOut", onComplete: () => veil.remove() });
    heroEntrance();
  }

  let seen = false;
  try { seen = sessionStorage.getItem("veiled") === "1"; sessionStorage.setItem("veiled", "1"); } catch (e) {}
  if (prefersReduced || seen) {
    veil.remove(); heroEntrance();
  } else {
    let n = 0;
    const iv = setInterval(() => {
      n = Math.min(n + Math.ceil(Math.random() * 22), 100);
      count.textContent = String(n).padStart(2, "0");
      if (n >= 100) { clearInterval(iv); setTimeout(dismissVeil, 150); }
    }, 70);
    // hard cap: never hold the page hostage
    setTimeout(() => { clearInterval(iv); if (document.body.contains(veil)) dismissVeil(); }, 1600);
  }

  /* ================= Nav state ================= */
  const nav = document.getElementById("nav");
  const proofEl = document.getElementById("proof");
  function navState(){
    nav.classList.toggle("is-scrolled", scrollY > 40);
    if (proofEl) {
      const r = proofEl.getBoundingClientRect();
      const navH = nav.offsetHeight;
      nav.classList.toggle("nav--invert", r.top < navH && r.bottom > 0);
    }
  }
  addEventListener("scroll", navState, { passive: true });
  navState();

  /* ================= Generic reveals ================= */
  if (hasGSAP && !prefersReduced) {
    document.querySelectorAll("[data-reveal]").forEach(el => {
      if (el.closest(".hero")) return; // hero handled by entrance timeline
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1.1, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 88%" }
      });
    });
  }

  /* ================= Hero width-axis scrub ================= */
  if (hasGSAP && !prefersReduced) {
    document.querySelectorAll(".hero__word").forEach((w, i) => {
      gsap.fromTo(w, { fontStretch: "115%" }, {
        fontStretch: "72%",
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 20%", scrub: 0.4 }
      });
    });
    gsap.to(".hero__title", {
      opacity: 0.15, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "40% top", end: "bottom top", scrub: true }
    });
  }

  /* ================= Ticker ================= */
  const track = document.getElementById("tickerTrack");
  if (track) {
    const set = track.querySelector(".ticker__set");
    for (let i = 0; i < 3; i++) track.appendChild(set.cloneNode(true));
    if (hasGSAP && !prefersReduced) {
      gsap.to(track, { xPercent: -25, ease: "none", duration: 28, repeat: -1 });
    }
  }

  /* ================= The Shift: pinned narrative ================= */
  const shiftSts = gsap ? Array.from(document.querySelectorAll("[data-shift]")) : [];
  // split words, preserving <em>
  shiftSts.forEach(st => {
    const wrapWords = (node) => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(tok => {
            if (/^\s+$/.test(tok) || tok === "") { frag.appendChild(document.createTextNode(tok)); }
            else { const s = document.createElement("span"); s.className = "sw"; s.textContent = tok; frag.appendChild(s); }
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) wrapWords(child);
      });
    };
    wrapWords(st);
  });

  if (hasGSAP && !prefersReduced && shiftSts.length) {
    const label = document.querySelector(".shift__label");
    const N = shiftSts.length;
    ScrollTrigger.create({
      trigger: ".shift",
      start: "top top",
      end: `+=${N * 120}%`,
      pin: ".shift__pin",
      scrub: true,
      onUpdate(self){
        const p = self.progress * N; // 0..N
        shiftSts.forEach((st, i) => {
          const local = Math.min(Math.max(p - i, 0), 1); // 0..1 within statement
          const words = st.querySelectorAll(".sw");
          const fadeOut = Math.min(Math.max((p - i - 0.82) / 0.18, 0), 1);
          const visible = i === 0 || local > 0;
          st.style.opacity = visible ? (1 - fadeOut) : 0;
          st.style.visibility = visible ? "visible" : "hidden";
          const lit = Math.floor(local / 0.8 * words.length);
          words.forEach((w, wi) => w.classList.toggle("lit", wi < lit));
        });
        if (label) label.textContent = `THE SHIFT — 0${Math.min(Math.floor(p) + 1, N)}/0${N}`;
      }
    });
  } else {
    // no-motion fallback: show all statements stacked
    shiftSts.forEach(st => {
      st.style.position = "relative";
      st.style.opacity = 1;
      st.style.marginBottom = "1.2em";
      st.querySelectorAll(".sw").forEach(w => w.classList.add("lit"));
    });
    const stage = document.querySelector(".shift__stage");
    if (stage) stage.style.minHeight = "0";
    const pin = document.querySelector(".shift__pin");
    if (pin && prefersReduced) pin.style.height = "auto", pin.style.padding = "120px var(--pad-x)";
  }

  /* ================= Platform: horizontal gallery ================= */
  if (hasGSAP && !prefersReduced && !isMobile) {
    const ptrack = document.getElementById("platformTrack");
    const move = () => -(ptrack.scrollWidth - innerWidth + parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pad-x")) * 0);
    gsap.to(ptrack, {
      x: () => Math.min(0, innerWidth - ptrack.scrollWidth - 88),
      ease: "none",
      scrollTrigger: {
        trigger: ".platform",
        start: "top top",
        end: () => `+=${ptrack.scrollWidth - innerWidth + 400}`,
        pin: ".platform__pin",
        scrub: 0.5,
        invalidateOnRefresh: true
      }
    });
  }

  /* ================= Plate tilt ================= */
  if (!prefersReduced && !isMobile) {
    document.querySelectorAll("[data-plate]").forEach(pl => {
      pl.addEventListener("pointermove", e => {
        const r = pl.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 8;
        pl.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
        pl.style.setProperty("--mx", `${e.clientX - r.left}px`);
        pl.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
      pl.addEventListener("pointerleave", () => {
        pl.style.transition = "transform 0.6s cubic-bezier(0.16,1,0.3,1)";
        pl.style.transform = "perspective(900px) rotateX(0) rotateY(0)";
        setTimeout(() => pl.style.transition = "", 600);
      });
    });
  }

  /* ================= Relic parallax ================= */
  if (hasGSAP && !prefersReduced) {
    document.querySelectorAll("[data-parallax]").forEach(el => {
      gsap.fromTo(el, { y: 60 }, {
        y: -60, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true }
      });
    });
  }

  /* ================= Console typing ================= */
  const q = document.querySelector("[data-type]");
  const ans = document.querySelector("[data-answer]");
  if (q && ans) {
    const full = q.textContent;
    if (!prefersReduced && hasGSAP) {
      q.textContent = "";
      ans.style.opacity = 0;
      ScrollTrigger.create({
        trigger: ".iva__console",
        start: "top 75%",
        once: true,
        onEnter(){
          let i = 0;
          const iv = setInterval(() => {
            q.textContent = full.slice(0, ++i);
            if (i >= full.length) {
              clearInterval(iv);
              gsap.to(ans, { opacity: 1, duration: 0.8, ease: "power2.out", delay: 0.35 });
              gsap.fromTo(ans.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.18, duration: 0.7, ease: "expo.out", delay: 0.35 });
            }
          }, 28);
        }
      });
    }
  }

  /* ================= Count-up ledger ================= */
  document.querySelectorAll("[data-count]").forEach(num => {
    const target = parseFloat(num.dataset.count);
    const dec = parseInt(num.dataset.dec || "0", 10);
    const pre = num.dataset.prefix || "", suf = num.dataset.suffix || "";
    const render = v => num.textContent = pre + v.toFixed(dec) + suf;
    if (prefersReduced || !hasGSAP) { render(target); return; }
    render(0);
    ScrollTrigger.create({
      trigger: num, start: "top 88%", once: true,
      onEnter(){
        const obj = { v: 0 };
        gsap.to(obj, { v: target, duration: 1.8, ease: "expo.out", onUpdate: () => render(obj.v) });
      }
    });
  });

  /* ================= CTA words ================= */
  if (hasGSAP && !prefersReduced) {
    gsap.fromTo("[data-w2]", { yPercent: 110 }, {
      yPercent: 0, duration: 1.2, ease: "expo.out", stagger: 0.1,
      scrollTrigger: { trigger: ".cta", start: "top 70%" }
    });
  } else {
    document.querySelectorAll("[data-w2]").forEach(el => el.style.transform = "none");
  }

})();
