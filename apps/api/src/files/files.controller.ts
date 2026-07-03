import {
  Controller,
  Get,
  NotFoundException,
  BadRequestException,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Serves collected files (thumbnails, images, pdfs) from the storage root.
 * Only paths that resolve INSIDE the storage root are allowed, preventing
 * path traversal (e.g. ../../etc/passwd).
 */
@Controller('files')
export class FilesController {
  private storageRoot(): string {
    return path.resolve(process.env.STORAGE_ROOT ?? './storage');
  }

  @Get('*')
  serve(@Req() req: Request, @Res() res: Response) {
    const root = this.storageRoot();
    const rel = decodeURIComponent(req.params[0] ?? '');

    // Reject obvious traversal / absolute inputs before resolving.
    if (!rel || rel.includes('\0') || path.isAbsolute(rel)) {
      throw new BadRequestException('Invalid path');
    }

    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new BadRequestException('Path outside storage root');
    }

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new NotFoundException('File not found');
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(target);
  }
}
