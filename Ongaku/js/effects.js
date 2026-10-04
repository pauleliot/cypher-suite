/**
 * Ongaku — effets de fin rendus hors ligne (OfflineAudioContext, 48 kHz) + encodeur WAV 24 bits.
 *  - Reverb tail : le morceau est coupé net, la réverbe du dernier accord s'épanouit puis s'éteint.
 *  - Vinyl stop  : la vitesse (et donc la hauteur) chute jusqu'à l'arrêt, comme une platine qu'on coupe.
 *  - Fondu       : fondu de sortie classique, terminé exactement au point de fin.
 */
(function () {
  'use strict';

  var RENDER_SR = 48000;

  /** Réponse impulsionnelle synthétique : bruit stéréo décroissant, assourdi avec le temps */
  function makeImpulse(ctx, seconds, damping) {
    var sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
    var ir = ctx.createBuffer(2, len, sr);
    var preDelay = Math.floor(sr * 0.018);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c), lp = 0, energy = 0;
      for (var i = preDelay; i < len; i++) {
        var t = (i - preDelay) / sr;
        var env = Math.exp(-6.9 * t / seconds);
        // l'aigu s'éteint plus vite que le grave : coefficient de filtre qui se referme
        var a = Math.min(0.985, 0.25 + damping * (t / seconds) * 0.75);
        lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
        d[i] = lp * env;
        energy += d[i] * d[i];
      }
      // premières réflexions
      for (var r = 0; r < 6; r++) {
        var pos = preDelay + Math.floor(sr * (0.007 + Math.random() * 0.045));
        if (pos < len) d[pos] += (Math.random() > 0.5 ? 1 : -1) * 0.5 * Math.exp(-r * 0.4);
      }
      var norm = 1 / Math.sqrt(energy || 1);
      for (var j = 0; j < len; j++) d[j] *= norm * 0.9;
    }
    return ir;
  }

  /**
   * Courbes du vinyl stop, échantillonnées sur la durée de l'arrêt.
   * vitesse = (1 - x)^courbe : 1 = moteur coupé (freinage régulier), > 1 = frein à la main (chute rapide
   * puis longue fin), < 1 = le plateau garde son élan puis s'effondre.
   * Le pleurage suit la rotation réelle du plateau (33 tr/min = 0,555 Hz), de plus en plus marqué.
   */
  function vinylCurves(opts) {
    var n = Math.max(128, Math.ceil(opts.stop * 400)), k = opts.curve || 1;
    var c = { rate: new Float32Array(n), cutoff: new Float32Array(n), gain: new Float32Array(n),
      body: new Float32Array(n), direct: new Float32Array(n), cross: new Float32Array(n) };
    var dt = opts.stop / (n - 1), phase = 0;
    for (var i = 0; i < n; i++) {
      var x = i / (n - 1);
      var r = Math.pow(1 - x, k);
      if (opts.wow) {
        phase += 2 * Math.PI * 0.555 * r * dt;
        r *= 1 + (0.004 + 0.035 * x * x) * Math.sin(phase);
      }
      r = Math.max(0.0001, i === n - 1 ? 0.0001 : r);
      c.rate[i] = r;
      c.cutoff[i] = 160 + 19800 * Math.pow(r, 1.7);
      c.body[i] = 4 * Math.sin(Math.PI * Math.min(1, x * 1.4));
      c.gain[i] = Math.pow(r, 0.35) * Math.min(1, (1 - x) / 0.06);
      c.direct[i] = 1 - 0.32 * x;
      c.cross[i] = 0.32 * x;
    }
    return c;
  }

  /** Bruit de surface : souffle léger + craquements aléatoires (quelques gros « pops ») */
  function makeCrackle(ctx, seconds) {
    var sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    var b = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), hp = 0, prev = 0, env = 0, sign = 1;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        hp = 0.97 * (hp + w - prev); prev = w; // passe-haut : souffle sans grave
        if (Math.random() < 11 / sr) { env = 0.05 + Math.random() * 0.12; sign = Math.random() > 0.5 ? 1 : -1; }
        if (Math.random() < 0.9 / sr) { env = 0.3 + Math.random() * 0.2; sign = Math.random() > 0.5 ? 1 : -1; }
        d[i] = hp * 0.0035 + env * sign * (0.6 + 0.4 * Math.random());
        env *= 0.86;
      }
    }
    return b;
  }

  function linFade(param, t0, t1, from, to) {
    param.setValueAtTime(from, Math.max(0, t0));
    param.linearRampToValueAtTime(to, Math.max(t0 + 0.001, t1));
  }

  /**
   * buffer : AudioBuffer du morceau (n'importe quelle fréquence)
   * opts   : { effect: 'reverb'|'vinyl'|'fade', start, end, tail, size, mix, stop, curve, fade }
   */
  function render(buffer, opts) {
    var start = Math.max(0, opts.start || 0);
    var end = Math.min(buffer.duration, Math.max(start + 0.05, opts.end));
    var seg = end - start;
    var extra = opts.effect === 'reverb' ? opts.tail : opts.effect === 'vinyl' ? opts.stop + 0.15 : 0;
    var total = seg + extra;
    var SR = opts.sampleRate || RENDER_SR; // fréquence du fichier source (MP3 44,1 kHz → WAV 44,1 kHz)
    var ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);

    var master = ctx.createGain();
    master.connect(ctx.destination);

    var dry = ctx.createBufferSource();
    dry.buffer = buffer;
    var dryGain = ctx.createGain();
    dry.connect(dryGain).connect(master);
    // micro-fondu d'entrée si on ne démarre pas au début du fichier
    if (start > 0) linFade(dryGain.gain, 0, 0.006, 0, 1);

    if (opts.effect === 'reverb') {
      var cutFade = 0.025;
      dryGain.gain.setValueAtTime(1, Math.max(0.007, seg - cutFade));
      dryGain.gain.linearRampToValueAtTime(0, seg);
      dry.start(0, start, seg + 0.01);

      // envoi vers la réverbe : monte sur la dernière phrase, coupé au point de fin
      var send = ctx.createBufferSource();
      send.buffer = buffer;
      var sendGain = ctx.createGain();
      var conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = makeImpulse(ctx, Math.max(0.8, opts.tail * 0.85), opts.size);
      var wet = ctx.createGain();
      wet.gain.value = opts.mix;
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 180;
      send.connect(sendGain).connect(hp).connect(conv).connect(wet).connect(master);
      var win = Math.min(seg, opts.window || 0.9);
      sendGain.gain.setValueAtTime(0, 0);
      sendGain.gain.setValueAtTime(0, seg - win);
      sendGain.gain.linearRampToValueAtTime(1, seg - 0.02);
      sendGain.gain.linearRampToValueAtTime(0, seg);
      send.start(0, start, seg + 0.01);
      // extinction douce des dernières 15 % de la queue
      master.gain.setValueAtTime(1, seg + opts.tail * 0.85);
      master.gain.linearRampToValueAtTime(0, total);
    } else if (opts.effect === 'vinyl') {
      dry.start(0, start);
      var v = vinylCurves(opts);

      // vitesse du plateau (hauteur + tempo) : décélération + pleurage
      dry.playbackRate.setValueCurveAtTime(v.rate, seg, opts.stop);

      // les aigus disparaissent avec la vitesse (le spectre descend vers le grave)
      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.Q.value = -3; // pas de résonance quand la coupure descend
      lpf.frequency.value = 20000;
      lpf.frequency.setValueCurveAtTime(v.cutoff, seg, opts.stop);
      // le grave « bave » un peu quand le disque ralentit (bosse vers 120 Hz)
      var body = ctx.createBiquadFilter();
      body.type = 'peaking'; body.frequency.value = 120; body.Q.value = 0.8; body.gain.value = 0;
      body.gain.setValueCurveAtTime(v.body, seg, opts.stop);
      dryGain.disconnect();
      dryGain.connect(lpf).connect(body);

      // la stéréo se referme progressivement (le signal devient quasi mono)
      var out = body;
      if (buffer.numberOfChannels > 1) {
        var split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
        var dL = ctx.createGain(), dR = ctx.createGain(), xL = ctx.createGain(), xR = ctx.createGain();
        dL.gain.value = dR.gain.value = 1; xL.gain.value = xR.gain.value = 0;
        dL.gain.setValueCurveAtTime(v.direct, seg, opts.stop); dR.gain.setValueCurveAtTime(v.direct, seg, opts.stop);
        xL.gain.setValueCurveAtTime(v.cross, seg, opts.stop); xR.gain.setValueCurveAtTime(v.cross, seg, opts.stop);
        body.connect(split);
        split.connect(dL, 0); split.connect(xR, 0); split.connect(dR, 1); split.connect(xL, 1);
        dL.connect(merge, 0, 0); xL.connect(merge, 0, 0); dR.connect(merge, 0, 1); xR.connect(merge, 0, 1);
        out = merge;
      }
      out.connect(master);

      // craquements du disque : entrent juste avant la coupure et ralentissent avec le plateau
      if (opts.crackle) {
        var cr = ctx.createBufferSource();
        cr.buffer = makeCrackle(ctx, opts.stop * 2 + 1);
        var crGain = ctx.createGain();
        var crIn = Math.max(0, seg - 0.35);
        crGain.gain.value = 0;
        crGain.gain.setValueAtTime(0, crIn);
        crGain.gain.linearRampToValueAtTime(1, seg);
        cr.connect(crGain).connect(lpf);
        cr.playbackRate.setValueCurveAtTime(v.rate, seg, opts.stop);
        cr.start(crIn);
      }

      // niveau : suit la vitesse (perception du grave qui passe sous l'audible), 0 à l'arrêt
      master.gain.setValueCurveAtTime(v.gain, seg, opts.stop);
    } else {
      dry.start(0, start, seg);
      var f = Math.min(seg, opts.fade || 2);
      // courbe « égale puissance » approximée
      var fc = new Float32Array(64);
      for (var j = 0; j < 64; j++) fc[j] = Math.cos((j / 63) * Math.PI / 2);
      master.gain.setValueCurveAtTime(fc, seg - f, f);
    }

    // début de la zone modifiée par l'effet (le reste du morceau garde son niveau d'origine)
    var fxStart = opts.effect === 'reverb' ? seg - Math.min(seg, opts.window || 0.9) : opts.effect === 'vinyl' ? seg : seg - Math.min(seg, opts.fade || 2);

    return ctx.startRendering().then(function (out) {
      // anti-écrêtage (-0,5 dBFS) appliqué seulement à la zone de l'effet, avec une rampe de 80 ms
      var rs = Math.max(0, Math.floor((fxStart - 0.08) * SR)), ramp = Math.floor(0.08 * SR);
      var peak = 0, c, i2;
      for (c = 0; c < out.numberOfChannels; c++) {
        var d = out.getChannelData(c);
        for (i2 = rs; i2 < d.length; i2++) { var v = d[i2] < 0 ? -d[i2] : d[i2]; if (v > peak) peak = v; }
      }
      var lim = 0.944;
      if (peak > lim) {
        var g = lim / peak;
        for (c = 0; c < out.numberOfChannels; c++) {
          var d2 = out.getChannelData(c);
          for (i2 = rs; i2 < d2.length; i2++) d2[i2] *= 1 + (g - 1) * Math.min(1, (i2 - rs) / ramp);
        }
      }
      return out;
    });
  }

  /** AudioBuffer → WAV PCM entrelacé, 16 ou 24 bits (16 bits avec un léger dither triangulaire) */
  function encodeWav(buffer, bits) {
    bits = bits === 16 ? 16 : 24;
    var ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
    var bps = bits / 8, dataLen = n * ch * bps;
    var u8 = new Uint8Array(44 + dataLen);
    var dv = new DataView(u8.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) u8[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * bps, true); dv.setUint16(32, ch * bps, true); dv.setUint16(34, bits, true);
    str(36, 'data'); dv.setUint32(40, dataLen, true);
    var chans = [];
    for (var c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
    var o = 44, s, v;
    if (bits === 16) {
      for (var i = 0; i < n; i++) {
        for (c = 0; c < ch; c++) {
          s = chans[c][i] * 32767 + (Math.random() - Math.random());
          v = Math.round(s > 32767 ? 32767 : s < -32768 ? -32768 : s);
          if (v < 0) v += 65536;
          u8[o++] = v & 255; u8[o++] = (v >> 8) & 255;
        }
      }
      return u8;
    }
    for (var j = 0; j < n; j++) {
      for (c = 0; c < ch; c++) {
        s = chans[c][j];
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        v = Math.round(s * 8388607);
        if (v < 0) v += 16777216;
        u8[o++] = v & 255; u8[o++] = (v >> 8) & 255; u8[o++] = (v >> 16) & 255;
      }
    }
    return u8;
  }
  function encodeWav24(buffer) { return encodeWav(buffer, 24); }

  /** Extrait [a, b] rééchantillonné à la fréquence voulue, micro-fondus de 4 ms (pas de clic) */
  function renderSlice(buffer, a, b, sampleRate) {
    var sr = sampleRate || buffer.sampleRate, dur = Math.max(0.01, b - a);
    var ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(dur * sr), sr);
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer;
    src.connect(g).connect(ctx.destination);
    var f = Math.min(0.004, dur / 4);
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, f);
    g.gain.setValueAtTime(1, dur - f); g.gain.linearRampToValueAtTime(0, dur);
    src.start(0, a, dur);
    return ctx.startRendering();
  }

  window.OngakuEffects = { render: render, renderSlice: renderSlice, encodeWav: encodeWav, encodeWav24: encodeWav24, RENDER_SR: RENDER_SR };
})();
