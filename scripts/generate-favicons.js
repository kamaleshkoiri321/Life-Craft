const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="8" fill="#171622"/>
  <g transform="translate(6, 6) scale(0.8333333333)" stroke="#C8F27C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <circle cx="12" cy="12" r="10"/>
    <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>
  </g>
</svg>`;

const publicDir = path.join(__dirname, '..', 'public');

function buildIco(images) {
  // images is array of { width, height, buffer }
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(count, 4);

  let offset = 6 + 16 * count;
  const entries = [];
  const buffers = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(img.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    buffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...buffers]);
}

async function main() {
  // 1. Write public/icon.svg
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
  console.log('Wrote public/icon.svg');

  const svgBuffer = Buffer.from(svgContent);

  // 2. Generate PNGs of various sizes
  const sizes = [16, 32, 48, 64, 180, 192, 512];
  const pngBuffers = {};

  for (const size of sizes) {
    const buf = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers[size] = buf;
  }

  // Save key PNGs
  fs.writeFileSync(path.join(publicDir, 'icon-16.png'), pngBuffers[16]);
  fs.writeFileSync(path.join(publicDir, 'icon-32.png'), pngBuffers[32]);
  fs.writeFileSync(path.join(publicDir, 'icon-48.png'), pngBuffers[48]);
  fs.writeFileSync(path.join(publicDir, 'icon.png'), pngBuffers[64]);
  fs.writeFileSync(path.join(publicDir, 'apple-icon.png'), pngBuffers[180]);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), pngBuffers[192]);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), pngBuffers[512]);
  console.log('Generated PNGs');

  // 3. Assemble public/favicon.ico with 16, 32, 48
  const icoBuffer = buildIco([
    { width: 16, height: 16, buffer: pngBuffers[16] },
    { width: 32, height: 32, buffer: pngBuffers[32] },
    { width: 48, height: 48, buffer: pngBuffers[48] },
  ]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log(`Generated public/favicon.ico (${icoBuffer.length} bytes)`);

  // Ensure app/ does NOT have conflicting files
  const appDir = path.join(__dirname, '..', 'app');
  for (const f of ['favicon.ico', 'icon.svg', 'icon.png']) {
    const p = path.join(appDir, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`Removed conflicting ${p}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

