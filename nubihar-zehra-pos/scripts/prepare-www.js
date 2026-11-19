const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

const copyTargets = ['index.html', 'manifest.json', 'sw.js', 'icon.svg', 'version.json', 'css', 'js'];
for (const item of copyTargets) {
  const src = path.join(root, item);
  const dst = path.join(www, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
  }
}
console.log('www/ folder prepared for Android APK build.');
