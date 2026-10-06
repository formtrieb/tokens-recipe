/**
 * A minimal ZIP writer for "download everything": text files, deflate via
 * the browser's CompressionStream, no dependency. Enough of APPNOTE 6.3:
 * local headers, central directory, end record; UTF-8 names (flag 11); no
 * ZIP64 (the model is a few MB).
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** MS-DOS time and date of a moment (local time, 2-second steps) */
function dosTime(d: Date): [number, number] {
  return [
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  ];
}

/**
 * an entry name an unzipper writes inside its target folder: relative, `/`
 * only, no empty, `.` or `..` segment, no control characters (zip slip)
 */
function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    !/[\\:\u0000-\u001f]/.test(path) &&
    path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
  );
}

/** files by path (`tokens/Mode/Light.json`) → a ZIP blob */
export async function zip(
  files: Record<string, string>,
  at = new Date(),
): Promise<Blob> {
  const enc = new TextEncoder();
  const [time, date] = dosTime(at);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    if (!safePath(path))
      throw new Error(`ZIP: unsafe path ${JSON.stringify(path)}`);
    const name = enc.encode(path);
    const raw = enc.encode(text);
    const data = await deflate(raw);
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed: 2.0 (deflate)
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 8, true); // deflate
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true); // made by
    head.setUint16(6, 20, true); // needed
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, 8, true);
    head.setUint16(12, time, true);
    head.setUint16(14, date, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, raw.length, true);
    head.setUint16(28, name.length, true);
    // extra, comment, disk, internal and external attributes stay 0
    head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const count = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob(
    [
      ...parts,
      ...central,
      new Uint8Array(end.buffer),
    ] as Uint8Array<ArrayBuffer>[],
    { type: 'application/zip' },
  );
}
