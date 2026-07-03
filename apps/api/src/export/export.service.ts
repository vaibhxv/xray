import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { storageRoot } from '../storage-root';

const BATCH = 500;

/** Fields exported for each record. Order is preserved in the CSV output. */
const CSV_COLUMNS = [
  'metadataId',
  'imageId',
  'imageFile',
  'thumbnailFile',
  'sourceUrl',
  'pageUrl',
  'domain',
  'width',
  'height',
  'fileSize',
  'format',
  'sha256',
  'phash',
  'duplicateGroup',
  'isDuplicate',
  'age',
  'ageText',
  'sex',
  'caption',
  'nearbyText',
  'sourceTitle',
  'isPediatricHandXray',
  'confidence',
  'tags',
  'summary',
  'ocrText',
  'createdAt',
] as const;

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  private storageRoot(): string {
    return storageRoot();
  }

  /** Return a storage path relative to the storage root (for the manifest). */
  private relPath(p: string | null | undefined): string {
    if (!p) return '';
    const root = this.storageRoot();
    const abs = path.resolve(p);
    if (abs.startsWith(root)) return path.relative(root, abs);
    return p;
  }

  private flatten(m: any) {
    const img = m.image;
    return {
      metadataId: m.id,
      imageId: m.imageId ?? '',
      imageFile: this.relPath(img?.filePath),
      thumbnailFile: this.relPath(img?.thumbnailPath),
      sourceUrl: img?.sourceUrl ?? '',
      pageUrl: img?.pageUrl ?? '',
      domain: img?.domain ?? m.page?.domain ?? '',
      width: img?.width ?? '',
      height: img?.height ?? '',
      fileSize: img?.fileSize ?? '',
      format: img?.format ?? '',
      sha256: img?.sha256 ?? '',
      phash: img?.phash ?? '',
      duplicateGroup: img?.duplicateGroup ?? '',
      isDuplicate: img?.isDuplicate ?? '',
      age: m.age ?? '',
      ageText: m.ageText ?? '',
      sex: m.sex ?? '',
      caption: m.caption ?? '',
      nearbyText: m.nearbyText ?? '',
      sourceTitle: m.sourceTitle ?? '',
      isPediatricHandXray: m.isPediatricHandXray ?? '',
      confidence: m.confidence ?? '',
      tags: Array.isArray(m.tags) ? m.tags.join('|') : '',
      summary: m.summary ?? '',
      ocrText: img?.ocrText ?? '',
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    };
  }

  private async *iterateRecords() {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.metadata.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: { image: true, page: true, pdf: true },
      });
      if (batch.length === 0) break;
      for (const m of batch) yield this.flatten(m);
      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }
  }

  private csvEscape(value: unknown): string {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** Streaming CSV of all records. */
  csvStream(): Readable {
    const self = this;
    async function* gen() {
      yield CSV_COLUMNS.join(',') + '\n';
      for await (const row of self.iterateRecords()) {
        yield CSV_COLUMNS.map((c) => self.csvEscape((row as any)[c])).join(',') + '\n';
      }
    }
    return Readable.from(gen());
  }

  /** Streaming JSON array of all records. */
  jsonStream(): Readable {
    const self = this;
    async function* gen() {
      yield '[';
      let first = true;
      for await (const row of self.iterateRecords()) {
        yield (first ? '' : ',') + JSON.stringify(row);
        first = false;
      }
      yield ']';
    }
    return Readable.from(gen());
  }

  storageDir(): { path: string; exists: boolean } {
    const p = this.storageRoot();
    return { path: p, exists: fs.existsSync(p) };
  }

  async summary() {
    const [images, pdfs, metadata, candidates] = await Promise.all([
      this.prisma.image.count(),
      this.prisma.pdf.count(),
      this.prisma.metadata.count(),
      this.prisma.metadata.count({ where: { isPediatricHandXray: true } }),
    ]);
    return { images, pdfs, metadata, candidates };
  }
}
