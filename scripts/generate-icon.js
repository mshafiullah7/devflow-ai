'use strict';
// Generates assets/icon.ico from assets/icon.png using sharp.
// ICO format: embeds PNG blobs for each size (supported on Windows Vista+).

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const SRC  = path.join(__dirname, '../assets/icon.png');
const DEST = path.join(__dirname, '../assets/icon.ico');
const SIZES = [16, 32, 48, 64, 128, 256];

async function buildIco(sizes, src) {
  const images = await Promise.all(
    sizes.map(size =>
      sharp(src).resize(size, size).png().toBuffer()
    )
  );

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0,            0); // reserved
  header.writeUInt16LE(1,            2); // type: 1 = ICO
  header.writeUInt16LE(sizes.length, 4); // image count

  // Directory entries: 16 bytes × N
  const dirEntrySize = 16;
  const dataOffset   = 6 + dirEntrySize * sizes.length;

  const dirs = [];
  let offset = dataOffset;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const buf  = images[i];
    const dir  = Buffer.alloc(dirEntrySize);
    dir.writeUInt8(size === 256 ? 0 : size, 0); // width  (0 = 256)
    dir.writeUInt8(size === 256 ? 0 : size, 1); // height (0 = 256)
    dir.writeUInt8(0,          2); // color count
    dir.writeUInt8(0,          3); // reserved
    dir.writeUInt16LE(1,       4); // planes
    dir.writeUInt16LE(32,      6); // bit count
    dir.writeUInt32LE(buf.length, 8);  // bytes in resource
    dir.writeUInt32LE(offset,    12);  // offset from file start
    dirs.push(dir);
    offset += buf.length;
  }

  return Buffer.concat([header, ...dirs, ...images]);
}

(async () => {
  const ico = await buildIco(SIZES, SRC);
  fs.writeFileSync(DEST, ico);
  console.log(`Written: ${DEST}  (${ico.length} bytes, ${SIZES.length} sizes: ${SIZES.join(', ')}px)`);
})().catch(err => { console.error(err); process.exit(1); });
