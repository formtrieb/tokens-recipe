import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zip } from '../src/editor/zip.js';

/** the entries of a ZIP as written by zip(): name → text, via the central directory */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true);
    out[name] = dec.decode(inflateRawSync(bytes.subarray(start, start + size)));
    at += 46 + nameLen;
  }
  return out;
}

describe('zip', () => {
  it('writes text files an unzipper reads back, UTF-8 names included', async () => {
    const files = { 'model.css': ':root { --x: 1; }\n', 'tokens/Größe.json': '{"ä": 1}' };
    const blob = await zip(files, new Date(2026, 9, 6, 12, 0, 0));
    expect(blob.type).toBe('application/zip');
    expect(unzip(new Uint8Array(await blob.arrayBuffer()))).toEqual(files);
  });

  it('refuses a path that would leave the target folder', async () => {
    for (const path of ['../x', '/abs', 'a//b', 'a\\b', 'c:x', './x', ''])
      await expect(zip({ [path]: '' })).rejects.toThrow(/unsafe path/);
  });
});
