import { Controller, Get, Query } from '@nestjs/common';
import { ImagesService, ImageQuery } from './images.service';

@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get()
  list(@Query() q: ImageQuery) {
    return this.images.list(q);
  }

  @Get('domains')
  domains() {
    return this.images.domains();
  }
}
