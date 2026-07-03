import { Controller, Get, Query } from '@nestjs/common';
import { MetadataService, MetadataQuery } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get()
  list(@Query() q: MetadataQuery) {
    return this.metadata.list(q);
  }
}
