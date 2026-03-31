import pako from 'pako';

declare module 'pako' {
  export function inflate(data: Uint8Array): Uint8Array;
}

export async function unzip(buffer: ArrayBuffer): Promise<{ files: { name: string; content: ArrayBuffer | string }[] }> {
  try {
    const result: { files: { name: string; content: ArrayBuffer | string }[] } = { files: [] };
    
    const uint8Array = new Uint8Array(buffer);
    const decompressed = pako.inflate(uint8Array);
    const textDecoder = new TextDecoder();
    
    const headerSize = 30;
    let offset = headerSize;
    
    while (offset < decompressed.length) {
      readUint32LE(decompressed, offset);
      readUint16LE(decompressed, offset + 4);
      readUint16LE(decompressed, offset + 6);
      const compression = readUint16LE(decompressed, offset + 8);
      readUint32LE(decompressed, offset + 14);
      const compressedSize = readUint32LE(decompressed, offset + 18);
      const uncompressedSize = readUint32LE(decompressed, offset + 22);
      const nameLen = readUint16LE(decompressed, offset + 26);
      const extraLen = readUint16LE(decompressed, offset + 28);
      
      offset += 30;
      
      const nameBytes = decompressed.slice(offset, offset + nameLen);
      const name = textDecoder.decode(nameBytes);
      offset += nameLen + extraLen;
      
      let content: ArrayBuffer | string;
      if (compression === 0) {
        content = decompressed.slice(offset, offset + uncompressedSize).buffer;
      } else if (compression === 8) {
        const compressed = decompressed.slice(offset, offset + compressedSize);
        const inflated = pako.inflate(compressed);
        if (name.endsWith('.json') || name.endsWith('.txt') || name.endsWith('.xml')) {
          content = textDecoder.decode(inflated.buffer);
        } else {
          content = inflated.buffer;
        }
      } else {
        content = decompressed.slice(offset, offset + uncompressedSize).buffer;
      }
      
      if (name && !name.endsWith('/')) {
        result.files.push({ name, content });
      }
      
      offset += compressedSize || uncompressedSize;
    }
    
    return result;
  } catch (err) {
    throw err;
  }
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

export function zip(files: { name: string; content: string | ArrayBuffer }[]): ArrayBuffer {
  const parts: Uint8Array[] = [];
  
  const header = new Uint8Array(30);
  writeUint32LE(header, 0, 0x04034b50);
  writeUint16LE(header, 4, 20);
  writeUint16LE(header, 6, 0);
  writeUint16LE(header, 8, 0);
  writeUint16LE(header, 10, 0);
  writeUint16LE(header, 12, 0);
  writeUint16LE(header, 14, 0);
  writeUint16LE(header, 22, 0);
  writeUint16LE(header, 24, 0);
  writeUint16LE(header, 26, 0);
  writeUint16LE(header, 28, 0);
  parts.push(header);

  for (const file of files) {
    const content = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : new Uint8Array(file.content);
    const crc = crc32(content);
    const size = content.length;

    const localHeader = new Uint8Array(30 + file.name.length);
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0);
    writeUint16LE(localHeader, 8, 0);
    writeUint32LE(localHeader, 14, crc);
    writeUint32LE(localHeader, 18, size);
    writeUint32LE(localHeader, 22, size);
    writeUint16LE(localHeader, 26, file.name.length);
    writeUint16LE(localHeader, 28, 0);
    for (let i = 0; i < file.name.length; i++) {
      localHeader[30 + i] = file.name.charCodeAt(i);
    }
    parts.push(localHeader);
    parts.push(content);
  }

  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result.buffer;
}

function writeUint32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

function writeUint16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c >>> 0;
  }
  return crc32Table;
}
