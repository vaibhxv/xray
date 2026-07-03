import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImageRecord, Paginated } from '@xray/shared';

export interface ImageQuery {
  page?: number;
  pageSize?: number;
  domain?: string;
  format?: string;
  duplicate?: 'true' | 'false';
  hasAge?: 'true' | 'false';
  ocrStatus?: string;
  search?: string;
}

@Injectable()
export class ImagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ImageQuery): Promise<Paginated<ImageRecord>> {
    const page = Math.max(Number(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200);

    const where: Prisma.ImageWhereInput = {};
    if (q.domain) where.domain = q.domain;
    if (q.format) where.format = q.format;
    if (q.duplicate === 'true') where.isDuplicate = true;
    if (q.duplicate === 'false') where.isDuplicate = false;
    if (q.ocrStatus) where.ocrStatus = q.ocrStatus;
    if (q.search) {
      where.OR = [
        { sourceUrl: { contains: q.search, mode: 'insensitive' } },
        { pageUrl: { contains: q.search, mode: 'insensitive' } },
        { ocrText: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.hasAge === 'true') {
      where.metadata = { some: { age: { not: null } } };
    } else if (q.hasAge === 'false') {
      where.metadata = { none: { age: { not: null } } };
    }

    const [rows, total] = await Promise.all([
      this.prisma.image.findMany({
        where,
        orderBy: { downloadedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { metadata: { take: 1, orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.image.count({ where }),
    ]);

    return {
      rows: rows.map((r) => this.toRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  async domains(): Promise<string[]> {
    const rows = await this.prisma.image.findMany({
      where: { domain: { not: null } },
      distinct: ['domain'],
      select: { domain: true },
      orderBy: { domain: 'asc' },
      take: 500,
    });
    return rows.map((r) => r.domain!).filter(Boolean);
  }

  private toRecord(r: any): ImageRecord {
    const meta = r.metadata?.[0];
    return {
      id: r.id,
      sourceUrl: r.sourceUrl,
      pageUrl: r.pageUrl,
      domain: r.domain,
      downloadedAt: r.downloadedAt.toISOString(),
      width: r.width,
      height: r.height,
      fileSize: r.fileSize,
      format: r.format,
      thumbnailPath: r.thumbnailPath,
      duplicateGroup: r.duplicateGroup,
      isDuplicate: r.isDuplicate,
      ocrStatus: r.ocrStatus,
      metadataStatus: r.metadataStatus,
      ageDetected: meta?.age ?? null,
    };
  }
}
