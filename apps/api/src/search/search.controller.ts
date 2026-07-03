import { Controller, Get, Query } from '@nestjs/common';
import { SearchService, SearchQuery } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(@Query() q: SearchQuery) {
    return this.search.search(q);
  }
}
