// Compile Glaise en exécutable autonome (Node « Single Executable Application »).
// Le serveur est regroupé en un seul fichier, les fichiers du jeu (public/) sont embarqués.
//   npm install --no-save esbuild postject rcedit
//   node build/sea.mjs            -> dist/Glaise.exe (Windows) ou dist/glaise (Linux, macOS)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const win = process.platform === 'win32';
const exe = path.join(dist, win ? 'Glaise.exe' : 'glaise');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// 1. un seul fichier CommonJS pour le serveur
await build({
  entryPoints: [path.join(root, 'server.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: path.join(dist, 'server.cjs'), logLevel: 'error', legalComments: 'none',
});

// 2. fichiers du jeu embarqués
const assets = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else assets[path.relative(root, abs).split(path.sep).join('/')] = abs;
  }
})(path.join(root, 'public'));
const config = { main: path.join(dist, 'server.cjs'), output: path.join(dist, 'sea-prep.blob'), disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false, assets };
fs.writeFileSync(path.join(dist, 'sea-config.json'), JSON.stringify(config, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', path.join(dist, 'sea-config.json')], { stdio: 'inherit' });
console.log(`${Object.keys(assets).length} fichiers embarqués.`);

// 3. copie de l'exécutable Node, icône, puis injection
fs.copyFileSync(process.execPath, exe);
if (win) {
  try {
    const mod = await import('rcedit');
    const rcedit = mod.rcedit || mod.default;
    await rcedit(exe, {
      icon: path.join(root, 'build', 'glaise.ico'),
      'version-string': { ProductName: 'Glaise', FileDescription: 'Glaise - serveur de jeu', CompanyName: 'Glaise', LegalCopyright: 'Usage entre amis', OriginalFilename: 'Glaise.exe' },
      'file-version': '1.0.0', 'product-version': '1.0.0',
    });
    console.log('Icône appliquée.');
  } catch (e) { console.warn('Icône non appliquée :', e.message); }
}
const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
const args = [postject, exe, 'NODE_SEA_BLOB', path.join(dist, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, args, { stdio: 'inherit' });
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });
// Windows : application graphique (sous-système GUI) -> pas de fenêtre de console,
// le jeu s'ouvre directement dans sa propre fenêtre.
if (win) {
  const buf = fs.readFileSync(exe), pe = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('En-tête PE introuvable');
  buf.writeUInt16LE(2, pe + 24 + 68); // IMAGE_SUBSYSTEM_WINDOWS_GUI
  fs.writeFileSync(exe, buf);
  console.log('Sous-système : application graphique (sans console).');
}
for (const f of ['server.cjs', 'sea-prep.blob', 'sea-config.json']) fs.rmSync(path.join(dist, f), { force: true });
console.log('Exécutable prêt :', path.relative(root, exe), `(${Math.round(fs.statSync(exe).size / 1e6)} Mo)`);
