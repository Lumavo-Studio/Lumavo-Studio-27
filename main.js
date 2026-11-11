const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const { spawn } = require('child_process'), os = require('os');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const FF = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
let win, dirtyFlag = false, force = false;
const send = c => win && win.webContents.send('cmd', c);

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: '#1c1d1f', title: 'Lumavo Studio 27', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', e => {
    if (!dirtyFlag || force) return;
    const r = dialog.showMessageBoxSync(win, { type: 'question', message: 'Änderungen speichern? / Save changes?', detail: 'Dein Projekt hat ungespeicherte Änderungen.', buttons: ['Speichern / Save', 'Nicht speichern / Do not save', 'Abbrechen / Cancel'], defaultId: 0, cancelId: 2, noLink: true });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) { e.preventDefault(); send('saveclose'); }
  });
}

function buildMenu() {
  const I = (label, cmd, accelerator, extra) => ({ label, accelerator, click: () => send(cmd), ...extra });
  const hint = { registerAccelerator: false };
  const info = (title, message) => dialog.showMessageBox(win, { type: 'info', title, message, buttons: ['OK'] });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Datei', submenu: [
      I('Neues Projekt', 'new', 'CmdOrCtrl+N'), I('Projekt öffnen …', 'open', 'CmdOrCtrl+O'), I('Projekt speichern …', 'save', 'CmdOrCtrl+Shift+S'), I('Neue Timeline', 'newtl', 'CmdOrCtrl+T'),
      { type: 'separator' }, I('Medien importieren …', 'import', 'CmdOrCtrl+I'), I('Film exportieren …', 'export', 'CmdOrCtrl+E'),
      { type: 'separator' }, { role: 'quit', label: 'Beenden' } ] },
    { label: 'Bearbeiten', submenu: [
      I('Rückgängig', 'undo', 'CmdOrCtrl+Z', hint), I('Am Marker teilen', 'split', 'S', hint),
      I('Löschen', 'del', 'Delete', hint), I('Löschen und Lücke schließen', 'rdel', 'Shift+Delete', hint) ] },
    { label: 'Ansicht', submenu: [
      ...['Medien', 'Schneiden', 'Farbe', 'Ton', 'Export'].map((s, i) => I(s, 'step:' + s, 'CmdOrCtrl+' + (i + 1))),
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Vollbild' }, { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' }, { role: 'resetZoom', label: 'Originalgröße' } ] },
    { label: 'Erweiterungen', submenu: [ { label: 'Erweiterungsordner öffnen', click: () => shell.openPath(extDir()) }, I('Erweiterungen neu laden', 'ext') ] },
    { label: 'Hilfe', submenu: [
      { label: 'Tastenkürzel', click: () => info('Tastenkürzel', 'Leertaste: Abspielen\nS: Teilen\nEntf: Löschen\nUmschalt+Entf: Löschen und Lücke schließen\nStrg+Z: Rückgängig\nPfeiltasten: Abspielmarke springen\nStrg+1 bis 4: Arbeitsschritt wechseln') },
      { label: 'Über Lumavo', click: () => info('Lumavo ' + app.getVersion(), 'Videoschnitt, den jeder versteht.\nRendering mit FFmpeg.') } ] }
  ]));
}

const IMG = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const probe = f => new Promise(res => {
  if (IMG.test(f)) return res({ path: f, name: path.basename(f), url: pathToFileURL(f).href, d: 600, v: true, a: false, img: true });
  let s = ''; const p = spawn(FF, ['-hide_banner', '-i', f]);
  p.stderr.on('data', d => s += d); p.on('error', () => res(null));
  p.on('close', () => {
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(s);
    if (!m) return res(null);
    res({ path: f, name: path.basename(f), url: pathToFileURL(f).href, d: +m[1] * 3600 + +m[2] * 60 + +m[3],
      v: /Stream #[^\n]*Video:(?![^\n]*attached pic)/.test(s), vc: ((/Stream #[^\n]*Video: ([A-Za-z0-9_]+)/.exec(s)) || [])[1] || '', a: /Stream #[^\n]*Audio:/.test(s) });
  });
});
const probeAll = async ps => (await Promise.all(ps.map(probe))).filter(Boolean);

ipcMain.handle('probe', (_, ps) => probeAll(ps));
ipcMain.handle('pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video, Bild und Audio', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mxf', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] }] });
  return r.canceled ? [] : probeAll(r.filePaths);
});

const BUILTIN = [
  { id: 'b:bw', label: 'Schwarzweiß', filter: 'hue=s=0', css: 'grayscale(1)' },
  { id: 'b:sepia', label: 'Sepia', filter: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', css: 'sepia(1)' },
  { id: 'b:blur', label: 'Weichzeichner', filter: 'gblur=sigma=4', css: 'blur(4px)' },
  { id: 'b:sharp', label: 'Schärfen', filter: 'unsharp=5:5:1.0', css: 'contrast(1.1)' },
  { id: 'b:vig', label: 'Vignette', filter: 'vignette=PI/4', css: '' },
  { id: 'b:neg', label: 'Negativ', filter: 'negate', css: 'invert(1)' },
  { id: 'b:warm', label: 'Warm', filter: 'colorbalance=rs=.12:bs=-.12', css: 'sepia(.35) saturate(1.2)' },
  { id: 'b:cold', label: 'Kalt', filter: 'colorbalance=rs=-.12:bs=.12', css: 'hue-rotate(15deg) saturate(.9)' },
  { id: 'b:muted', label: 'Entsättigt', filter: 'eq=saturation=.55:contrast=1.08', css: 'saturate(.55) contrast(1.08)' },
  { id: 'b:cine', label: 'Kino-Look', filter: 'colorbalance=rs=.08:gs=-.02:bs=-.1:rh=.1:bh=-.05,eq=contrast=1.12:saturation=1.1', css: 'contrast(1.12) saturate(1.1) sepia(.15)' },
  { id: 'b:vivid', label: 'Kräftige Farben', filter: 'eq=saturation=1.6:contrast=1.05', css: 'saturate(1.6) contrast(1.05)' },
  { id: 'b:bright', label: 'Aufhellen', filter: 'eq=brightness=.1:gamma=1.1', css: 'brightness(1.15)' },
  { id: 'b:dark', label: 'Abdunkeln', filter: 'eq=brightness=-.1:gamma=.9', css: 'brightness(.85)' },
  { id: 'b:soft', label: 'Sehr weich', filter: 'gblur=sigma=12', css: 'blur(10px)' },
  { id: 'b:strong', label: 'Stark schärfen', filter: 'unsharp=7:7:2.0', css: 'contrast(1.2)' },
  { id: 'b:mirror', label: 'Spiegeln', filter: 'hflip', css: '' },
  { id: 'b:pix', label: 'Pixeln', filter: 'scale=iw/24:ih/24,scale=iw*24:ih*24:flags=neighbor', css: '' }
];
const BUILTIN_A = [
  { id: 'a:norm', label: 'Normalisieren', filter: 'loudnorm=I=-16:TP=-1.5:LRA=11' },
  { id: 'a:denoise', label: 'Rauschen entfernen', filter: 'afftdn=nr=12' },
  { id: 'a:voice', label: 'Stimme klarer', filter: 'highpass=f=90,lowpass=f=12000,acompressor=threshold=-18dB:ratio=3' },
  { id: 'a:bass', label: 'Bass verstärken', filter: 'bass=g=6' },
  { id: 'a:treble', label: 'Höhen verstärken', filter: 'treble=g=5' }
];
const projDir = () => path.join(app.getPath('documents'), 'Lumavo Studio 27');
const expDir = () => path.join(projDir(), 'Exporte');
const extDir = () => path.join(app.getPath('userData'), 'extensions');
function seedExt() {
  if (fs.existsSync(extDir())) return;
  fs.mkdirSync(extDir(), { recursive: true });
  const src = path.join(__dirname, 'extensions');
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(extDir(), f));
}
function loadExt() {   // Erweiterungen sind reine JSON-Dateien: Looks (FFmpeg-Filter) und Export-Formate
  const out = { presets: [], effects: BUILTIN.slice(), audio: BUILTIN_A.slice() };
  try {
    for (const f of fs.readdirSync(extDir()).filter(n => n.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(extDir(), f), 'utf8')), n = String(j.name || f);
      (j.presets || []).forEach(p => Array.isArray(p.args) && /^\w+$/.test(p.ext) &&
        out.presets.push({ id: 'x:' + n + ':' + p.id, label: n + ' · ' + p.label, ext: p.ext, args: p.args.map(String) }));
      (j.effects || []).forEach(e => /^[\w=:.,()\-+*\/ ]+$/.test(e.filter || '') &&
        out.effects.push({ id: 'x:' + n + ':' + e.id, label: n + ' · ' + e.label, filter: e.filter, css: String(e.css || '').replace(/[^\w(). %-]/g, '') }));
    }
  } catch (e) { /* defekte Erweiterung ignorieren */ }
  return out;
}
ipcMain.handle('ext', () => loadExt());
const CRF = { 'mp4-h264': { high: 16, mid: 20, low: 25 }, 'mp4-h265': { high: 18, mid: 22, low: 27 }, 'mkv-h264': { high: 16, mid: 20, low: 25 }, 'webm-vp9': { high: 24, mid: 31, low: 38 } };
const AB = { high: '320k', mid: '192k', low: '128k' };
function codecFor(fmt, q) {
  const c = (CRF[fmt] || {})[q] || 20, ab = AB[q] || '192k';
  const h264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', c, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', ab];
  return {
    'mp4-h264': { ext: 'mp4', a: [...h264, '-movflags', '+faststart'] },
    'mkv-h264': { ext: 'mkv', a: h264 },
    'mp4-h265': { ext: 'mp4', a: ['-c:v', 'libx265', '-preset', 'medium', '-crf', c, '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', ab] },
    'mov-prores': { ext: 'mov', a: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'] },
    'webm-vp9': { ext: 'webm', a: ['-c:v', 'libvpx-vp9', '-crf', c, '-b:v', '0', '-row-mt', '1', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', ab] },
    mp3: { ext: 'mp3', a: ['-vn', '-c:a', 'libmp3lame', '-b:a', ab], audio: true },
    wav: { ext: 'wav', a: ['-vn', '-c:a', 'pcm_s16le'], audio: true }
  }[fmt];
}
const td = c => (c.o - c.i) / (c.sp || 1);
const tempo = s => (s >= 0.5 ? `atempo=${s}` : `atempo=0.5,atempo=${s / 0.5}`);
function tfm(c, W, H) {
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const z0 = cl(+c.z || 1, 0.5, 3), z1 = c.z2 == null ? z0 : cl(+c.z2, 0.5, 3), p0 = cl(+c.p0 || 0, -1, 1), p1 = cl(+c.p1 || 0, -1, 1), rt = cl(+c.rt || 0, -180, 180), d = Math.max(0.01, c.o - c.i);
  let s = '';
  if (z0 !== z1 || p0 !== p1) {   // Keyframes: linear von Anfang bis Ende
    const a = Math.max(1, z0), b = Math.max(1, z1), Z = `(${a}+(${b}-${a})*t/${d})`, P = `(${p0}+(${p1}-${p0})*t/${d})`;
    s += `,scale=w='trunc(${W}*${Z}/2)*2':h='trunc(${H}*${Z}/2)*2':eval=frame,crop=${W}:${H}:x='(iw-${W})/2*(1+${P})':y='(ih-${H})/2'`;
  } else if (z0 !== 1) {
    const zw = Math.round(W * z0 / 2) * 2, zh = Math.round(H * z0 / 2) * 2;
    s += `,scale=${zw}:${zh}` + (z0 > 1 ? `,crop=${W}:${H}:(iw-${W})/2*(1+${p0}):(ih-${H})/2` : `,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`);
  }
  if (rt) s += `,rotate=${rt}*PI/180:ow=iw:oh=ih:c=black`;
  return s;
}
ipcMain.on('dirty', (_, d) => { dirtyFlag = !!d; });
ipcMain.handle('forceclose', () => { force = true; win.close(); });
ipcMain.handle('ask', async (_, message, detail, buttons) => (await dialog.showMessageBox(win, { type: 'question', message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true })).response);
ipcMain.handle('projdir', () => projDir());
ipcMain.handle('openproj', () => shell.openPath(projDir()));
ipcMain.handle('proxy', (_, src) => new Promise(res => {
  const dir = path.join(projDir(), 'Proxys'); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, path.basename(src).replace(/\.[^.]+$/, '') + '-' + Date.now().toString(36) + '.mp4');
  const p = spawn(FF, ['-y', '-nostdin', '-hide_banner', '-i', src, '-vf', 'scale=-2:540', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  p.on('error', () => res(null)); p.on('close', c => res(c === 0 ? pathToFileURL(out).href : null));
}));
const readProject = (p, keep) => { try { const o = JSON.parse(fs.readFileSync(p, 'utf8')); if (!keep) { o.proj = o.proj || {}; o.proj.path = p; } return o; } catch (e) { return null; } };
const autoFile = () => path.join(projDir(), 'Autosave', 'auto.lumavo');
ipcMain.handle('save', async (_, data, saveAs) => {
  let p = data.proj && data.proj.path;
  if (!p || saveAs) {
    const r = await dialog.showSaveDialog(win, { defaultPath: p || path.join(projDir(), 'Projekte', ((data.proj && data.proj.name) || 'Projekt') + '.lumavo'), filters: [{ name: 'Lumavo-Projekt', extensions: ['lumavo'] }] });
    if (r.canceled) return false; p = r.filePath;
  }
  data.proj = data.proj || {}; data.proj.path = p; fs.writeFileSync(p, JSON.stringify(data)); return p;
});
ipcMain.handle('open', async () => {
  const r = await dialog.showOpenDialog(win, { defaultPath: path.join(projDir(), 'Projekte'), properties: ['openFile'], filters: [{ name: 'Lumavo-Projekt', extensions: ['lumavo'] }] });
  return r.canceled ? null : readProject(r.filePaths[0]);
});
ipcMain.handle('openat', (_, p) => readProject(p));
ipcMain.handle('autosave', (_, d) => { try { fs.mkdirSync(path.dirname(autoFile()), { recursive: true }); if (d) fs.writeFileSync(autoFile(), JSON.stringify(d)); else fs.rmSync(autoFile(), { force: true }); } catch (e) {} });
ipcMain.handle('autoload', () => readProject(autoFile(), true));
ipcMain.handle('quit', () => { force = true; app.quit(); });
const MEDIA = /\.(mp4|mov|mkv|webm|avi|m4v|mxf|mp3|wav|m4a|aac|flac|ogg|aiff?|png|jpe?g|webp|gif|bmp|tiff?)$/i;
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
ipcMain.handle('impfolder', async () => {   // Ordner als Projekt: Medien suchen, prüfen und ein optionales Log (CSV) lesen
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: app.getPath('downloads') });
  if (r.canceled) return null;
  const files = walk(r.filePaths[0]), items = await probeAll(files.filter(f => MEDIA.test(f))), csv = files.find(f => /\.csv$/i.test(f));
  let log = [];
  if (csv) {
    const rows = fs.readFileSync(csv, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split(',')), head = rows.shift().map(s => s.trim().toLowerCase());
    log = rows.map(c => Object.fromEntries(head.map((h, i) => [h, (c[i] || '').trim()])));
  }
  return { name: path.basename(r.filePaths[0]), items, log };
});
ipcMain.handle('wave', (_, f, dur) => new Promise(res => {   // Wellenform: 4 kHz mono, Spitzenwerte pro Abschnitt
  const p = spawn(FF, ['-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-']), bufs = [];
  p.stdout.on('data', d => bufs.push(d)); p.on('error', () => res(null));
  p.on('close', () => {
    const b = Buffer.concat(bufs), n = Math.floor(b.length / 2); if (!n) return res(null);
    const N = Math.min(3000, Math.max(50, Math.ceil(dur * 10))), step = Math.ceil(n / N), out = [];
    for (let i = 0; i < n; i += step) { let mx = 0; for (let j = i; j < Math.min(n, i + step); j++) mx = Math.max(mx, Math.abs(b.readInt16LE(j * 2))); out.push(Math.min(255, Math.round(mx / 128))); }
    res(out);
  });
}));
ipcMain.handle('export', async (_, { media, clips, set, titles = {}, mix = {} }) => {
  const X = loadExt(), xp = X.presets.find(p => p.id === set.fmt);
  const spec = xp ? { ext: xp.ext, a: xp.args } : codecFor(set.fmt, set.q) || codecFor('mp4-h264', 'high');
  const M = c => media.find(x => x.id === c.m);
  if (spec.audio && !clips.some(c => M(c).a)) return { ok: false, msg: 'Keine Audiospur vorhanden.' };
  fs.mkdirSync(expDir(), { recursive: true });
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(expDir(), 'Film.' + spec.ext), filters: [{ name: 'Video', extensions: [spec.ext] }] });
  if (r.canceled) return { ok: false, msg: 'Abgebrochen.' };
  let [W, H] = String(set.res).split('x').map(n => Math.max(16, Math.min(7680, Math.round(+n) || 0)));
  W -= W % 2; H -= H % 2;
  const fps = /^\d+(\.\d+)?(\/\d+)?$/.test(String(set.fps)) ? String(set.fps) : '30';
  const D = clips.reduce((a, c) => Math.max(a, c.s + td(c)), 0), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));
  const args = ['-y', '-nostdin', '-hide_banner'], al = [], f = spec.audio ? [] : [`color=c=black:s=${W}x${H}:r=${fps}:d=${D}[b0]`];
  const AE = id => (BUILTIN_A.find(a => a.id === id) || {}).filter, fd = (c, k) => Math.min(+c[k] || 0, td(c)), mv = k => (mix[k] == null ? 1 : +mix[k]);
  clips.forEach((c, k) => {
    const m = M(c), sp = c.sp || 1, fi = fd(c, 'fi'), fo = fd(c, 'fo');
    if (c.tr === 'T1') {   // Titel: als PNG aus der Vorschau gerendert
      const png = path.join(tmp, k + '.png'); fs.writeFileSync(png, Buffer.from(String(titles[c.id] || '').split(',')[1] || '', 'base64'));
      args.push('-loop', '1', '-framerate', fps, '-t', td(c), '-i', png); return;
    }
    if (m.img) args.push('-loop', '1', '-framerate', fps, '-t', td(c), '-i', m.path); else args.push('-ss', c.i, '-t', c.o - c.i, '-i', m.path);
    if (m.a) {
      f.push(`[${k}:a]aresample=48000,asetpts=PTS-STARTPTS${sp !== 1 ? ',' + tempo(sp) : ''},volume=${(c.mu ? 0 : c.vol) * mv(c.tr) * mv('M')}${AE(c.ae) ? ',' + AE(c.ae) : ''}${fi ? `,afade=t=in:st=0:d=${fi}` : ''}${fo ? `,afade=t=out:st=${td(c) - fo}:d=${fo}` : ''},adelay=${Math.round(c.s * 1000)}:all=1[a${k}]`);
      al.push(`[a${k}]`);
    }
  });
  let last = 'b0';   // Video: V1 unten, V2 darüber, Titel ganz oben
  const idx = clips.map((c, k) => k);
  const vOrder = spec.audio ? [] : idx.filter(k => clips[k].tr[0] === 'V' && M(clips[k]).v).sort((a, b) => clips[a].tr < clips[b].tr ? -1 : 1);
  const tOrder = spec.audio ? [] : idx.filter(k => clips[k].tr === 'T1');
  const fadeStr = (c, fi, fo, sp) => `${fi || fo ? ',format=yuva420p' : ''}${fi ? `,fade=t=in:st=0:d=${fi * sp}:alpha=1` : ''}${fo ? `,fade=t=out:st=${(c.o - c.i) - fo * sp}:d=${fo * sp}:alpha=1` : ''}`;
  for (const k of vOrder) {
    const c = clips[k], lk = X.effects.find(e => e.id === c.lk), sp = c.sp || 1, fi = fd(c, 'fi'), fo = fd(c, 'fo'), sl = c.sl || '';
    let ox = '0', oy = '0';
    if (sl) {   // Schieben: Clip fährt über die Ein-/Ausblenddauer herein und heraus
      const S = c.s, E = c.s + td(c), p = fi ? `min(max((t-${S})/${fi},0),1)` : '1', q = fo ? `min(max((t-${E - fo})/${fo},0),1)` : '0', m2 = `((1-${p})-${q})`;
      if (sl === 'L') ox = `-main_w*${m2}`; else if (sl === 'R') ox = `main_w*${m2}`; else if (sl === 'U') oy = `-main_h*${m2}`; else oy = `main_h*${m2}`;
    }
    f.push(`[${k}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}${tfm(c, W, H)},eq=brightness=${c.b || 0}:contrast=${c.c || 1}:saturation=${c.sa == null ? 1 : c.sa}${lk ? ',' + lk.filter : ''}${sl ? '' : fadeStr(c, fi, fo, sp)},setpts=(PTS-STARTPTS)/${sp}+${c.s}/TB[v${k}]`,
           `[${last}][v${k}]overlay=x='${ox}':y='${oy}':eof_action=pass:format=auto[o${k}]`);
    last = 'o' + k;
  }
  for (const k of tOrder) {
    const c = clips[k], fi = fd(c, 'fi'), fo = fd(c, 'fo');
    f.push(`[${k}:v]format=yuva420p${fi ? `,fade=t=in:st=0:d=${fi}:alpha=1` : ''}${fo ? `,fade=t=out:st=${td(c) - fo}:d=${fo}:alpha=1` : ''},setpts=PTS-STARTPTS+${c.s}/TB[v${k}]`, `[${last}][v${k}]overlay=eof_action=pass:format=auto[o${k}]`);
    last = 'o' + k;
  }
  if (al.length) f.push(`${al.join('')}amix=inputs=${al.length}:normalize=0:duration=longest[aout]`);
  args.push('-filter_complex', f.join(';'), ...(spec.audio ? [] : ['-map', `[${last}]`]), ...(al.length ? ['-map', '[aout]'] : ['-an']), ...spec.a, '-t', D, r.filePath);
  return new Promise(res => {
    const p = spawn(FF, args.map(String)); let err = '';
    const clean = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };
    p.stderr.on('data', d => {
      err = (err + d).slice(-1500);
      const t = [...String(d).matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
      if (t && win) win.webContents.send('progress', +t[1] * 3600 + +t[2] * 60 + +t[3]);
    });
    p.on('error', e => { clean(); res({ ok: false, msg: e.message }); });
    p.on('close', code => { clean(); if (code === 0) { shell.showItemInFolder(r.filePath); res({ ok: true, path: r.filePath }); } else res({ ok: false, msg: err.split('\n').slice(-3).join(' ') }); });
  });
});
ipcMain.handle('theme', (_, t) => { nativeTheme.themeSource = t === 'auto' ? 'system' : t; });
ipcMain.handle('openext', () => shell.openPath(extDir()));
ipcMain.handle('about', (_, msg) => dialog.showMessageBox(win, { type: 'info', title: 'Lumavo Studio 27', message: 'Lumavo Studio 27', detail: 'Version ' + app.getVersion() + '\n' + msg + '\nFFmpeg' }));

app.whenReady().then(() => { fs.mkdirSync(path.join(projDir(), 'Projekte'), { recursive: true }); fs.mkdirSync(expDir(), { recursive: true }); seedExt(); Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null); createWindow(); app.on('activate', () => BrowserWindow.getAllWindows().length || createWindow()); });
app.on('window-all-closed', () => process.platform === 'darwin' || app.quit());
