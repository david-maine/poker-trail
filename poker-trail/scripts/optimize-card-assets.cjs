// Keep the supplied originals; ship display-sized copies to limit decoded image memory.
const fs = require('node:fs');
const path = require('node:path');
const Jimp = require('jimp-compact');

async function main() {
  const source = path.resolve(__dirname, '../assets/images/cards');
  const output = path.join(source, 'display');
  fs.mkdirSync(output, { recursive: true });
  const files = fs.readdirSync(source).filter(name => name.endsWith('.png')).sort();
  let before = 0, after = 0;
  // Decode serially so optimizing the high-resolution originals also stays bounded.
  for (const name of files) {
    const image = await Jimp.read(path.join(source, name));
    before += image.bitmap.width * image.bitmap.height * 4;
    if (image.bitmap.width > 320) image.resize(320, Jimp.AUTO);
    after += image.bitmap.width * image.bitmap.height * 4;
    await image.writeAsync(path.join(output, name));
  }
  console.log(`Prepared ${files.length} card images; decoded memory ${(before / 1048576).toFixed(1)} MiB -> ${(after / 1048576).toFixed(1)} MiB.`);
  require('./bundle-web-card-assets.cjs').bundleWebCardAssets();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
