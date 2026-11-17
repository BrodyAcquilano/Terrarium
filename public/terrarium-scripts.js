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
    wireTabs('.tab', ['view-terrarium','view-symbols','view-water','view-specs']);
    wireTabs('.subtab', ['spec-terrarium','spec-panel']);

    /* ---------- model ---------- */
    var TAU = 24;              /* s, effective lumped time constant */
    var PMAX = 24;             /* W */
    var slider = document.getElementById('tempSlider');
    var setVal = document.getElementById('setVal');
    var Tset = parseFloat(slider.value);
    var Tmean = Tset;          /* air temperature — Newton's law of cooling: first order, one store, an exponential */
    var tNow = 0;              /* sim seconds */
    var hist = [];             /* {t, T (air temperature, the Newton exponential), Ts (setpoint)} */
    for (var i = 100; i >= 0; i--) hist.push({ t: -i * 0.5, T: Tmean, Ts: Tset });
    tNow = 0;

    var roTemp = document.getElementById('roTemp'),
        roState = document.getElementById('roState'),
        roPower = document.getElementById('roPower'),
        roPress = document.getElementById('roPress'),
        rays = document.getElementById('rays'),
        panelGlow = document.getElementById('panelGlow'),
        airTop = document.getElementById('airTop'),
        airBot = document.getElementById('airBot');

    slider.addEventListener('input', function(){
      Tset = parseFloat(slider.value);
      setVal.textContent = Tset.toFixed(1) + '°';
      drawDist();
    });

    function heaterPower(){
      var err = Tset - Tmean;
      if (err <= 0) return 0;
      return PMAX * Math.min(1, err / 3);
    }

    /* ---------- particles in the top terrarium — the one particle animation ----------
       Each particle is thermostatted on its own to the Maxwell–Boltzmann
       distribution for the temperature at its own height: an Ornstein–Uhlenbeck
       pull keeps re-drawing its velocity toward a Gaussian of width
       sigma(local T). No velocity-swapping collisions, so energy can never
       pool in a single fast particle while the rest go cold — every particle
       keeps following its local distribution. The local temperature is a
       field of depth layers, each relaxing toward the steady distribution
       profile theta(z) for the current setpoint, top layers fast and deeper
       layers slower: a setpoint rise re-excites the top first and the new
       energy works its way down until the field settles back onto the
       profile; a setpoint fall drains the energy out gradually, layer by
       layer, and the particles slow down. A bounce off the heating panel
       re-samples the particle's velocity from the panel-temperature
       distribution, so particles near the panel keep getting heat. */
    var pGroup = document.getElementById('topParticles');
    var P_X0 = 68, P_Y0 = 44, P_W = 504, P_H = 272, P_X1 = P_X0 + P_W, P_Y1 = P_Y0 + P_H;
    var P_PANEL_X0 = 190, P_PANEL_X1 = 450;
    var P_N = 90, P_NB = 6;
    var pReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function pGauss(){ var u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function sigmaForTemp(Tc){ return 30 + (Tc - 20) * 1.4; }
    function thetaAtZ(zf, Ts){
      var d = deltaOverH(Ts), eH = Math.exp(-1 / d);
      return (Math.exp(-zf / d) - eH) / (1 - eH);
    }
    function layerTarget(i, Ts){
      var zf = (i + 0.5) / P_NB;
      return 20 + (Ts - 20) * (0.30 + 0.70 * thetaAtZ(zf, Ts));
    }
    var pLayers = [];
    for (var li = 0; li < P_NB; li++) pLayers.push(layerTarget(li, Tset));
    function localTempAt(y){
      var pos = ((y - P_Y0) / P_H) * P_NB - 0.5;
      if (pos <= 0) return pLayers[0];
      if (pos >= P_NB - 1) return pLayers[P_NB - 1];
      var i0 = Math.floor(pos), fr = pos - i0;
      return pLayers[i0] * (1 - fr) + pLayers[i0 + 1] * fr;
    }
    var pParts = [], pCircles = [];
    if (pGroup){
      var SVGNS = 'http://www.w3.org/2000/svg';
      for (var pi = 0; pi < P_N; pi++){
        var px = P_X0 + 6 + Math.random() * (P_W - 12);
        var py = P_Y0 + 6 + Math.random() * (P_H - 12);
        var sg0 = sigmaForTemp(localTempAt(py));
        pParts.push({ x: px, y: py, vx: pGauss() * sg0, vy: pGauss() * sg0 });
        var cc = document.createElementNS(SVGNS, 'circle');
        cc.setAttribute('r', '4'); cc.setAttribute('cx', px.toFixed(1)); cc.setAttribute('cy', py.toFixed(1));
        pGroup.appendChild(cc); pCircles.push(cc);
      }
    }
    function particleColor(sp, sgHot){
      var t = Math.max(0, Math.min(1, sp / (sgHot * 2.4)));
      if (t < 0.5) return 'rgb(' + Math.round(62 + (224 - 62) * t * 2) + ',' + Math.round(124 + (106 - 124) * t * 2) + ',' + Math.round(177 + (27 - 177) * t * 2) + ')';
      return 'rgb(' + Math.round(224 + (194 - 224) * (t - 0.5) * 2) + ',' + Math.round(106 + (46 - 106) * (t - 0.5) * 2) + ',' + Math.round(27 + (16 - 27) * (t - 0.5) * 2) + ')';
    }
    function drawParticlesTop(){
      var sgHot = sigmaForTemp(Tset);
      for (var i = 0; i < pParts.length; i++){
        var p = pParts[i];
        pCircles[i].setAttribute('cx', p.x.toFixed(1));
        pCircles[i].setAttribute('cy', p.y.toFixed(1));
        pCircles[i].setAttribute('fill', particleColor(Math.sqrt(p.vx * p.vx + p.vy * p.vy), sgHot));
      }
    }
    function stepParticles(dt){
      for (var i = 0; i < P_NB; i++){
        var tauL = 5 + (i / (P_NB - 1)) * 15;
        pLayers[i] += (layerTarget(i, Tset) - pLayers[i]) * (1 - Math.exp(-dt / tauL));
      }
      var gamma = 1.4, decay = Math.exp(-gamma * dt);
      var sgHot = sigmaForTemp(Tset);
      for (var j = 0; j < pParts.length; j++){
        var p = pParts[j];
        var sg = sigmaForTemp(localTempAt(p.y));
        var noise = sg * Math.sqrt(Math.max(0, 1 - decay * decay));
        p.vx = p.vx * decay + pGauss() * noise;
        p.vy = p.vy * decay + pGauss() * noise;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < P_X0 + 4){ p.x = P_X0 + 4; p.vx = Math.abs(p.vx); }
        if (p.x > P_X1 - 4){ p.x = P_X1 - 4; p.vx = -Math.abs(p.vx); }
        if (p.y > P_Y1 - 4){ p.y = P_Y1 - 4; p.vy = -Math.abs(p.vy); }
        if (p.y < P_Y0 + 4){
          p.y = P_Y0 + 4;
          if (p.x >= P_PANEL_X0 && p.x <= P_PANEL_X1){
            p.vx = pGauss() * sgHot;
            p.vy = Math.abs(pGauss() * sgHot);
          } else {
            p.vy = Math.abs(p.vy);
          }
        }
      }
      drawParticlesTop();
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

    /* ---------- graph 1: transient, last 100 s — Newton exponential ----------
       Air temperature (Newton's law of cooling — first order, no ringing): solid ORANGE.
       Setpoint T_s: dashed grey. Y axis auto-zooms + recentres on the curve,
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
      /* auto-zoom / recentre: target axis brackets where the curve has
         actually been over the last 20 s, with a little headroom. The setpoint
         does not stretch the axis (it may run off-frame), so the view centres
         and zooms on the curve itself and rescales as it moves. */
      var dMin = Infinity, dMax = -Infinity;
      hist.forEach(function(p){
        if (p.t < tNow - 20) return;
        dMin = Math.min(dMin, p.T);
        dMax = Math.max(dMax, p.T);
      });
      if (!isFinite(dMin)){ dMin = Tset - 1; dMax = Tset + 1; }
      var mid = (dMin + dMax) / 2, span = Math.min(34, Math.max(1.8, (dMax - dMin) * 1.3 + 0.5));
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
      /* 1) setpoint — the target the exponential closes in on */
      ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      trace(function(p){ return p.Ts; });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      /* 2) air temperature — Newton's law of cooling, the exponential, solid orange */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.2;
      trace(function(p){ return p.T; });
      var last = hist[hist.length - 1];
      if (last){ ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(last.t), Y(last.T), 3.5, 0, 7); ctx.fill(); }
      ctx.restore();
      ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = heat;
      ctx.fillText('T — Newton exponential', padL + 6, padT + 12);
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
      /* Newton's law of cooling, dT/dt = (T_s − T)/τ, stepped exactly — first order, so it can only close the gap, never overshoot */
      Tmean += (Tset - Tmean) * (1 - Math.exp(-dt / TAU));
      acc += dt;
      if (acc >= 0.25){
        acc = 0;
        hist.push({ t: tNow, T: Tmean, Ts: Tset });
        while (hist.length && hist[0].t < tNow - 100.5) hist.shift();
      }
      /* readouts */
      roTemp.textContent = Tmean.toFixed(1) + ' °C';
      var err = Math.abs(Tset - Tmean);
      var steady = err < 0.05;
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
      if (!pReduced) stepParticles(dt);
      drawTransient();
      requestAnimationFrame(frame);
    }
    drawDist();
    drawParticlesTop();
    requestAnimationFrame(frame);
    window.addEventListener('resize', function(){ drawDist(); });
  })();

/* ===== original page script 2 ===== */
(function(){
    "use strict";
    var TAU_AIR = 18, TAU_W = 110, PMAX = 24;
    var slider = document.getElementById('tempSliderW');
    if(!slider) return;
    var setVal = document.getElementById('setValW');
    var Tset = parseFloat(slider.value);
    /* two heat stores — air and water — like two capacitors in an RC ladder: second order, but
       always overdamped (real time constants only), so each temperature is a sum of exponentials
       and never overshoots. Air follows the pad; water follows the air, slowly. */
    var Tair = Tset, Twat = Tset;
    var tNow = 0, hist = [];
    for (var i = 100; i >= 0; i--) hist.push({t:-i*0.5, Ta:Tair, Tw:Twat, Ts:Tset});
    var roAir=document.getElementById('roAirW'), roWat=document.getElementById('roWaterW'),
        roState=document.getElementById('roStateW'), roPow=document.getElementById('roPowerW'),
        rays=document.getElementById('raysW'), glowEl=document.getElementById('panelGlowW'),
        airTop=document.getElementById('airTopW'), watTop=document.getElementById('watTopW'),
        wline=document.getElementById('waterLineW');
    slider.addEventListener('input', function(){ Tset=parseFloat(slider.value); setVal.textContent=Tset.toFixed(1)+'°'; drawDistW(); });
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
      /* auto-zoom / recentre: the target axis brackets where the two curves have actually
         been over the last 20 s, with a little headroom. The setpoint does not stretch the
         axis (it may run off-frame), so the view centres and zooms on the curves themselves. */
      var dMin=Infinity, dMax=-Infinity;
      hist.forEach(function(p){
        if(p.t<tNow-20) return;
        dMin=Math.min(dMin,p.Ta,p.Tw);
        dMax=Math.max(dMax,p.Ta,p.Tw);
      });
      if(!isFinite(dMin)){ dMin=Tset-1; dMax=Tset+1; }
      var mid=(dMin+dMax)/2, span=Math.min(34,Math.max(1.8,(dMax-dMin)*1.3+0.5));
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
      /* 1) setpoint — the target both temperatures close in on */
      ctx.strokeStyle=muted; ctx.setLineDash([4,4]); ctx.lineWidth=1; ctx.globalAlpha=0.7;
      trace(function(p){return p.Ts;});
      ctx.setLineDash([]); ctx.globalAlpha=1;
      /* 2) the two temperatures — exponentials, solid, orange for air, blue for water */
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
    }
    var lastMs=null, acc=0;
    function frame(ms){
      if(lastMs===null) lastMs=ms;
      var dt=Math.min(0.1,(ms-lastMs)/1000); lastMs=ms; tNow+=dt;
      /* Newton's law for each store: air closes on the pad, water closes on the air — first-order steps, no inertia, no ringing */
      Tair += (Tset-Tair)*(1-Math.exp(-dt/TAU_AIR));
      Twat += (Tair-Twat)*(1-Math.exp(-dt/TAU_W));
      acc+=dt;
      if(acc>=0.25){ acc=0; hist.push({t:tNow,Ta:Tair,Tw:Twat,Ts:Tset}); while(hist.length&&hist[0].t<tNow-100.5) hist.shift(); }
      roAir.textContent=Tair.toFixed(1)+' °C'; roWat.textContent=Twat.toFixed(1)+' °C';
      var steady=Math.abs(Tset-Twat)<0.05;
      roState.textContent=steady?'Steady state':'Transient'; roState.className='v '+(steady?'steady':'transient');
      var err=Tset-Tair, P=err<=0?0:PMAX*Math.min(1,err/3);
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
    /* ---------- H2O partition: equilibrium graph + live partition relaxation (Water Level tab) ---------- */
    var mainSlider = document.getElementById('tempSliderW');
    var ownSlider = document.getElementById('tempSliderH');
    var cv = document.getElementById('gPartitionH');
    if (!mainSlider || !ownSlider || !cv) return;
    var setValEl = document.getElementById('hSetVal'),
        gasRead = document.getElementById('hGasRead'),
        liqRead = document.getElementById('hLiqRead'),
        cvEq = document.getElementById('gH2O');

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

    /* ----- live partition: first-order relaxation toward the saturation split ----- */
    var TAU_V = 5;   /* s — net evaporation/condensation ∝ (target − current): a store filling through a resistance, no inertia */
    var Geq = gasEq(Ts), G = Geq;
    var tNow = 0, hist = [];
    for (var i = 180; i >= 0; i--) hist.push({ t: -i * 0.2, G: G, Geq: Geq });

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
      /* H2O gas — drawn live from the relaxation */
      ctx.strokeStyle = heat; ctx.beginPath();
      hist.forEach(function(p, ix){ var x = X(p.t), y = Y(p.G); ix ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      var last = hist[hist.length - 1];
      ctx.fillStyle = heat; ctx.beginPath(); ctx.arc(X(last.t), Y(last.G), 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#3e7cb1'; ctx.beginPath(); ctx.arc(X(last.t), Y(100 - last.G), 4, 0, 7); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = 'bold 11.5px sans-serif';
      ctx.fillStyle = '#3e7cb1'; ctx.fillText('H₂O liquid ' + (100 - G).toFixed(1) + '%', padL + 6, padT + 13);
      ctx.fillStyle = ink; ctx.fillText('H₂O total 100% — dashed', padL + 6, Y(100) - 7);
      ctx.fillStyle = heat; ctx.fillText('H₂O gas ' + G.toFixed(1) + '% — live, relaxing to its target', padL + 6, padT + ih - 8);
      ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('time →', padL + iw, H - 8);
    }

    var lastMs = null, acc = 0, eqTick = 0;
    function frame(ms){
      if (lastMs === null) lastMs = ms;
      var dt = Math.min(0.05, (ms - lastMs) / 1000); lastMs = ms;
      eqTick += dt;
      if (eqTick > 0.5){ eqTick = 0; drawEq(); }
      /* d(gas)/dt = (target − gas)/τ — closes the gap exponentially, never overshoots */
      G += (Geq - G) * (1 - Math.exp(-dt / TAU_V)); tNow += dt;
      acc += dt;
      if (acc >= 0.05){
        acc = 0;
        hist.push({ t: tNow, G: G, Geq: Geq });
        while (hist.length && hist[0].t < tNow - 37) hist.shift();
      }
      gasRead.textContent = 'H₂O gas = ' + G.toFixed(1) + '%';
      liqRead.textContent = 'H₂O liquid = ' + (100 - G).toFixed(1) + '%';
      drawGraph();
      requestAnimationFrame(frame);
    }
    drawEq();
    requestAnimationFrame(frame);
    window.addEventListener('resize', drawEq);
  })();

/* ===== original page script 4 ===== */
(function(){
    "use strict";
    /* ---------- Note, Temperature tab: Boltzmann graphs ---------- */
    var slider = document.getElementById('tempSlider');
    var sCanvas = document.getElementById('gBoltzSpeed');
    var eCanvas = document.getElementById('gBoltzEnergy');
    if (!slider || !sCanvas || !eCanvas) return;
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
    slider.addEventListener('input', function(){ Tset = parseFloat(slider.value); drawBoltz(); });
    window.addEventListener('resize', drawBoltz);
    drawBoltz();
  })();

/* ===== original page script 5 ===== */
(function(){
    "use strict";
    /* ---------- Note, Temperature tab: filter-distribution, damping, and interaction graphs ---------- */
    var cF = document.getElementById('gFilterNote');
    var cO = document.getElementById('gDampNote');
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

    /* ----- filter distribution again: the exponential ----- */
    function drawFilter(){
      var f = fitC(cF), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
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
      /* exponential */
      ctx.strokeStyle = heat; ctx.lineWidth = 2.6; ctx.beginPath();
      for (var k = 0; k <= 60; k++){ var zf = k / 60; k ? ctx.lineTo(X(zf), Y(thetaExp(zf))) : ctx.moveTo(X(zf), Y(thetaExp(zf))); }
      ctx.stroke();
      /* labels */
      ctx.font = '11.5px sans-serif';
      ctx.fillStyle = heat; ctx.fillText('exponential', padL + 6, padT + ih - 8);
    }

    /* ----- step responses: first order (this system) vs the three second-order damping cases ----- */
    function stepFirst(t, tau){ return 1 - Math.exp(-t / tau); }
    function stepSecond(t, wn, z){
      if (z < 1){ var wd = wn * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + z / Math.sqrt(1 - z * z) * Math.sin(wd * t)); }
      if (z === 1) return 1 - Math.exp(-wn * t) * (1 + wn * t);
      var r = Math.sqrt(z * z - 1), s1 = -wn * (z - r), s2 = -wn * (z + r);
      return 1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2);
    }
    function drawDamp(){
      var f = fitC(cO), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      var blue = '#3e7cb1';
      ctx.clearRect(0, 0, W, H);
      var padL = 40, padR = 14, padT = 14, padB = 30, iw = W - padL - padR, ih = H - padT - padB;
      var tMax = 10, yMax = 1.6;
      function X(t){ return padL + t / tMax * iw; }
      function Y(v){ return padT + (yMax - v) / yMax * ih; }
      ctx.font = '11px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.fillStyle = muted;
      for (var t = 0; t <= tMax; t += 2){ var x = X(t); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(String(t), x, H - 16); }
      [0, 0.5, 1, 1.5].forEach(function(v){ var y = Y(v); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), padL - 5, y + 4); });
      ctx.textAlign = 'center'; ctx.fillText('time after the step', padL + iw / 2, H - 3);
      ctx.save(); ctx.translate(11, padT + ih / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('normalised response θ', 0, 0); ctx.restore();
      /* target */
      ctx.strokeStyle = ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(padL, Y(1)); ctx.lineTo(padL + iw, Y(1)); ctx.stroke(); ctx.setLineDash([]);
      function curve(fn, color, width, dash, alpha){
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.globalAlpha = alpha || 1;
        ctx.beginPath();
        for (var k = 0; k <= 200; k++){ var tt = tMax * k / 200, y = Y(fn(tt)); k ? ctx.lineTo(X(tt), y) : ctx.moveTo(X(tt), y); }
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      var wn = 1.5;
      curve(function(t){ return stepSecond(t, wn, 0.2); }, muted, 1.4, [3, 3], 0.9);   /* underdamped — needs inertia */
      curve(function(t){ return stepSecond(t, wn, 1); }, ink, 1.5, [7, 4], 0.8);        /* critically damped */
      curve(function(t){ return stepSecond(t, wn, 2.5); }, blue, 2, [8, 4]);            /* overdamped — two stores, e.g. air + water */
      curve(function(t){ return stepFirst(t, 1.6); }, heat, 2.8);                       /* first order — this system */
    }

    /* ----- filter × exponential -> temperature at a point ----- */
    function drawInteract(){
      var f = fitC(cI), ctx = f.ctx, W = f.w, H = f.h;
      var muted = cssVar('--muted'), line = cssVar('--line'), ink = cssVar('--ink'), heat = cssVar('--heat');
      var blue = '#3e7cb1';
      ctx.clearRect(0, 0, W, H);
      var gap = 26, pw = (W - 28 - gap * 2) / 3, padT = 30, ih = H - padT - 44;
      var titles = ['Exponential in — at the panel', 'Filter — distribution', 'New signal — T at a point'];
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
      function expIn(t){ return 1 - Math.exp(-t / 2.4); }
      function tY(v){ return padT + 10 + (1 - v) * (ih - 20); }
      /* panel 1: exponential in time, full size */
      (function(){
        var x0 = panel(0), tMax = 10;
        ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0 + 6, tY(1)); ctx.lineTo(x0 + pw - 6, tY(1)); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = heat; ctx.lineWidth = 2.2; ctx.beginPath();
        for (var k = 0; k <= 120; k++){ var t = tMax * k / 120, x = x0 + 6 + (pw - 12) * k / 120, y = tY(expIn(t)); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
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
        var zd = 0.62, thd = thetaExp(zd);
        ctx.strokeStyle = muted; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(zd), padT + 8); ctx.lineTo(X(zd), Y(thd)); ctx.lineTo(x0 + 8, Y(thd)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(X(zd), Y(thd), 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = blue; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('point · θ ≈ ' + thd.toFixed(2), X(zd) - 52, Y(thd) - 9);
      })();
      /* panel 3: output — the same exponential, scaled by theta at the point */
      (function(){
        var x0 = panel(2), thd = thetaExp(0.62), tMax = 10;
        ctx.strokeStyle = heat; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.55;
        ctx.beginPath(); for (var k = 0; k <= 120; k++){ var t = tMax * k / 120, x = x0 + 6 + (pw - 12) * k / 120, y = tY(expIn(t)); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.strokeStyle = blue; ctx.lineWidth = 2.4; ctx.beginPath();
        for (var k2 = 0; k2 <= 120; k2++){ var t2 = tMax * k2 / 120, x2 = x0 + 6 + (pw - 12) * k2 / 120, y2 = tY(thd * expIn(t2)); k2 ? ctx.lineTo(x2, y2) : ctx.moveTo(x2, y2); }
        ctx.stroke();
        ctx.fillStyle = muted; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('dashed = input, for comparison', x0 + pw / 2, padT + ih - 6);
      })();
    }
    function drawAll(){ drawFilter(); drawDamp(); drawInteract(); }
    drawAll();
    window.addEventListener('resize', drawAll);
  })();
