// test-xlsx.mjs - xlsxBuild (zip kiểu stored + XML tự viết) và downloadBlob/downloadCsv. Run: node test-xlsx.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

/* Đọc zip: central directory -> từng mục (stored), kiểm cả local header. */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header');
    const e = {
      flags: buf.readUInt16LE(p + 8), method: buf.readUInt16LE(p + 10), time: buf.readUInt16LE(p + 12), date: buf.readUInt16LE(p + 14),
      crc: buf.readUInt32LE(p + 16), csize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24), versionNeeded: buf.readUInt16LE(p + 6),
    };
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    e.name = buf.toString('utf8', p + 46, p + 46 + nl);
    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('bad local header');
    const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28);
    e.localCrc = buf.readUInt32LE(off + 14); e.localSize = buf.readUInt32LE(off + 22);
    e.data = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + e.csize);
    entries.push(e);
    p += 46 + nl + el + cl;
  }
  return entries;
}

build({ quiet: true });
const page = await createDriver();
try {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });

  const has = await page.eval(`({ x: typeof xlsxBuild, d: typeof downloadBlob })`);
  check('xlsxBuild and downloadBlob exist', has.x === 'function' && has.d === 'function', JSON.stringify(has));

  if (has.x === 'function') {
    const arr = await page.eval(`Array.from(xlsxBuild('SIM', ['Số thuê bao','Người giữ'], [['0902343108','Nguyễn Văn "A", Ltd & <Co>'], ['0911000222','=HYPERLINK("x")']]))`);
    const buf = Buffer.from(arr);
    const entries = readZip(buf);
    const names = entries.map((e) => e.name);
    const want = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/styles.xml'];
    check('zip has exactly the 6 parts', names.length === 6 && want.every((w) => names.includes(w)), names.join(', '));
    check('zip starts with PK local header', buf.readUInt32LE(0) === 0x04034b50);
    check('all entries stored, version 20, UTF-8 flag', entries.every((e) => e.method === 0 && e.versionNeeded === 20 && (e.flags & 0x0800) === 0x0800 && e.csize === e.size));
    check('CRC32 of each entry matches zlib.crc32 (central and local)', entries.every((e) => e.crc === zlib.crc32(e.data) && e.localCrc === e.crc && e.localSize === e.size), entries.map((e) => e.crc.toString(16)).join(' '));
    const day = (d) => d & 31, mon = (d) => (d >> 5) & 15;
    check('DOS date/time valid', entries.every((e) => day(e.date) >= 1 && day(e.date) <= 31 && mon(e.date) >= 1 && mon(e.date) <= 12 && (e.time >> 11) < 24 && ((e.time >> 5) & 63) < 60));

    const get = (n) => entries.find((e) => e.name === n).data.toString('utf8');
    const sheet = get('xl/worksheets/sheet1.xml');
    check('sheet: 0902343108 in an inlineStr cell', /<c r="A2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>0902343108<\/t><\/is><\/c>/.test(sheet), sheet.slice(0, 600));
    check('sheet: no numeric cells (no <v>)', !/<v>/.test(sheet));
    check('sheet: Vietnamese + escaped text round-trips UTF-8', sheet.includes('Nguyễn Văn "A", Ltd &amp; &lt;Co&gt;') && sheet.includes('Số thuê bao'));
    check('sheet: =HYPERLINK("x") is a text cell, no <f>', /<c r="B3"[^>]*t="inlineStr"[^>]*><is><t[^>]*>=HYPERLINK\("x"\)<\/t><\/is><\/c>/.test(sheet) && !/<f[ >]/.test(sheet));
    check('sheet: header cells use style s="1"', /<c r="A1" s="1"/.test(sheet) && /<c r="B1" s="1"/.test(sheet));
    const styles = get('xl/styles.xml');
    check('styles.xml has a bold font and cellXfs', /<b\/>/.test(styles) && /<cellXfs count="2">/.test(styles));
    check('XML declaration with standalone="yes"', entries.filter((e) => e.name.endsWith('.xml') || e.name.endsWith('.rels')).every((e) => e.data.toString('utf8').startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')));
    check('workbook sheet name SIM', /<sheet name="SIM"/.test(get('xl/workbook.xml')));

    /* tên sheet */
    const wb = await page.eval(`Array.from(xlsxBuild(${JSON.stringify('a/b*c'.repeat(10))}, ['H'], [['x']]))`);
    const m = /<sheet name="([^"]*)"/.exec(readZip(Buffer.from(wb)).find((e) => e.name === 'xl/workbook.xml').data.toString('utf8'));
    check('sheet name sanitised (<=31 chars, none of []:*?/\\)', m && m[1].length > 0 && m[1].length <= 31 && !/[\[\]:*?\/\\]/.test(m[1]), m && m[1]);
    const empty = await page.eval(`Array.from(xlsxBuild('/*?', ['H'], []))`);
    const m2 = /<sheet name="([^"]*)"/.exec(readZip(Buffer.from(empty)).find((e) => e.name === 'xl/workbook.xml').data.toString('utf8'));
    check('empty sheet name falls back to Sheet1', m2 && m2[1] === 'Sheet1', m2 && m2[1]);

    /* ký tự điều khiển không hợp lệ, nhiều hơn 26 cột, ô null */
    const wide = await page.eval(`(() => {
      const h = []; for (let i = 0; i < 30; i++) h.push('H' + i);
      const r = [h.map((_, i) => i === 0 ? 'a\\u0000b\\u0001c\\u000bd\\ttab' : (i === 5 ? null : 'v' + i))];
      return Array.from(xlsxBuild('W', h, r));
    })()`);
    const ws = readZip(Buffer.from(wide)).find((e) => e.name === 'xl/worksheets/sheet1.xml').data.toString('utf8');
    check('control chars stripped, tab kept', ws.includes('>abcd\ttab<') && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(ws));
    check('columns beyond Z: AA1, AD1 exist; AA2 value v26', /<c r="AA1"/.test(ws) && /<c r="AD1"/.test(ws) && />v26</.test(ws));
    check('null cell becomes empty text cell', /<c r="F2"[^>]*t="inlineStr"[^>]*><is><t[^>]*><\/t><\/is><\/c>/.test(ws));
    check('leading/trailing space preserved (xml:space)', await page.eval(`(() => { const z = Array.from(xlsxBuild('S', ['H'], [[' x ']])); return new TextDecoder().decode(new Uint8Array(z)).includes('xml:space="preserve"> x <'); })()`));
  }

  /* Thay cho việc mở thử bằng Excel: MỌI phần của workbook phải là XML well-formed (DOMParser không trả parsererror).
     Dùng cả dữ liệu thù địch: & < > ' " , =HYPERLINK, emoji, ký tự điều khiển, khoảng trắng đầu/cuối, tên sheet lạ. */
  if (has.x === 'function') {
    const hostileHeaders = ['Số thuê bao', 'A&B <x> "q" \'s\'', '=HYPERLINK("http://x")', '😀 emoji'];
    const hostileRows = [
      ['0902343108', 'Tom & Jerry <script>alert("x")</script>', '=HYPERLINK("x",\'y\')', '😀👍🏽 \u{1F9D1}\u200D\u{1F4BB}'],
      ['a\u0000b\u0001c\u000bd\u001fe\ttab', '&amp; &lt; &#x1; ]]> <![CDATA[x]]>', '"quoted" \'single\'', ' lead and trail '],
      ['\uFFFE\uFFFF', '+1', '-1', '@SUM(1)'],
    ];
    const sheetNames = ['SIM', 'A&B <c> "d"\'', '😀'];
    for (const nm of sheetNames) {
      const arr = await page.eval(`Array.from(xlsxBuild(${JSON.stringify(nm)}, ${JSON.stringify(hostileHeaders)}, ${JSON.stringify(hostileRows)}))`);
      const parts = readZip(Buffer.from(arr)).map((e) => ({ name: e.name, xml: e.data.toString('utf8') }));
      const bad = await page.eval(`(() => {
        const out = [];
        for (const p of ${JSON.stringify(parts)}) {
          const doc = new DOMParser().parseFromString(p.xml, 'application/xml');
          const err = doc.getElementsByTagName('parsererror');
          if (err.length) out.push(p.name + ': ' + err[0].textContent.slice(0, 160).replace(/\s+/g, ' '));
        }
        return out;
      })()`);
      check('every XLSX part is well-formed XML (hostile text, sheet name ' + JSON.stringify(nm) + ', ' + parts.length + ' parts)', parts.length === 6 && bad.length === 0, bad.join(' | '));
    }
    /* chứng minh bộ kiểm có răng: một phần hỏng thì PHẢI bị báo parsererror */
    const sane = await page.eval(`(() => { const d = new DOMParser().parseFromString('<a><b></a>', 'application/xml'); return d.getElementsByTagName('parsererror').length; })()`);
    check('well-formedness check detects broken XML (control)', sane > 0, String(sane));
  }

  /* downloadCsv vẫn tạo Blob có BOM, qua downloadBlob */
  const csv = await page.eval(`(async () => {
    const blobs = []; const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { blobs.push(b); return 'blob:test'; };
    const clicked = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicked.push(this.download); };
    try { downloadCsv('t.csv', ['a,b', 'Nguyễn,2']); } finally { URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = origClick; }
    const b = blobs[0]; const txt = b ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(await b.arrayBuffer()) : null;
    const head = b ? Array.from(new Uint8Array(await b.slice(0, 3).arrayBuffer())) : null;
    return { n: blobs.length, type: b && b.type, head, txt, clicked };
  })()`);
  check('downloadCsv: Blob starts with UTF-8 BOM bytes EF BB BF', csv.n === 1 && JSON.stringify(csv.head) === '[239,187,191]', JSON.stringify(csv.head));
  check('downloadCsv: content, type and filename unchanged', csv.type === 'text/csv;charset=utf-8' && csv.txt === '﻿a,b\nNguyễn,2' && csv.clicked[0] === 't.csv', JSON.stringify(csv));

  const errs = page.consoleErrors();
  check('no console errors', errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
} catch (e) {
  check('test ran without throwing', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'xlsx.json'), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
