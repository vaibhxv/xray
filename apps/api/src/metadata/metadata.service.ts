import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetadataRecord, Paginated } from '@xray/shared';

export interface MetadataQuery {
  page?: number;
  pageSize?: number;
  minAge?: string;
  maxAge?: string;
  sex?: string;
  candidateOnly?: 'true' | 'false';
  search?: string;
}

@Injectable()
export class MetadataService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: MetadataQuery): Promise<Paginated<MetadataRecord>> {
    const page = Math.max(Number(q.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200);

    const where: Prisma.MetadataWhereInput = {};
    const ageFilter: Prisma.FloatNullableFilter = {};
    if (q.minAge !== undefined && q.minAge !== '') ageFilter.gte = Number(q.minAge);
    if (q.maxAge !== undefined && q.maxAge !== '') ageFilter.lte = Number(q.maxAge);
    if (Object.keys(ageFilter).length) where.age = ageFilter;
    if (q.sex) where.sex = q.sex;
    if (q.candidateOnly === 'true') where.isPediatricHandXray = true;
    if (q.search) {
      where.OR = [
        { caption: { contains: q.search, mode: 'insensitive' } },
        { nearbyText: { contains: q.search, mode: 'insensitive' } },
        { sourceTitle: { contains: q.search, mode: 'insensitive' } },
        { summary: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.metadata.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.metadata.count({ where }),
    ]);

    return {
      rows: rows.map((r) => this.toRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  private toRecord(r: any): MetadataRecord {
    return {
      id: r.id,
      imageId: r.imageId,
      age: r.age,
      ageText: r.ageText,
      sex: r.sex,
      caption: r.caption,
      nearbyText: r.nearbyText,
      sourceTitle: r.sourceTitle,
      isPediatricHandXray: r.isPediatricHandXray,
      confidence: r.confidence,
      tags: r.tags ?? [],
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
