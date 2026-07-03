import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import archiver from 'archiver';
import { ExportService } from './export.service';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('summary')
  summary() {
    return this.exportService.summary();
  }

  @Get('records.csv')
  csv(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="xray_records.csv"');
    this.exportService.csvStream().pipe(res);
  }

  @Get('records.json')
  json(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="xray_records.json"');
    this.exportService.jsonStream().pipe(res);
  }

  /**
   * Download EVERYTHING collected: the metadata manifest (CSV + JSON) plus all
   * original files (images, pdfs, thumbnails) as a single streamed ZIP.
   * Intended for moving the dataset to a separate machine for model training.
   */
  @Get('all.zip')
  all(@Res() res: Response) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="xray_dataset_${stamp}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => {
      if ((err as any).code !== 'ENOENT') console.warn('[export] archive warning', err);
    });
    archive.on('error', (err) => {
      console.error('[export] archive error', err);
      res.destroy(err);
    });

    archive.pipe(res);

    // Manifest files.
    archive.append(this.exportService.csvStream(), { name: 'manifest/xray_records.csv' });
    archive.append(this.exportService.jsonStream(), { name: 'manifest/xray_records.json' });

    // Original collected files, kept under a "files/" prefix in the archive.
    const storage = this.exportService.storageDir();
    if (storage.exists) {
      archive.directory(storage.path, 'files');
    }

    archive.finalize();
  }
}
