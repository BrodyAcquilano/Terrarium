/* ===== original page script 1 ===== */
(function(){
    "use strict";
    /* ---------- tabs ---------- */
    function wireTabs(tabSel, panelIds){
      var tabs = Array.prototype.slice.call(document.querySelectorAll(tabSel));
      tabs.forEach(function(tab){
        tab.addEventListener('click', function(){
          tabs.forEach(function(t){ t.setAttribute('aria-selected','false'); });
          tab.setAttribute('aria-selected','true');
          panelIds.forEach(function(id){ document.getElementById(id).hidden = true; });
          document.getElementById(tab.getAttribute('aria-controls')).hidden = false;
        });
      });
    }
    wireTabs('.tab', ['view-terrarium','view-water','view-specs']);
    wireTabs('.subtab', ['spec-terrarium','spec-panel']);

    /* ---------- model ---------- */
    var TAU = 24;              /* s, effective lumped time constant */
    var PMAX = 24;             /* W */
    var slider = document.getElementById('tempSlider');
    var setVal = document.getElementById('setVal');
    var Tset = parseFloat(slider.value);
    var Tmean = Tset;          /* Newton exponential — the mean (simplification: swing removed) */
    var Tact = Tset;           /* actual temperature — the oscillator signal */
    var Vact = 0;              /* dT/dt of the actual (oscillator) temperature */
    var WN_T = 0.52, ZE_T = 0.13; /* oscillator: swing period ≈ 12 s, envelope tau = 1/(ZE*WN) ≈ 15 s */
    var stepT = -1000, stepAmp = 0; /* latest setpoint step, for the envelope */
    var tNow = 0;              /* sim seconds */
    var hist = [];             /* {t, T (actual/oscillator), Te (mean/exponential), Ts, e (envelope)} */
    for (var i = 100; i >= 0; i--) hist.push({ t: -i * 0.5, T: Tact, Te: Tmean, Ts: Tset, e: 0 });
    tNow = 0;
    function envNow(t){ if(!stepAmp) return 0; var age = t - stepT; return age <= 0 ? Math.abs(stepAmp) : Math.abs(stepAmp) * Math.exp(-ZE_T * WN_T * age); }

    var roTemp = document.getElementById('roTemp'),
        roState = document.getElementById('roState'),
        roPower = document.getElementById('roPower'),
        roPress = document.getElementById('roPress'),
        rays = document.getElementById('rays'),
        panelGlow = document.getElementById('panelGlow'),
        airTop = document.getElementById('airTop'),
        airBot = document.getElementById('airBot');

    slider.addEventListener('input', function(){
      var nv = parseFloat(slider.value);
      if (nv !== Tset){ stepT = tNow; stepAmp = Tact - nv; }
      Tset = nv;
      setVal.textContent = Tset.toFixed(1) + '°';
      drawDist();
      drawLogDist();
    });

    function heaterPower(){
      var err = Tset - Tmean;
      if (err <= 0) return 0;
      return PMAX * Math.min(1, err / 3);
    }

    /* ---------- canvas helpers ---------- */
    function fitCanvas(cv){
      var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var w = Math.max(200, Math.round(r.width)), h = 230;
      if (cv.width !== w * dpr || cv.height !== h * dpr){
        cv.width = w * dpr; cv.height = h * dpr;
      }
      var ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: w, h: h };
    }
    function cssVar(name){
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    /* ---------- graph 1: transient, last 100 s — OSCILLATOR graph ----------
       Actual temperature (oscillator signal): solid ORANGE.
       Mean / Newton exponential (simplification, swing removed): dashed WHITE, behind.
       Envelope: dashed ORANGE. Y axis auto-zooms + recentres as it settles,
       same behaviour as the Water Level live graph. */
    var gT = document.getElementById('gTransient');
    var yLoD = 19, yHiD = 31; /* displayed axis limits — eased toward the data */
    function drawTransient(){
      var f = fitCanvas(gT), ctx = f.ctx, W = f.w, H = f.h;
      var ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line'),
          heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 40, padR = 8, padT = 16, padB = 24;
      var iw = W - padL - padR, ih = H - padT - padB;
      /* auto-zoom / recentre: target axis brackets everything drawn — actual,
         mean, setpoint and both envelopes — with a little headroom */
      var dMin = Infinity, dMax = -Infinity;
      hist.forEach(function(p){
        dMin = Math.min(dMin, p.T, p.Te, p.Ts - p.e, p.Ts);
        dMax = Math.max(dMax, p.T, p.Te, p.Ts + p.e, p.Ts);
      });
      if (!isFinite(dMin)){ dMin = Tset - 1; dMax = Tset + 1; }
      var mid = (dMin + dMax) / 2, span = Math.max(1.8, (dMax - dMin) * 1.3 + 0.5);
      if (span > 34) span = 34;
      yLoD += ((mid - span / 2) - yLoD) * 0.055;
      yHiD += ((mid + span / 2) - yHiD) * 0.055;
      if (yHiD - yLoD < 0.9){ var mm = (yLoD + yHiD) / 2; yLoD = mm - 0.45; yHiD = mm + 0.45; }
      var yLo = yLoD, yHi = yHiD;
      function X(t){ return padL + (t - (tNow - 100)) / 100 * iw; }
      function Y(v){ return padT + (yHi - v) / (yHi - yLo) * ih; }
      function trace(get){
        ctx.beginPath();
        hist.forEach(function(p, ix){ var x = X(p.t), y = Y(get(p)); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
      ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var s = 0; s <= 100; s += 20){
        var x = padL + s / 100 * iw;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(s === 100 ? 't' : 't−' + (100 - s), x, H - 8);
      }
      var tStep = 10, stepOpts = [0.25, 0.5, 1, 2, 5, 10];
      for (var qi = 0; qi < stepOpts.length; qi++){ tStep = stepOpts[qi]; if (tStep >= (yHi - yLo) / 4) break; }
      for (var v = Math.ceil(yLo / tStep) * tStep; v <= yHi + 1e-9; v += tStep){
        var y = Y(v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText((tStep < 1 ? v.toFixed(1) : Math.round(v)) + '°', padL - 5, y + 4);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, iw, ih); ctx.clip();
      /* 1) mean — Newton exponential, white dashed, behind everything
            (dark halo underneath so the white dashes read on a light panel) */
      ctx.setLineDash([7, 5]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.30; ctx.lineWidth = 3.1;
      trace(function(p){ return p.Te; });
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = 1.7;
      trace(function(p){ return p.Te; });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* 2) envelope — dashed orange: T_s ± A e^(−t/τ) from the latest step */
      var hasEnv = false; hist.forEach(function(p){ if (p.e > 0.03) hasEnv = true; });
      if (hasEnv){
        ctx.strokeStyle = heat; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.65;
        trace(function(p){ return p.Ts + p.e; }); trace(function(p){ return p.Ts - p.e; });
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      /* 3) setpoint — centre line the envelope closes in on */
      ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      trace(function(p){ return p.Ts; });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* 4) actual temperature — the oscillator signal, solid orange */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.2;
      trace(function(p){ return p.T; });
      var last = hist[hist.length - 1];
      if (last){ ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(last.t), Y(last.T), 3.5, 0, 7); ctx.fill(); }
      ctx.restore();
      ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = heat;
      ctx.fillText('T — actual (oscillator)', padL + 6, padT + 12);
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('y: ' + yLo.toFixed(1) + '–' + yHi.toFixed(1) + '° · auto-zoom', padL + iw, padT + 12);
    }

    /* ---------- graph 2: normalised distribution ---------- */
    var gD = document.getElementById('gDist');
    var distTemps = [25, 30, 35, 40, 45, 50];
    var distColors = ['#3e7cb1', '#2e8b74', '#7fae2e', '#d9a404', '#e06a1b', '#c22e10'];
    var legend = document.getElementById('distLegend');
    distTemps.forEach(function(tp, i){
      var s = document.createElement('span');
      var sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = distColors[i];
      s.appendChild(sw); s.appendChild(document.createTextNode(tp + ' °C'));
      s.id = 'leg-' + tp;
      legend.appendChild(s);
    });
    function deltaOverH(Ts){ return 0.35 + 0.012 * (Ts - 20); }
    function drawDist(){
      var f = fitCanvas(gD), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line');
      ctx.clearRect(0, 0, W, H);
      var padL = 44, padR = 48, padT = 12, padB = 38;
      var iw = W - padL - padR, ih = H - padT - padB;
      /* axes flipped: height (depth z) along x, normalised temperature θ up y */
      function X(zf){ return padL + zf * iw; }
      function Y(th){ return padT + (1 - th) * ih; }
      ctx.font = '11px sans-serif'; ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
      [0, 0.5, 1].forEach(function(zf){
        var x = X(zf);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(zf === 0 ? '0 (top)' : (zf === 1 ? 'H (bottom)' : 'H/2'), x, H - 24);
      });
      [0, 0.25, 0.5, 0.75, 1].forEach(function(th){
        var y = Y(th);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(th.toFixed(2).replace('0.', '.'), padL - 5, y + 4);
      });
      /* right axis: the same y-axis also reads as normalised height. Height 0
         (top, z = 0) sits at θ = 1 and height H (bottom, z = H) at θ = 0.
         Height H/2 sits at θ(H/2) — not at 1/2, because the profile decays
         exponentially — and since θ(H/2) differs for every curve, the single
         H/2 label is placed at the average θ(H/2) across all the setpoint
         curves drawn. */
      var thMid = 0;
      distTemps.forEach(function(tp){
        var dd = deltaOverH(tp), eH = Math.exp(-1 / dd);
        thMid += (Math.exp(-0.5 / dd) - eH) / (1 - eH);
      });
      thMid /= distTemps.length;
      var xR = padL + iw;
      ctx.strokeStyle = muted; ctx.fillStyle = muted;
      ctx.beginPath(); ctx.moveTo(xR, padT); ctx.lineTo(xR, padT + ih); ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(0.5), Y(thMid)); ctx.lineTo(xR, Y(thMid)); ctx.stroke();
      ctx.setLineDash([]);
      [[1, '0'], [thMid, 'H/2'], [0, 'H']].forEach(function(mk){
        var y = Y(mk[0]);
        ctx.beginPath(); ctx.moveTo(xR, y); ctx.lineTo(xR + 4, y); ctx.stroke();
        ctx.textAlign = 'left'; ctx.fillText(mk[1], xR + 7, y + 4);
      });
      ctx.fillStyle = cssVar('--heat');
      ctx.beginPath(); ctx.arc(X(0.5), Y(thMid), 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.fillText('depth z — height down the tank', padL + iw / 2, H - 8);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText('normalised temperature θ', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(W - 5, padT + ih / 2); ctx.rotate(Math.PI / 2);
      ctx.fillText('normalised height', 0, 0); ctx.restore();
      distTemps.forEach(function(tp, i){
        var d = deltaOverH(tp), cur = Math.abs(tp - Tset) < 0.01;
        ctx.strokeStyle = distColors[i]; ctx.lineWidth = cur ? 3.4 : 1.6;
        ctx.globalAlpha = cur ? 1 : 0.75;
        ctx.beginPath();
        var eH = Math.exp(-1 / d);
        for (var s = 0; s <= 40; s++){
          var zf = s / 40, th = (Math.exp(-zf / d) - eH) / (1 - eH);
          s ? ctx.lineTo(X(zf), Y(th)) : ctx.moveTo(X(zf), Y(th));
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        var el = document.getElementById('leg-' + tp);
        if (el) el.style.fontWeight = cur ? '700' : '400';
      });
    }

    /* ---------- run ---------- */
    var lastMs = null, acc = 0;
    function frame(ms){
      if (lastMs === null) lastMs = ms;
      var dt = Math.min(0.1, (ms - lastMs) / 1000); lastMs = ms;
      tNow += dt;
      /* mean — Newton exponential (first-order): the simplification, swing removed */
      Tmean += (Tset - Tmean) * (1 - Math.exp(-dt / TAU));
      /* actual — damped oscillator toward the same setpoint, substepped:
         the underlying signal the exponential simplifies */
      var nSub = Math.max(1, Math.ceil(dt / 0.005)), hh = dt / nSub;
      for (var si = 0; si < nSub; si++){
        var acT = WN_T * WN_T * (Tset - Tact) - 2 * ZE_T * WN_T * Vact;
        Vact += acT * hh; Tact += Vact * hh;
      }
      acc += dt;
      if (acc >= 0.25){
        acc = 0;
        hist.push({ t: tNow, T: Tact, Te: Tmean, Ts: Tset, e: envNow(tNow) });
        while (hist.length && hist[0].t < tNow - 100.5) hist.shift();
      }
      /* readouts — Mean air temp reads the mean (exponential); state waits for the oscillator to settle too */
      roTemp.textContent = Tmean.toFixed(1) + ' °C';
      var err = Math.abs(Tset - Tmean);
      var steady = err < 0.05 && Math.abs(Tset - Tact) < 0.05 && envNow(tNow) < 0.1;
      roState.textContent = steady ? 'Steady state' : 'Transient';
      roState.className = 'v ' + (steady ? 'steady' : 'transient');
      var P = heaterPower();
      roPower.textContent = P.toFixed(1) + ' W';
      roPress.textContent = (101.325 * (Tmean + 273.15) / 298.15).toFixed(1) + ' kPa';
      /* panel glow + IR intensity follow heater output */
      var frac = P / PMAX;                       /* 0..1 — glow and rays follow actual heater output */
      var setFrac = (Tset - 20) / 30;            /* setpoint warmth, for the air tint only */
      var glow = frac;
      var rC = Math.round(87 + 140 * glow), gC = Math.round(31 + 60 * glow);
      panelGlow.setAttribute('fill', 'rgb(' + rC + ',' + gC + ',20)');
      rays.setAttribute('opacity', (0.85 * glow).toFixed(2));
      var ph = (ms / 900) % 1;
      rays.setAttribute('transform', 'translate(0,' + (ph * 10).toFixed(1) + ')');
      airTop.setAttribute('stop-opacity', (0.12 + 0.5 * setFrac).toFixed(2));
      airBot.setAttribute('stop-opacity', (0.02 + 0.06 * setFrac).toFixed(2));
      drawTransient();
      requestAnimationFrame(frame);
    }
    /* ---------- graph 3: log-stretched distribution — height along the bottom,
       theta log-squished on the right, theta linear on the left ---------- */
    var gLog = document.getElementById('gLogDist');
    function drawLogDist(){
      if (!gLog) return;
      var f = fitCanvas(gLog), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 52, padR = 56, padT = 12, padB = 34;
      var iw = W - padL - padR, ih = H - padT - padB;
      var lMin = -1.8, lMax = 0; /* log10 theta range: 0.016 .. 1 */
      /* height along the bottom, plain linear */
      function X(zf){ return padL + zf * iw; }
      /* normalised temperature up the side, log-squished (the right-hand scale) */
      function Y(th){ var l = Math.log10(Math.max(th, Math.pow(10, lMin))); return padT + (lMax - l) / (lMax - lMin) * ih; }
      /* the same theta on a plain linear scale (the left-hand scale) */
      function Ylin(th){ return padT + (1 - th) * ih; }
      /* anchor: average theta at H/2 across all curves — the chosen halfway point */
      var thMid = 0;
      distTemps.forEach(function(tp){
        var dd = deltaOverH(tp), eH = Math.exp(-1 / dd);
        thMid += (Math.exp(-0.5 / dd) - eH) / (1 - eH);
      });
      thMid /= distTemps.length;
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
      /* vertical gridlines: height, linear — 0, H/2, H evenly spaced along the bottom */
      ctx.strokeStyle = line; ctx.fillStyle = muted;
      [[0, '0 (top)'], [0.5, 'H/2'], [1, 'H (bottom)']].forEach(function(mk){
        var x = X(mk[0]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(mk[1], x, H - 18);
      });
      /* horizontal gridlines: theta at its log-squished positions (right-hand scale) */
      [0.02, 0.05, 0.1, 0.2, 0.5, 1].forEach(function(th){
        var y = Y(th);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
      });
      /* right axis: theta, log-squished — ticks at the log positions */
      var xR = padL + iw;
      ctx.strokeStyle = muted; ctx.fillStyle = muted;
      ctx.beginPath(); ctx.moveTo(xR, padT); ctx.lineTo(xR, padT + ih); ctx.stroke();
      [0.02, 0.05, 0.1, 0.2, 0.5, 1].forEach(function(th){
        var y = Y(th);
        ctx.beginPath(); ctx.moveTo(xR, y); ctx.lineTo(xR + 4, y); ctx.stroke();
        ctx.textAlign = 'left'; ctx.fillText(th < 1 ? String(th).replace('0.', '.') : '1', xR + 7, y + 4);
      });
      /* left axis: theta, plain linear — ticks evenly spaced, for comparison */
      ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + ih); ctx.stroke();
      [0, 0.25, 0.5, 0.75, 1].forEach(function(th){
        var y = Ylin(th);
        ctx.beginPath(); ctx.moveTo(padL - 4, y); ctx.lineTo(padL, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(th.toFixed(2).replace('0.', '.'), padL - 7, y + 4);
      });
      /* H/2 line — emphasised, sitting exactly halfway along the bottom */
      ctx.strokeStyle = muted; ctx.setLineDash([7, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(X(0.5), padT); ctx.lineTo(X(0.5), padT + ih); ctx.stroke();
      ctx.setLineDash([]);
      /* anchor line at theta(H/2) average, on the squished right-hand scale */
      ctx.strokeStyle = heat; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(padL, Y(thMid)); ctx.lineTo(padL + iw, Y(thMid)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = heat; ctx.textAlign = 'left';
      ctx.fillText('anchor θ(H/2) ≈ ' + thMid.toFixed(2), padL + 6, Y(thMid) - 6);
      /* the curves, stretched to match the squishing: height linear on x,
         theta log-squished on y — an exponential decay straightens out */
      distTemps.forEach(function(tp, i){
        var d = deltaOverH(tp), cur = Math.abs(tp - Tset) < 0.01;
        var eH = Math.exp(-1 / d);
        ctx.strokeStyle = distColors[i]; ctx.lineWidth = cur ? 3.4 : 1.6;
        ctx.globalAlpha = cur ? 1 : 0.75;
        ctx.beginPath();
        var started = false;
        for (var s = 0; s <= 80; s++){
          var zf = s / 80, th = (Math.exp(-zf / d) - eH) / (1 - eH);
          if (th < 0.017) break;
          var x = X(zf), y = Y(th);
          started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        /* dot where this curve crosses H/2 */
        var thH = (Math.exp(-0.5 / d) - eH) / (1 - eH);
        ctx.fillStyle = distColors[i];
        ctx.beginPath(); ctx.arc(X(0.5), Y(thH), cur ? 4.4 : 3.2, 0, Math.PI * 2); ctx.fill();
      });
      /* Bode straight-line (asymptotic) approximation, drawn OVER the curves:
         a horizontal dashed segment along the top (theta = 1) up to the
         corner at H/2, then a straight dashed segment downward after it.
         The corner where the two segments meet is the cutoff point. */
      var ink = cssVar('--ink');
      var cutX = X(0.5), cutY = Y(1);
      ctx.strokeStyle = ink; ctx.setLineDash([8, 5]); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(padL, cutY); ctx.lineTo(cutX, cutY); ctx.lineTo(X(1), Y(0.02)); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(cutX, cutY, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 12.5px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('cutoff point', cutX - 10, cutY + 17);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('height — linear', padL + iw / 2, H - 4);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText('normalised temperature θ — linear', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(W - 4, padT + ih / 2); ctx.rotate(Math.PI / 2);
      ctx.fillText('normalised temperature θ — log scale (squished)', 0, 0); ctx.restore();
    }

    drawDist();
    drawLogDist();
    requestAnimationFrame(frame);
    window.addEventListener('resize', function(){ drawDist(); drawLogDist(); });
  })();

/* ===== original page script 2 ===== */
(function(){
    "use strict";
    var TAU_AIR = 18, TAU_W = 110, PMAX = 24;
    var slider = document.getElementById('tempSliderW');
    if(!slider) return;
    var setVal = document.getElementById('setValW');
    var Tset = parseFloat(slider.value);
    var TaE = Tset, TwE = Tset;              /* Newton exponentials — the simplified solution */
    var Tair = Tset, Twat = Tset;            /* actual temperatures — damped oscillation */
    var Va = 0, Vw = 0;                      /* dT/dt of the actual temperatures */
    var WN_A = 0.55, ZE_A = 0.12;            /* air: swing period ≈ 11 s, envelope tau ≈ 15 s */
    var WN_W = 0.28, ZE_W = 0.15;            /* water: slower swing ≈ 22 s, envelope tau ≈ 24 s */
    var stepT = -1000, ampA = 0, ampW = 0;   /* latest setpoint step, for the envelopes */
    var tNow = 0, hist = [];
    function envAt(amp, ze, wn, t){ if(!amp) return 0; var age = t - stepT; return age <= 0 ? amp : amp * Math.exp(-ze * wn * age); }
    for (var i = 100; i >= 0; i--) hist.push({t:-i*0.5, Ta:Tair, Tw:Twat, TaE:TaE, TwE:TwE, Ts:Tset, eA:0, eW:0});
    var roAir=document.getElementById('roAirW'), roWat=document.getElementById('roWaterW'),
        roState=document.getElementById('roStateW'), roPow=document.getElementById('roPowerW'),
        rays=document.getElementById('raysW'), glowEl=document.getElementById('panelGlowW'),
        airTop=document.getElementById('airTopW'), watTop=document.getElementById('watTopW'),
        wline=document.getElementById('waterLineW');
    slider.addEventListener('input', function(){ var nv=parseFloat(slider.value); if(nv!==Tset){ stepT=tNow; ampA=Math.abs(Tair-nv); ampW=Math.abs(Twat-nv); } Tset=nv; setVal.textContent=Tset.toFixed(1)+'°'; drawDistW(); });
    function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function fit(cv){ var r=cv.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
      var w=Math.max(200,Math.round(r.width)), h=230;
      if(cv.width!==w*dpr||cv.height!==h*dpr){ cv.width=w*dpr; cv.height=h*dpr; }
      var c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); return {ctx:c,w:w,h:h}; }
    var gT=document.getElementById('gTransientW');
    var yLoD=19, yHiD=31; /* displayed axis limits — eased toward the data: auto-zoom + recentre */
    function drawTransW(){
      var f=fit(gT), ctx=f.ctx, W=f.w, H=f.h;
      var muted=cssVar('--muted'), line=cssVar('--line'), ink=cssVar('--ink'), heat=cssVar('--heat');
      var blue='#3e7cb1';
      ctx.clearRect(0,0,W,H);
      var padL=40,padR=8,padT=16,padB=24, iw=W-padL-padR, ih=H-padT-padB;
      /* auto-zoom / recentre: the target axis brackets everything drawn — both curves,
         both exponentials, both envelopes and the setpoint — with a little headroom */
      var dMin=Infinity, dMax=-Infinity;
      hist.forEach(function(p){
        dMin=Math.min(dMin,p.Ta,p.Tw,p.TaE,p.TwE,p.Ts-p.eA,p.Ts-p.eW);
        dMax=Math.max(dMax,p.Ta,p.Tw,p.TaE,p.TwE,p.Ts+p.eA,p.Ts+p.eW);
      });
      if(!isFinite(dMin)){ dMin=Tset-1; dMax=Tset+1; }
      var mid=(dMin+dMax)/2, span=Math.max(1.8,(dMax-dMin)*1.3+0.5);
      if(span>34) span=34;
      yLoD+=((mid-span/2)-yLoD)*0.055;
      yHiD+=((mid+span/2)-yHiD)*0.055;
      if(yHiD-yLoD<0.9){ var mm=(yLoD+yHiD)/2; yLoD=mm-0.45; yHiD=mm+0.45; }
      var yLo=yLoD, yHi=yHiD;
      function X(t){ return padL+(t-(tNow-100))/100*iw; }
      function Y(v){ return padT+(yHi-v)/(yHi-yLo)*ih; }
      function trace(get){
        ctx.beginPath();
        hist.forEach(function(p,ix){ var x=X(p.t),y=Y(get(p)); ix?ctx.lineTo(x,y):ctx.moveTo(x,y); });
        ctx.stroke();
      }
      /* grid: time every 20 s; temperature ticks adapt to the zoomed span */
      ctx.font='11px sans-serif'; ctx.lineWidth=1;
      ctx.strokeStyle=line; ctx.fillStyle=muted;
      for(var sc=0; sc<=100; sc+=20){ var x=padL+sc/100*iw; ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+ih); ctx.stroke(); ctx.textAlign='center'; ctx.fillText(sc===100?'t':'t\u2212'+(100-sc), x, H-8); }
      var tStep=10, stepOpts=[0.25,0.5,1,2,5,10];
      for(var qi=0; qi<stepOpts.length; qi++){ tStep=stepOpts[qi]; if(tStep>=(yHi-yLo)/4) break; }
      for(var v=Math.ceil(yLo/tStep)*tStep; v<=yHi+1e-9; v+=tStep){ var y=Y(v); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+iw,y); ctx.stroke(); ctx.textAlign='right'; ctx.fillText((tStep<1?v.toFixed(1):Math.round(v))+'\u00b0', padL-5, y+4); }
      /* curves clipped to the plot area while the axis is still easing toward its target */
      ctx.save(); ctx.beginPath(); ctx.rect(padL,padT,iw,ih); ctx.clip();
      /* 1) Newton exponentials — white dashed, behind everything.
            A thin dark halo is drawn under the white so the white dashes still read on a light panel. */
      [function(p){return p.TaE;}, function(p){return p.TwE;}].forEach(function(get){
        ctx.setLineDash([7,5]); ctx.strokeStyle=ink; ctx.globalAlpha=0.30; ctx.lineWidth=3.1; trace(get);
        ctx.strokeStyle='#ffffff'; ctx.globalAlpha=1; ctx.lineWidth=1.7; trace(get);
        ctx.setLineDash([]); ctx.globalAlpha=1;
      });
      /* 2) envelopes — dashed, same colour as their own curve: T_s \u00b1 A e^(\u2212t/\u03c4) from the latest step */
      var hasEnv=false; hist.forEach(function(p){ if(p.eA>0.03||p.eW>0.03) hasEnv=true; });
      if(hasEnv){
        ctx.setLineDash([6,4]); ctx.lineWidth=1.2; ctx.globalAlpha=0.65;
        ctx.strokeStyle=heat; trace(function(p){return p.Ts+p.eA;}); trace(function(p){return p.Ts-p.eA;});
        ctx.strokeStyle=blue; trace(function(p){return p.Ts+p.eW;}); trace(function(p){return p.Ts-p.eW;});
        ctx.setLineDash([]); ctx.globalAlpha=1;
      }
      /* 3) setpoint — the centre line the envelopes close in on */
      ctx.strokeStyle=muted; ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.globalAlpha=0.7;
      trace(function(p){return p.Ts;});
      ctx.setLineDash([]); ctx.globalAlpha=1;
      /* 4) the actual oscillating temperatures — solid, orange for air, blue for water */
      ctx.lineWidth=2.2; ctx.strokeStyle=heat; trace(function(p){return p.Ta;});
      ctx.strokeStyle=blue; trace(function(p){return p.Tw;});
      var last=hist[hist.length-1];
      if(last){
        ctx.fillStyle=heat; ctx.beginPath(); ctx.arc(X(last.t),Y(last.Ta),3.5,0,7); ctx.fill();
        ctx.fillStyle=blue; ctx.beginPath(); ctx.arc(X(last.t),Y(last.Tw),3.5,0,7); ctx.fill();
      }
      ctx.restore();
      /* labels + the live axis range, so the zoom itself is visible */
      ctx.textAlign='left'; ctx.font='bold 11px sans-serif';
      ctx.fillStyle=heat; ctx.fillText('T_air', padL+6, padT+12);
      ctx.fillStyle=blue; ctx.fillText('T_water', padL+48, padT+12);
      ctx.fillStyle=muted; ctx.font='11px sans-serif'; ctx.textAlign='right';
      ctx.fillText('y: '+yLo.toFixed(1)+'\u2013'+yHi.toFixed(1)+'\u00b0 \u00b7 auto-zoom', padL+iw, padT+12);
    }
    var gD=document.getElementById('gDistW');
    function drawDistW(){
      var f=fit(gD), ctx=f.ctx, W=f.w, H=f.h;
      var muted=cssVar('--muted'), line=cssVar('--line');
      ctx.clearRect(0,0,W,H);
      var padL=44,padR=10,padT=12,padB=26, iw=W-padL-padR, ih=H-padT-padB;
      var surf=0.55; /* water level at 55% of depth */
      function X(th){ return padL+th*iw; } function Y(z){ return padT+z*ih; }
      ctx.font='11px sans-serif'; ctx.strokeStyle=line; ctx.fillStyle=muted; ctx.lineWidth=1;
      [0,0.5,1].forEach(function(th){ var x=X(th); ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+ih); ctx.stroke(); ctx.textAlign='center'; ctx.fillText(th.toFixed(1), x, H-9); });
      /* water level line */
      ctx.strokeStyle='#3e7cb1'; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(padL,Y(surf)); ctx.lineTo(padL+iw,Y(surf)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#3e7cb1'; ctx.textAlign='left'; ctx.fillText('water level', padL+6, Y(surf)-6);
      ctx.fillStyle=muted; ctx.fillText('air', padL+6, padT+14); ctx.fillText('water', padL+6, Y(surf)+18);
      /* profile: exponential in air to surface value, then slow decay in water */
      var dAir=0.30+0.010*(Tset-20), thS=Math.exp(-surf/dAir);
      ctx.strokeStyle=cssVar('--heat'); ctx.lineWidth=2.6; ctx.beginPath();
      for(var k=0;k<=60;k++){ var z=k/60, th;
        if(z<=surf){ th=Math.exp(-z/dAir); }
        else { th=thS*Math.exp(-(z-surf)/0.9); }
        k?ctx.lineTo(X(th),Y(z)):ctx.moveTo(X(th),Y(z)); }
      ctx.stroke();
      drawLogW();
    }
    var gLogW=document.getElementById('gLogDistW');
    function drawLogW(){
      if(!gLogW) return;
      var f=fit(gLogW), ctx=f.ctx, W=f.w, H=f.h;
      var muted=cssVar('--muted'), line=cssVar('--line'), heat=cssVar('--heat');
      ctx.clearRect(0,0,W,H);
      var padL=52,padR=56,padT=12,padB=34, iw=W-padL-padR, ih=H-padT-padB;
      var surf=0.55;
      var lMin=-1.15, lMax=0; /* log10 theta range: ~0.07 .. 1 */
      /* height along the bottom, plain linear */
      function X(z){ return padL+z*iw; }
      /* normalised temperature up the side, log-squished (the right-hand scale) */
      function Y(th){ var l=Math.log10(Math.max(th, Math.pow(10,lMin))); return padT+(lMax-l)/(lMax-lMin)*ih; }
      /* the same theta on a plain linear scale (the left-hand scale) */
      function Ylin(th){ return padT+(1-th)*ih; }
      function thetaAt(z, dAir, thS){ return z<=surf ? Math.exp(-z/dAir) : thS*Math.exp(-(z-surf)/0.9); }
      var dAir=0.30+0.010*(Tset-20), thS=Math.exp(-surf/dAir);
      var thHalf=thetaAt(0.5, dAir, thS);
      ctx.font='11px sans-serif'; ctx.lineWidth=1;
      /* vertical gridlines: height, linear — 0, H/2, H evenly spaced along the bottom */
      ctx.strokeStyle=line; ctx.fillStyle=muted;
      [[0,'0 (top)'],[0.5,'H/2'],[1,'H (bottom)']].forEach(function(mk){
        var x=X(mk[0]);
        ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+ih); ctx.stroke();
        ctx.textAlign='center'; ctx.fillText(mk[1], x, H-18);
      });
      /* horizontal gridlines: theta at its log-squished positions (right-hand scale) */
      [0.1,0.2,0.5,1].forEach(function(th){
        var y=Y(th);
        ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+iw,y); ctx.stroke();
      });
      /* right axis: theta, log-squished — ticks at the log positions */
      var xR=padL+iw;
      ctx.strokeStyle=muted; ctx.fillStyle=muted;
      ctx.beginPath(); ctx.moveTo(xR,padT); ctx.lineTo(xR,padT+ih); ctx.stroke();
      [0.1,0.2,0.5,1].forEach(function(th){
        var y=Y(th);
        ctx.beginPath(); ctx.moveTo(xR,y); ctx.lineTo(xR+4,y); ctx.stroke();
        ctx.textAlign='left'; ctx.fillText(th<1?String(th).replace('0.','.'): '1', xR+7, y+4);
      });
      /* left axis: theta, plain linear — ticks evenly spaced, for comparison */
      ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+ih); ctx.stroke();
      [0,0.25,0.5,0.75,1].forEach(function(th){
        var y=Ylin(th);
        ctx.beginPath(); ctx.moveTo(padL-4,y); ctx.lineTo(padL,y); ctx.stroke();
        ctx.textAlign='right'; ctx.fillText(th.toFixed(2).replace('0.','.'), padL-7, y+4);
      });
      /* water level — now a vertical line, since height runs along the bottom */
      ctx.strokeStyle='#3e7cb1'; ctx.setLineDash([6,4]); ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(X(surf),padT); ctx.lineTo(X(surf),padT+ih); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#3e7cb1'; ctx.textAlign='left'; ctx.fillText('water level', X(surf)+6, padT+14);
      ctx.fillStyle=muted; ctx.fillText('air', padL+6, padT+14); ctx.fillText('water', X(surf)+6, padT+30);
      /* H/2 line — emphasised, exactly halfway along the bottom */
      ctx.strokeStyle=muted; ctx.setLineDash([7,4]); ctx.lineWidth=1.3;
      ctx.beginPath(); ctx.moveTo(X(0.5),padT); ctx.lineTo(X(0.5),padT+ih); ctx.stroke(); ctx.setLineDash([]);
      /* anchor line at theta(H/2), on the squished right-hand scale */
      ctx.strokeStyle=heat; ctx.setLineDash([5,4]); ctx.lineWidth=1.3;
      ctx.beginPath(); ctx.moveTo(padL,Y(thHalf)); ctx.lineTo(padL+iw,Y(thHalf)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=heat; ctx.textAlign='left';
      ctx.fillText('anchor θ(H/2) ≈ '+thHalf.toFixed(2), padL+6, Y(thHalf)-6);
      /* the profile, stretched to match the squishing */
      ctx.strokeStyle=heat; ctx.lineWidth=2.6; ctx.beginPath();
      for(var k=0;k<=80;k++){ var z=k/80, th=thetaAt(z,dAir,thS);
        k?ctx.lineTo(X(z),Y(th)):ctx.moveTo(X(z),Y(th)); }
      ctx.stroke();
      /* anchor dot at H/2 */
      ctx.fillStyle=heat; ctx.beginPath(); ctx.arc(X(0.5),Y(thHalf),4.4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=muted; ctx.textAlign='center';
      ctx.fillText('height — linear', padL+iw/2, H-4);
      ctx.save(); ctx.translate(12,padT+ih/2); ctx.rotate(-Math.PI/2);
      ctx.fillText('normalised temperature θ — linear',0,0); ctx.restore();
      ctx.save(); ctx.translate(W-4,padT+ih/2); ctx.rotate(Math.PI/2);
      ctx.fillText('normalised temperature θ — log scale (squished)',0,0); ctx.restore();
    }
    var lastMs=null, acc=0;
    function frame(ms){
      if(lastMs===null) lastMs=ms;
      var dt=Math.min(0.1,(ms-lastMs)/1000); lastMs=ms; tNow+=dt;
      /* Newton exponentials — first-order, no oscillation (the white dashed curves) */
      TaE += (Tset-TaE)*(1-Math.exp(-dt/TAU_AIR));
      TwE += (TaE-TwE)*(1-Math.exp(-dt/TAU_W));
      /* actual temperatures — second-order damped oscillation toward the same targets, substepped */
      var nSub=Math.max(1,Math.ceil(dt/0.005)), hh=dt/nSub;
      for(var si=0; si<nSub; si++){
        var acA=WN_A*WN_A*(Tset-Tair)-2*ZE_A*WN_A*Va; Va+=acA*hh; Tair+=Va*hh;
        var acW=WN_W*WN_W*(Tair-Twat)-2*ZE_W*WN_W*Vw; Vw+=acW*hh; Twat+=Vw*hh;
      }
      acc+=dt;
      if(acc>=0.25){ acc=0; hist.push({t:tNow,Ta:Tair,Tw:Twat,TaE:TaE,TwE:TwE,Ts:Tset,eA:envAt(ampA,ZE_A,WN_A,tNow),eW:envAt(ampW,ZE_W,WN_W,tNow)}); while(hist.length&&hist[0].t<tNow-100.5) hist.shift(); }
      roAir.textContent=Tair.toFixed(1)+' °C'; roWat.textContent=Twat.toFixed(1)+' °C';
      var steady=Math.abs(Tset-Twat)<0.05 && envAt(ampW,ZE_W,WN_W,tNow)<0.1;
      roState.textContent=steady?'Steady state':'Transient'; roState.className='v '+(steady?'steady':'transient');
      var err=Tset-TaE, P=err<=0?0:PMAX*Math.min(1,err/3);
      roPow.textContent=P.toFixed(1)+' W';
      var frac=P/PMAX;
      glowEl.setAttribute('fill','rgb('+Math.round(87+140*frac)+','+Math.round(31+60*frac)+',20)');
      rays.setAttribute('opacity',(0.85*frac).toFixed(2));
      rays.setAttribute('transform','translate(0,'+(((ms/900)%1)*10).toFixed(1)+')');
      airTop.setAttribute('stop-opacity',(0.10+0.35*frac).toFixed(2));
      watTop.setAttribute('stop-opacity',(0.10+0.30*frac).toFixed(2));
      var wob=Math.sin(ms/700)*2.2*(0.4+frac);
      wline.setAttribute('transform','translate(0,'+wob.toFixed(1)+')');
      drawTransW();
      requestAnimationFrame(frame);
    }
    drawDistW();
    requestAnimationFrame(frame);
    window.addEventListener('resize', drawDistW);
  })();

/* ===== original page script 3 ===== */
(function(){
    "use strict";
    /* ---------- live spring -> graph (Water Level tab, beside the oscillation graph) ---------- */
    var mainSlider = document.getElementById('tempSliderW');
    var springSlider = document.getElementById('tempSliderSpring');
    var coil = document.getElementById('springCoil');
    if (!mainSlider || !springSlider || !coil) return;
    var setValEl = document.getElementById('springSetVal'),
        tRead = document.getElementById('springTRead'),
        tsRead = document.getElementById('springTsRead'),
        targetLine = document.getElementById('springTargetLine'),
        targetLabel = document.getElementById('springTargetLabel'),
        massBar = document.getElementById('springMassBar'),
        waterRect = document.getElementById('springWater'),
        currentLabel = document.getElementById('springCurrentLabel'),
        cv = document.getElementById('gSpring');

    var WN = 1.8;        /* rad/s — swing period ≈ 3.5 s */
    var ZETA = 0.14;     /* damping — envelope tau = 1/(ZETA*WN) ≈ 4 s */
    var Ts = parseFloat(mainSlider.value);   /* target: T_s */
    var T = Ts;                              /* current: T (starts settled) */
    var V = 0;                               /* dT/dt */
    var tNow = 0, hist = [];
    for (var i = 180; i >= 0; i--) hist.push({ t: -i * 0.2, T: T, Ts: Ts });
    var stepT = -100, stepAmp = 0;           /* last setpoint step, for the envelope */

    function tempToY(v){ return 260 - (v - 20) / 30 * 210; }  /* matches the SVG axis: 50° -> 50, 20° -> 260 */

    function setTarget(v, fromMain){
      v = Math.round(v * 2) / 2;
      if (v !== Ts){ stepAmp = T - v; stepT = tNow; }
      Ts = v;
      if (!fromMain) springSlider.value = v;
      setValEl.textContent = v.toFixed(1) + '°';
      tsRead.innerHTML = 'T<sub>s</sub> = ' + v.toFixed(1) + ' °C';
    }
    /* the tab's main slider drives the spring */
    mainSlider.addEventListener('input', function(){ setTarget(parseFloat(mainSlider.value), false); });
    /* the slider beside the animation drives both */
    springSlider.addEventListener('input', function(){
      var v = parseFloat(springSlider.value);
      setTarget(v, true);
      if (parseFloat(mainSlider.value) !== v){
        mainSlider.value = v;
        mainSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    setTarget(Ts, false);

    function coilPath(yBot){
      var cx = 130, top = 42, half = 19, coils = 8;
      var coilTop = top + 10, coilBot = yBot - 8;
      var pts = [[cx, top], [cx, coilTop]];
      var n = coils * 2;
      for (var k = 1; k < n; k++){
        pts.push([cx + (k % 2 ? half : -half), coilTop + (coilBot - coilTop) * k / n]);
      }
      pts.push([cx, coilBot], [cx, yBot]);
      return 'M' + pts.map(function(p){ return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
    }

    function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function fit(){
      var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var w = Math.max(220, Math.round(r.width)), h = 300;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = w * dpr; cv.height = h * dpr; }
      var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: c, w: w, h: h };
    }

    function drawGraph(){
      var f = fit(), ctx = f.ctx, W = f.w, H = f.h;
      var ink = cssVar('--ink'), muted = cssVar('--muted'), line = cssVar('--line'), heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 36, padR = 10, padT = 12, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
      var WIN = 36, yLo = 19, yHi = 51;
      function X(t){ return padL + (t - (tNow - WIN)) / WIN * iw; }
      function Y(v){ return padT + (yHi - v) / (yHi - yLo) * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
      /* grid */
      ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var s = 0; s <= WIN; s += 6){
        var gx = padL + s / WIN * iw;
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(s === WIN ? 't' : 't−' + (WIN - s), gx, H - 8);
      }
      [20, 30, 40, 50].forEach(function(v){
        var gy = Y(v);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + iw, gy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(v + '°', padL - 5, gy + 4);
      });
      /* envelope of the latest step: T_s ± A e^{-(t-stepT)/tau} */
      if (stepAmp !== 0 && tNow - stepT < 30){
        ctx.strokeStyle = heat; ctx.globalAlpha = 0.45; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
        [1, -1].forEach(function(sg){
          ctx.beginPath();
          var started = false;
          for (var t = Math.max(stepT, tNow - WIN); t <= tNow; t += 0.25){
            var ev = Ts + sg * stepAmp * Math.exp(-ZETA * WN * (t - stepT));
            var x = X(t), y = Y(ev);
            started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
          }
          ctx.stroke();
        });
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      /* T_s target (dashed) — steps in the history included */
      ctx.strokeStyle = muted; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(p.Ts); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      /* T (solid) — drawn live from the spring */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.4; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(p.T); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      /* guide line + dot at the spring's current end */
      var last = hist[hist.length - 1];
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, Y(last.T)); ctx.lineTo(X(last.t), Y(last.T)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(last.t), Y(last.T), 4, 0, 7); ctx.fill();
      /* labels */
      ctx.textAlign = 'left'; ctx.font = 'bold 11.5px sans-serif'; ctx.fillStyle = heat;
      ctx.fillText('T', padL + 6, padT + 13);
      ctx.fillStyle = muted; ctx.font = '11.5px sans-serif';
      ctx.fillText('— live from the spring', padL + 20, padT + 13);
      ctx.fillText('T_s — target', padL + 6, padT + 29);
      /* phasor: rotating vector whose height is T - T_s */
      var d = T - Ts, q = -V / WN;
      var mag = Math.sqrt(d * d + q * q);
      var cx = W - 46, cy = padT + 34, R = 28;
      var sc = mag > 0.01 ? Math.min(R / mag, 2.2) : 2.2;
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.strokeStyle = muted; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke(); ctx.setLineDash([]);
      if (mag > 0.05){
        var px = cx + q * sc, py = cy - d * sc;
        ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.strokeStyle = heat; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx + R + 6, py); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 7); ctx.fill();
      }
      ctx.fillStyle = muted; ctx.font = '10.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('phasor', cx, cy + R + 13);
      ctx.fillText('time →', padL + iw, H - 8);
    }

    var lastMs = null, acc = 0;
    function frame(ms){
      if (lastMs === null) lastMs = ms;
      var dt = Math.min(0.05, (ms - lastMs) / 1000); lastMs = ms;
      /* damped spring toward T_s — substepped for stability */
      var steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
      for (var k = 0; k < steps; k++){
        var a = -WN * WN * (T - Ts) - 2 * ZETA * WN * V;
        V += a * h; T += V * h; tNow += h;
      }
      acc += dt;
      if (acc >= 0.05){
        acc = 0;
        hist.push({ t: tNow, T: T, Ts: Ts });
        while (hist.length && hist[0].t < tNow - 37) hist.shift();
      }
      /* spring drawing */
      var yT = tempToY(T), yTs = tempToY(Ts);
      coil.setAttribute('d', coilPath(yT));
      massBar.setAttribute('y', (yT - 5).toFixed(1));
      waterRect.setAttribute('y', (yT + 5).toFixed(1));
      waterRect.setAttribute('height', Math.max(0, 268 - (yT + 5)).toFixed(1));
      currentLabel.setAttribute('y', (yT + 4).toFixed(1));
      targetLine.setAttribute('y1', yTs.toFixed(1)); targetLine.setAttribute('y2', yTs.toFixed(1));
      targetLabel.setAttribute('y', (yTs - 7).toFixed(1));
      tRead.textContent = 'T = ' + T.toFixed(1) + ' °C';
      drawGraph();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

/* ===== original page script 4 ===== */
(function(){
    "use strict";
    /* ---------- H2O partition: equilibrium graph + live partition spring (Water Level tab) ---------- */
    var mainSlider = document.getElementById('tempSliderW');
    var ownSlider = document.getElementById('tempSliderH');
    var coil = document.getElementById('springCoilH');
    if (!mainSlider || !ownSlider || !coil) return;
    var setValEl = document.getElementById('hSetVal'),
        gasRead = document.getElementById('hGasRead'),
        liqRead = document.getElementById('hLiqRead'),
        targetLine = document.getElementById('springTargetLineH'),
        targetLabel = document.getElementById('springTargetLabelH'),
        massBar = document.getElementById('springMassBarH'),
        waterRect = document.getElementById('springWaterH'),
        currentLabel = document.getElementById('springCurrentLabelH'),
        cvEq = document.getElementById('gH2O'),
        cv = document.getElementById('gSpringH');

    function gasEq(T){ return 2.0 * Math.exp(0.065 * (T - 25)); }  /* % of total H2O in the air at saturation */
    function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function fitC(cnv, hCss){
      var r = cnv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var w = Math.max(220, Math.round(r.width)), h = hCss;
      if (cnv.width !== Math.round(w * dpr) || cnv.height !== Math.round(h * dpr)){ cnv.width = w * dpr; cnv.height = h * dpr; }
      var c = cnv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: c, w: w, h: h };
    }

    var Ts = parseFloat(mainSlider.value);

    /* ----- equilibrium overlay: liquid & gas vs temperature, total dashed ----- */
    function drawEq(){
      if (!cvEq) return;
      var f = fitC(cvEq, 230), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 40, padR = 12, padT = 12, padB = 26, iw = W - padL - padR, ih = H - padT - padB;
      function X(T){ return padL + (T - 20) / 30 * iw; }
      function Y(v){ return padT + (105 - v) / 105 * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
      ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var T = 20; T <= 50; T += 5){
        var gx = X(T);
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(T + '°', gx, H - 9);
      }
      [0, 25, 50, 75, 100].forEach(function(v){
        var gy = Y(v);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + iw, gy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(v + '%', padL - 5, gy + 4);
      });
      /* current setpoint marker */
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.55; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(X(Ts), padT); ctx.lineTo(X(Ts), padT + ih); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* H2O total — dashed, constant */
      ctx.strokeStyle = ink; ctx.setLineDash([7, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(padL + iw, Y(100)); ctx.stroke(); ctx.setLineDash([]);
      /* H2O liquid */
      ctx.strokeStyle = '#3e7cb1'; ctx.lineWidth = 2.4; ctx.beginPath();
      for (var k = 0; k <= 60; k++){ var T2 = 20 + 30 * k / 60, v = 100 - gasEq(T2); k ? ctx.lineTo(X(T2), Y(v)) : ctx.moveTo(X(T2), Y(v)); }
      ctx.stroke();
      /* H2O gas */
      ctx.strokeStyle = heat; ctx.beginPath();
      for (var j = 0; j <= 60; j++){ var T3 = 20 + 30 * j / 60, g = gasEq(T3); j ? ctx.lineTo(X(T3), Y(g)) : ctx.moveTo(X(T3), Y(g)); }
      ctx.stroke();
      /* dots at the current setpoint: read off the split */
      var gNow = gasEq(Ts);
      ctx.fillStyle = '#3e7cb1'; ctx.beginPath(); ctx.arc(X(Ts), Y(100 - gNow), 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(Ts), Y(gNow), 4.5, 0, 7); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = 'bold 11.5px sans-serif';
      ctx.fillStyle = '#3e7cb1'; ctx.fillText('H₂O liquid ' + (100 - gNow).toFixed(1) + '%', padL + 8, padT + 14);
      ctx.fillStyle = heat; ctx.fillText('H₂O gas ' + gNow.toFixed(1) + '%', padL + 8, padT + ih - 8);
      ctx.fillStyle = ink; ctx.fillText('H₂O total 100% — dashed', padL + iw - 150, Y(100) - 7);
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('temperature →', padL + iw, H - 9);
    }

    /* ----- live partition spring ----- */
    var WN = 1.7, ZETA = 0.16;
    var Geq = gasEq(Ts), G = Geq, V = 0;
    var tNow = 0, hist = [];
    for (var i = 180; i >= 0; i--) hist.push({ t: -i * 0.2, G: G, Geq: Geq });

    function gasToY(g){ return 260 - Math.max(0, Math.min(12, g)) / 12 * 210; }
    function setTarget(v, fromMain){
      v = Math.round(v * 2) / 2;
      Ts = v; Geq = gasEq(v);
      if (!fromMain) ownSlider.value = v;
      setValEl.textContent = v.toFixed(1) + '°';
      drawEq();
    }
    mainSlider.addEventListener('input', function(){ setTarget(parseFloat(mainSlider.value), false); });
    ownSlider.addEventListener('input', function(){
      var v = parseFloat(ownSlider.value);
      setTarget(v, true);
      if (parseFloat(mainSlider.value) !== v){
        mainSlider.value = v;
        mainSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    setTarget(Ts, false);

    function coilPath(yBot){
      var cx = 130, top = 42, half = 19, coils = 8;
      var coilTop = top + 10, coilBot = yBot - 8;
      var pts = [[cx, top], [cx, coilTop]];
      var n = coils * 2;
      for (var k = 1; k < n; k++) pts.push([cx + (k % 2 ? half : -half), coilTop + (coilBot - coilTop) * k / n]);
      pts.push([cx, coilBot], [cx, yBot]);
      return 'M' + pts.map(function(p){ return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L');
    }

    function drawGraph(){
      var f = fitC(cv, 300), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 38, padR = 10, padT = 12, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
      var WIN = 36;
      function X(t){ return padL + (t - (tNow - WIN)) / WIN * iw; }
      function Y(v){ return padT + (105 - v) / 105 * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
      ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var s = 0; s <= WIN; s += 6){
        var gx = padL + s / WIN * iw;
        ctx.beginPath(); ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(s === WIN ? 't' : 't−' + (WIN - s), gx, H - 8);
      }
      [0, 25, 50, 75, 100].forEach(function(v){
        var gy = Y(v);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + iw, gy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(v + '%', padL - 5, gy + 4);
      });
      /* target gas share (faint dashed) */
      ctx.strokeStyle = heat; ctx.globalAlpha = 0.5; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(p.Geq); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* H2O total — dashed, constant */
      ctx.strokeStyle = ink; ctx.setLineDash([7, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(padL, Y(100)); ctx.lineTo(padL + iw, Y(100)); ctx.stroke(); ctx.setLineDash([]);
      /* H2O liquid — mirrors the gas exactly */
      ctx.strokeStyle = '#3e7cb1'; ctx.lineWidth = 2.4; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(100 - p.G); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      /* H2O gas — drawn live from the spring */
      ctx.strokeStyle = heat; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(p.G); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      var last = hist[hist.length - 1];
      ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(last.t), Y(last.G), 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#3e7cb1'; ctx.beginPath(); ctx.arc(X(last.t), Y(100 - last.G), 4, 0, 7); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = 'bold 11.5px sans-serif';
      ctx.fillStyle = '#3e7cb1'; ctx.fillText('H₂O liquid ' + (100 - G).toFixed(1) + '%', padL + 6, padT + 13);
      ctx.fillStyle = ink; ctx.fillText('H₂O total 100% — dashed', padL + 6, Y(100) - 7);
      ctx.fillStyle = heat; ctx.fillText('H₂O gas ' + G.toFixed(1) + '% — live from the spring', padL + 6, padT + ih - 8);
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('time →', padL + iw, H - 8);
    }

    var lastMs = null, acc = 0, eqTick = 0;
    function frame(ms){
      if (lastMs === null) lastMs = ms;
      var dt = Math.min(0.05, (ms - lastMs) / 1000); lastMs = ms;
      eqTick += dt;
      if (eqTick > 0.5){ eqTick = 0; drawEq(); }
      var steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
      for (var k = 0; k < steps; k++){
        var a = -WN * WN * (G - Geq) - 2 * ZETA * WN * V;
        V += a * h; G += V * h; tNow += h;
        if (G < 0.05){ G = 0.05; if (V < 0) V = 0; }
        if (G > 13){ G = 13; if (V > 0) V = 0; }
      }
      acc += dt;
      if (acc >= 0.05){
        acc = 0;
        hist.push({ t: tNow, G: G, Geq: Geq });
        while (hist.length && hist[0].t < tNow - 37) hist.shift();
      }
      var yG = gasToY(G), yGeq = gasToY(Geq);
      coil.setAttribute('d', coilPath(yG));
      massBar.setAttribute('y', (yG - 5).toFixed(1));
      waterRect.setAttribute('y', (yG + 5).toFixed(1));
      waterRect.setAttribute('height', Math.max(0, 268 - (yG + 5)).toFixed(1));
      currentLabel.setAttribute('y', (yG + 4).toFixed(1));
      targetLine.setAttribute('y1', yGeq.toFixed(1)); targetLine.setAttribute('y2', yGeq.toFixed(1));
      targetLabel.setAttribute('y', (yGeq - 7).toFixed(1));
      gasRead.textContent = 'H₂O gas = ' + G.toFixed(1) + '%';
      liqRead.textContent = 'H₂O liquid = ' + (100 - G).toFixed(1) + '%';
      drawGraph();
      requestAnimationFrame(frame);
    }
    drawEq();
    requestAnimationFrame(frame);
    window.addEventListener('resize', drawEq);
  })();

/* ===== original page script 5 ===== */
(function(){
    "use strict";
    /* ---------- Note, Temperature tab: particle diagram + Boltzmann graphs ---------- */
    var slider = document.getElementById('tempSlider');
    var pCanvas = document.getElementById('particleCanvas');
    var sCanvas = document.getElementById('gBoltzSpeed');
    var eCanvas = document.getElementById('gBoltzEnergy');
    if (!slider || !pCanvas || !sCanvas || !eCanvas) return;
    var Tset = parseFloat(slider.value);
    var distTemps = [25, 30, 35, 40, 45, 50];
    var distColors = ['#3e7cb1', '#2e8b74', '#7fae2e', '#d9a404', '#e06a1b', '#c22e10'];
    var KB = 1.380649e-23, M_N2 = 4.65e-26, EV = 1.602176634e-19;
    function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function fitC(cnv, hCss){
      var r = cnv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var w = Math.max(200, Math.round(r.width)), h = hCss;
      if (cnv.width !== Math.round(w * dpr) || cnv.height !== Math.round(h * dpr)){ cnv.width = Math.round(w * dpr); cnv.height = Math.round(h * dpr); }
      var c = cnv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: c, w: w, h: h };
    }
    /* legend — same colours / bold-current behaviour as the distribution graph */
    var legend = document.getElementById('boltzLegend');
    if (legend){
      distTemps.forEach(function(tp, i){
        var s = document.createElement('span');
        var sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = distColors[i];
        s.appendChild(sw); s.appendChild(document.createTextNode(tp + ' °C'));
        s.id = 'boltz-leg-' + tp;
        legend.appendChild(s);
      });
    }
    function markLegend(){
      distTemps.forEach(function(tp){
        var el = document.getElementById('boltz-leg-' + tp);
        if (el) el.style.fontWeight = Math.abs(tp - Tset) < 0.01 ? '700' : '400';
      });
    }
    /* ----- Boltzmann: speed distribution f(v) ----- */
    function speedPDF(v, TK){
      var a = M_N2 / (2 * Math.PI * KB * TK);
      return 4 * Math.PI * Math.pow(a, 1.5) * v * v * Math.exp(-M_N2 * v * v / (2 * KB * TK));
    }
    function drawSpeed(){
      var f = fitC(sCanvas, 240), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink');
      ctx.clearRect(0, 0, W, H);
      var padL = 46, padR = 10, padT = 12, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
      var vMax = 1000, yMax = 0;
      distTemps.forEach(function(tp){ for (var v = 0; v <= vMax; v += 10) yMax = Math.max(yMax, speedPDF(v, tp + 273.15)); });
      yMax *= 1.12;
      function X(v){ return padL + v / vMax * iw; }
      function Y(p){ return padT + (1 - p / yMax) * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var v = 0; v <= vMax; v += 250){
        var x = X(v); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(String(v), x, H - 16);
      }
      for (var gi = 0; gi <= 4; gi++){
        var p = yMax * gi / 4, y = Y(p);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText((p * 1000).toFixed(1), padL - 5, y + 4);
      }
      ctx.textAlign = 'center'; ctx.fillText('particle speed v (m/s)', padL + iw / 2, H - 3);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('probability density (×10⁻³ per m/s)', 0, 0); ctx.restore();
      distTemps.forEach(function(tp, i){
        var TK = tp + 273.15, cur = Math.abs(tp - Tset) < 0.01;
        ctx.strokeStyle = distColors[i]; ctx.lineWidth = cur ? 3.2 : 1.5; ctx.globalAlpha = cur ? 1 : 0.72;
        ctx.beginPath();
        for (var k = 0; k <= 100; k++){ var vv = vMax * k / 100, pp = speedPDF(vv, TK); k ? ctx.lineTo(X(vv), Y(pp)) : ctx.moveTo(X(vv), Y(pp)); }
        ctx.stroke(); ctx.globalAlpha = 1;
        if (cur){
          var vAvg = Math.sqrt(8 * KB * TK / (Math.PI * M_N2));
          ctx.strokeStyle = ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(X(vAvg), padT); ctx.lineTo(X(vAvg), padT + ih); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText('⟨v⟩ ≈ ' + Math.round(vAvg) + ' m/s', Math.min(Math.max(X(vAvg), padL + 42), padL + iw - 42), padT + 12);
        }
      });
    }
    /* ----- Boltzmann: energy distribution f(E) ----- */
    function energyPDF(eEv, TK){
      var E = eEv * EV, kT = KB * TK;
      return (2 / Math.sqrt(Math.PI)) * Math.sqrt(E) / Math.pow(kT, 1.5) * Math.exp(-E / kT) / EV;
    }
    function drawEnergy(){
      var f = fitC(eCanvas, 240), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink');
      ctx.clearRect(0, 0, W, H);
      var padL = 40, padR = 10, padT = 12, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
      var eMax = 0.15, yMax = 0;
      distTemps.forEach(function(tp){ for (var e = 0.001; e <= eMax; e += 0.002) yMax = Math.max(yMax, energyPDF(e, tp + 273.15)); });
      yMax *= 1.12;
      function X(e){ return padL + e / eMax * iw; }
      function Y(p){ return padT + (1 - p / yMax) * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = muted;
      [0, 0.05, 0.10, 0.15].forEach(function(e){
        var x = X(e); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(e.toFixed(2), x, H - 16);
      });
      for (var gi = 0; gi <= 4; gi++){
        var p = yMax * gi / 4, y = Y(p);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(Math.round(p), padL - 5, y + 4);
      }
      ctx.textAlign = 'center'; ctx.fillText('particle energy E (eV)', padL + iw / 2, H - 3);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('probability density (per eV)', 0, 0); ctx.restore();
      distTemps.forEach(function(tp, i){
        var TK = tp + 273.15, cur = Math.abs(tp - Tset) < 0.01;
        ctx.strokeStyle = distColors[i]; ctx.lineWidth = cur ? 3.2 : 1.5; ctx.globalAlpha = cur ? 1 : 0.72;
        ctx.beginPath();
        for (var k = 0; k <= 120; k++){ var ee = eMax * k / 120, pp = energyPDF(Math.max(ee, 0.0004), TK); k ? ctx.lineTo(X(ee), Y(pp)) : ctx.moveTo(X(ee), Y(pp)); }
        ctx.stroke(); ctx.globalAlpha = 1;
        if (cur){
          var eAvg = 1.5 * KB * TK / EV;
          ctx.strokeStyle = ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(X(eAvg), padT); ctx.lineTo(X(eAvg), padT + ih); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText('(3/2)kBT ≈ ' + eAvg.toFixed(3) + ' eV', Math.min(Math.max(X(eAvg), padL + 52), padL + iw - 52), padT + 12);
        }
      });
    }
    function drawBoltz(){ drawSpeed(); drawEnergy(); markLegend(); }
    /* ----- Particle diagram: air particles flying around an empty terrarium ----- */
    var N = 110, parts = [];
    function gauss(){ var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function sigmaPx(Tc){
      /* visual speed scale: exaggerated vs sqrt(T) so the slider change is plainly visible */
      return 26 + (Tc - 20) * 1.15;
    }
    function seedParts(W, H, box){
      parts = [];
      for (var i = 0; i < N; i++){
        var sg = sigmaPx(Tset);
        parts.push({ x: box.x + Math.random() * box.w, y: box.y + Math.random() * box.h, vx: gauss() * sg, vy: gauss() * sg });
      }
    }
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lastMs = null;
    function drawParticles(ms){
      var f = fitC(pCanvas, 280), ctx = f.ctx, W = f.w, H = f.h;
      if (W < 220){ requestAnimationFrame(drawParticles); return; }
      var muted = cssVar('--muted'), ink = cssVar('--ink'), glass = cssVar('--glass-edge'), heat = cssVar('--heat');
      var box = { x: 46, y: 34, w: W - 118, h: H - 76 };
      if (!parts.length) seedParts(W, H, box);
      var dt = 0;
      if (!reduced){
        if (lastMs === null) lastMs = ms;
        dt = Math.min(0.04, (ms - lastMs) / 1000); lastMs = ms;
      }
      /* thermostat: ease the swarm's RMS speed toward the slider temperature */
      if (dt > 0){
        var rms = 0; parts.forEach(function(p){ rms += p.vx * p.vx + p.vy * p.vy; });
        rms = Math.sqrt(rms / N);
        var target = sigmaPx(Tset) * Math.SQRT2;
        var k = rms > 1 ? 1 + (target - rms) / rms * Math.min(1, dt * 2.5) : 1;
        parts.forEach(function(p){
          p.vx *= k; p.vy *= k;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < box.x + 3){ p.x = box.x + 3; p.vx = Math.abs(p.vx); }
          if (p.x > box.x + box.w - 3){ p.x = box.x + box.w - 3; p.vx = -Math.abs(p.vx); }
          if (p.y < box.y + 3){
            p.y = box.y + 3; p.vy = Math.abs(p.vy);
            /* bounce off the hot panel (top centre): leave faster than it arrived */
            var pcx = box.x + box.w / 2;
            if (Math.abs(p.x - pcx) < box.w * 0.26){ var boost = 1 + 0.25 * (Tset - 20) / 30 + Math.random() * 0.15; p.vx *= boost; p.vy *= boost; }
          }
          if (p.y > box.y + box.h - 3){ p.y = box.y + box.h - 3; p.vy = -Math.abs(p.vy); }
        });
        /* a few particle-particle collisions per frame: swap velocity components on close approach */
        for (var c = 0; c < 14; c++){
          var a = parts[(Math.random() * N) | 0], b = parts[(Math.random() * N) | 0];
          if (a !== b && Math.abs(a.x - b.x) < 7 && Math.abs(a.y - b.y) < 7){ var tvx = a.vx, tvy = a.vy; a.vx = b.vx; a.vy = b.vy; b.vx = tvx; b.vy = tvy; }
        }
      }
      ctx.clearRect(0, 0, W, H);
      /* heating panel, top centre */
      var pw = box.w * 0.52, px = box.x + (box.w - pw) / 2, glowF = (Tset - 20) / 30;
      ctx.fillStyle = 'rgb(' + Math.round(87 + 140 * glowF) + ',' + Math.round(31 + 60 * glowF) + ',20)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px, box.y - 20, pw, 13, 3); else ctx.rect(px, box.y - 20, pw, 13); ctx.fill();
      ctx.fillStyle = muted; ctx.font = '10.5px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('HEATING PANEL — TOP CENTRE', box.x + box.w / 2, box.y - 26);
      /* tank */
      ctx.strokeStyle = glass; ctx.lineWidth = 5; ctx.strokeRect(box.x, box.y, box.w, box.h);
      /* depth markers */
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('z = 0 (top)', box.x + box.w + 10, box.y + 4);
      ctx.fillText('z = H/2', box.x + box.w + 10, box.y + box.h / 2 + 4);
      ctx.fillText('z = H', box.x + box.w + 10, box.y + box.h + 4);
      /* particles, coloured by speed */
      var sg2 = sigmaPx(Tset);
      parts.forEach(function(p){
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) / (sg2 * 2.6);
        sp = Math.max(0, Math.min(1, sp));
        var col = sp < 0.5 ? 'rgb(' + Math.round(62 + (224 - 62) * sp * 2) + ',' + Math.round(124 + (106 - 124) * sp * 2) + ',' + Math.round(177 + (27 - 177) * sp * 2) + ')'
                           : 'rgb(' + Math.round(224 + (194 - 224) * (sp - 0.5) * 2) + ',' + Math.round(106 + (46 - 106) * (sp - 0.5) * 2) + ',' + Math.round(27 + (16 - 27) * (sp - 0.5) * 2) + ')';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText('AIR ONLY — EMPTY · ' + Tset.toFixed(1) + ' °C setpoint', box.x + box.w / 2, box.y + box.h + 26);
      void ink; void heat;
      if (!reduced) requestAnimationFrame(drawParticles);
    }
    slider.addEventListener('input', function(){ Tset = parseFloat(slider.value); drawBoltz(); if (reduced) drawParticles(0); });
    window.addEventListener('resize', function(){ drawBoltz(); if (reduced) drawParticles(0); });
    drawBoltz();
    requestAnimationFrame(drawParticles);
  })();

/* ===== original page script 6 ===== */
(function(){
    "use strict";
    /* ---------- Note, Temperature tab: filter-distribution, oscillator, and interaction graphs ---------- */
    var cF = document.getElementById('gFilterNote');
    var cO = document.getElementById('gOscNote');
    var cI = document.getElementById('gInteractNote');
    if (!cF || !cO || !cI) return;
    function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function fitC(cnv){
      var r = cnv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var w = Math.max(200, Math.round(r.width)), h = 240;
      if (cnv.width !== Math.round(w * dpr) || cnv.height !== Math.round(h * dpr)){ cnv.width = Math.round(w * dpr); cnv.height = Math.round(h * dpr); }
      var c = cnv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: c, w: w, h: h };
    }
    var D = 0.47; /* delta/H for the exponential shown */
    function thetaExp(zf){ var eH = Math.exp(-1 / D); return (Math.exp(-zf / D) - eH) / (1 - eH); }

    /* ----- filter distribution again: simplest / linear / exponential / Bode ----- */
    function drawFilter(){
      var f = fitC(cF), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      var blue = '#3e7cb1', green = '#2e8b74';
      ctx.clearRect(0, 0, W, H);
      var padL = 44, padR = 14, padT = 14, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
      function X(zf){ return padL + zf * iw; }
      function Y(th){ return padT + (1 - th) * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = muted;
      [0, 0.5, 1].forEach(function(zf){
        var x = X(zf); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(zf === 0 ? '0 (top)' : (zf === 1 ? 'H (bottom)' : 'H/2'), x, H - 16);
      });
      [0, 0.5, 1].forEach(function(th){
        var y = Y(th); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(th.toFixed(1), padL - 5, y + 4);
      });
      ctx.textAlign = 'center'; ctx.fillText('height down the tank', padL + iw / 2, H - 3);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('normalised temperature θ', 0, 0); ctx.restore();
      /* simplest + linear filter: full heat to H/2, then straight line to 0 at H */
      ctx.strokeStyle = blue; ctx.lineWidth = 2.4; ctx.beginPath();
      ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0.5), Y(1)); ctx.lineTo(X(1), Y(0)); ctx.stroke();
      /* exponential — the accurate model */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.6; ctx.beginPath();
      for (var k = 0; k <= 60; k++){ var zf = k / 60; k ? ctx.lineTo(X(zf), Y(thetaExp(zf))) : ctx.moveTo(X(zf), Y(thetaExp(zf))); }
      ctx.stroke();
      /* Bode approximation: flat at 1 to H/2, then straight down to theta(H) region */
      ctx.strokeStyle = ink; ctx.setLineDash([8, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0.5), Y(1)); ctx.lineTo(X(1), Y(0.04)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(X(0.5), Y(1), 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 11.5px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('cutoff point', X(0.5) + 8, Y(1) + 4);
      /* labels */
      ctx.font = '11.5px sans-serif';
      ctx.fillStyle = blue; ctx.fillText('simplest / linear filter — full heat to H/2, then straight down', padL + 6, padT + 14);
      ctx.fillStyle = heat; ctx.fillText('exponential — more accurate', padL + 6, padT + ih - 8);
      ctx.fillStyle = ink; ctx.fillText('Bode — dashed', X(0.72), Y(0.42));
      void green;
    }

    /* ----- what an oscillator is ----- */
    function oscVal(t, amp){ return amp * Math.exp(-t / 3.2) * Math.cos(t * 2.4); }
    function drawOsc(){
      var f = fitC(cO), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      ctx.clearRect(0, 0, W, H);
      var padL = 36, padR = 14, padT = 16, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
      var tMax = 10, midY = padT + ih / 2, ampPx = ih * 0.42;
      function X(t){ return padL + t / tMax * iw; }
      function Y(v){ return midY - v * ampPx; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var t = 0; t <= tMax; t += 2){ var x = X(t); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(t === tMax ? 'time →' : String(t), x, H - 16); }
      ctx.textAlign = 'center'; ctx.fillText('time', padL + iw / 2, H - 3);
      /* target */
      ctx.strokeStyle = ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(padL, midY); ctx.lineTo(padL + iw, midY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText('target', padL + iw - 34, midY - 7);
      /* envelope — dashed orange */
      ctx.strokeStyle = heat; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.3; ctx.globalAlpha = 0.7;
      [1, -1].forEach(function(sg){ ctx.beginPath(); for (var k = 0; k <= 80; k++){ var tt = tMax * k / 80, vv = sg * Math.exp(-tt / 3.2); k ? ctx.lineTo(X(tt), Y(vv)) : ctx.moveTo(X(tt), Y(vv)); } ctx.stroke(); });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = heat; ctx.fillText('envelope', padL + 6, padT + 12);
      /* mean — the exponential simplification (white dashed with dark halo) */
      ctx.setLineDash([7, 5]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.3; ctx.lineWidth = 3;
      ctx.beginPath(); for (var k2 = 0; k2 <= 80; k2++){ var t2 = tMax * k2 / 80, v2 = 1 - Math.exp(-t2 / 3.2); var yy = midY + ampPx * 0.9 - v2 * ampPx * 0.9; k2 ? ctx.lineTo(X(t2), yy) : ctx.moveTo(X(t2), yy); } ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (var k3 = 0; k3 <= 80; k3++){ var t3 = tMax * k3 / 80, v3 = 1 - Math.exp(-t3 / 3.2); var y3 = midY + ampPx * 0.9 - v3 * ampPx * 0.9; k3 ? ctx.lineTo(X(t3), y3) : ctx.moveTo(X(t3), y3); } ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* oscillator — solid orange */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.4; ctx.beginPath();
      for (var k4 = 0; k4 <= 160; k4++){ var t4 = tMax * k4 / 160; k4 ? ctx.lineTo(X(t4), Y(oscVal(t4, 1))) : ctx.moveTo(X(t4), Y(oscVal(t4, 1))); }
      ctx.stroke();
      ctx.fillStyle = heat; ctx.font = 'bold 11.5px sans-serif'; ctx.fillText('oscillator — swings around the target, settling', padL + 6, padT + ih - 6);
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.fillText('mean (exponential simplification)', padL + iw - 168, midY + ampPx * 0.9 + 16);
    }

    /* ----- filter × oscillator -> temperature at a point ----- */
    function drawInteract(){
      var f = fitC(cI), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      var blue = '#3e7cb1';
      ctx.clearRect(0, 0, W, H);
      var gap = 26, pw = (W - 28 - gap * 2) / 3, padT = 30, ih = H - padT - 44;
      var titles = ['Oscillator in — at the panel', 'Filter — distribution', 'New signal — T at a point'];
      function panel(i){ return 14 + i * (pw + gap); }
      for (var i = 0; i < 3; i++){
        var x0 = panel(i);
        ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(x0, padT, pw, ih);
        ctx.fillStyle = ink; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(titles[i], x0 + pw / 2, 18);
        ctx.fillStyle = muted; ctx.font = '11px sans-serif';
        ctx.fillText(i === 1 ? 'height →' : 'time →', x0 + pw / 2, H - 6);
        if (i < 2){
          ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
          var ax = x0 + pw + 4, ay = padT + ih / 2;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + gap - 8, ay); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax + gap - 8, ay); ctx.lineTo(ax + gap - 15, ay - 4); ctx.lineTo(ax + gap - 15, ay + 4); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
        }
      }
      /* panel 1: oscillator in time, full size */
      (function(){
        var x0 = panel(0), midY = padT + ih / 2, amp = ih * 0.38, tMax = 10;
        ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0 + 6, midY); ctx.lineTo(x0 + pw - 6, midY); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = heat; ctx.lineWidth = 2.2; ctx.beginPath();
        for (var k = 0; k <= 120; k++){ var t = tMax * k / 120, x = x0 + 6 + (pw - 12) * k / 120, y = midY - oscVal(t, 1) * amp; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      })();
      /* panel 2: filter distribution, point marked at depth 0.62H */
      (function(){
        var x0 = panel(1);
        function X(zf){ return x0 + 8 + zf * (pw - 16); }
        function Y(th){ return padT + 8 + (1 - th) * (ih - 16); }
        ctx.strokeStyle = heat; ctx.lineWidth = 2.2; ctx.beginPath();
        for (var k = 0; k <= 50; k++){ var zf = k / 50; k ? ctx.lineTo(X(zf), Y(thetaExp(zf))) : ctx.moveTo(X(zf), Y(thetaExp(zf))); }
        ctx.stroke();
        ctx.strokeStyle = ink; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0.5), Y(1)); ctx.lineTo(X(1), Y(0.04)); ctx.stroke(); ctx.setLineDash([]);
        var zd = 0.62, thd = thetaExp(zd);
        ctx.strokeStyle = muted; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(zd), padT + 8); ctx.lineTo(X(zd), Y(thd)); ctx.lineTo(x0 + 8, Y(thd)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(X(zd), Y(thd), 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = blue; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('point · θ ≈ ' + thd.toFixed(2), X(zd) - 52, Y(thd) - 9);
      })();
      /* panel 3: output — same oscillator, attenuated by theta at the point and delayed */
      (function(){
        var x0 = panel(2), midY = padT + ih / 2, thd = thetaExp(0.62), amp = ih * 0.38 * thd, tMax = 10;
        ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0 + 6, midY); ctx.lineTo(x0 + pw - 6, midY); ctx.stroke();
        ctx.strokeStyle = heat; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.55;
        ctx.beginPath(); for (var k = 0; k <= 120; k++){ var t = tMax * k / 120, x = x0 + 6 + (pw - 12) * k / 120, y = midY - oscVal(t, 1) * (ih * 0.38); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.strokeStyle = blue; ctx.lineWidth = 2.4; ctx.beginPath();
        for (var k2 = 0; k2 <= 120; k2++){ var t2 = tMax * k2 / 120, x2 = x0 + 6 + (pw - 12) * k2 / 120, y2 = midY - oscVal(Math.max(0, t2 - 1.6), 1) * amp * (t2 < 1.6 ? 0.15 : 1); k2 ? ctx.lineTo(x2, y2) : ctx.moveTo(x2, y2); }
        ctx.stroke();
        ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('grey dashed = input, for comparison', x0 + pw / 2, padT + ih - 6);
      })();
    }
    function drawAll(){ drawFilter(); drawOsc(); drawInteract(); }
    drawAll();
    window.addEventListener('resize', drawAll);
  })();
