import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchQuery {
  q?: string;
  age?: string;
  domain?: string;
  limit?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQuery) {
    const term = (query.q ?? '').trim();
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

    const imageWhere: Prisma.ImageWhereInput = {};
    const metaWhere: Prisma.MetadataWhereInput = {};

    if (query.domain) imageWhere.domain = query.domain;
    if (query.age !== undefined && query.age !== '') {
      metaWhere.age = Number(query.age);
    }

    if (term) {
      imageWhere.OR = [
        { sourceUrl: { contains: term, mode: 'insensitive' } },
        { pageUrl: { contains: term, mode: 'insensitive' } },
        { ocrText: { contains: term, mode: 'insensitive' } },
        { domain: { contains: term, mode: 'insensitive' } },
      ];
      metaWhere.OR = [
        { caption: { contains: term, mode: 'insensitive' } },
        { nearbyText: { contains: term, mode: 'insensitive' } },
        { sourceTitle: { contains: term, mode: 'insensitive' } },
        { ageText: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [images, metadata] = await Promise.all([
      this.prisma.image.findMany({
        where: imageWhere,
        orderBy: { downloadedAt: 'desc' },
        take: limit,
        include: { metadata: { take: 1, orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.metadata.findMany({
        where: metaWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      term,
      images: images.map((i) => ({
        id: i.id,
        sourceUrl: i.sourceUrl,
        pageUrl: i.pageUrl,
        domain: i.domain,
        thumbnailPath: i.thumbnailPath,
        age: i.metadata?.[0]?.age ?? null,
      })),
      metadata: metadata.map((m) => ({
        id: m.id,
        imageId: m.imageId,
        age: m.age,
        sex: m.sex,
        caption: m.caption,
        sourceTitle: m.sourceTitle,
        isPediatricHandXray: m.isPediatricHandXray,
        confidence: m.confidence,
      })),
    };
  }
}
