const path = require('path'), fs = require('fs');
// Setzt Name, Beschreibung und Icon der .exe, damit im Task-Manager der echte Name statt "Electron" steht.
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const rcedit = require('rcedit');
  const name = ctx.packager.appInfo.productFilename, v = ctx.packager.appInfo.version;
  const ico = path.join(__dirname, 'build', 'icon.ico');
  const opts = { 'version-string': { ProductName: name, FileDescription: name, CompanyName: name, OriginalFilename: name + '.exe', InternalName: name, LegalCopyright: 'CC BY 4.0' }, 'file-version': v, 'product-version': v };
  if (fs.existsSync(ico)) opts.icon = ico;
  await rcedit(path.join(ctx.appOutDir, name + '.exe'), opts);
};
