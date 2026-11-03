import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RolesGuard } from '@app/common';
import type { RequestUser } from '@app/common';
import { DrillsService } from './drills.service';
import { BuildDrillDto, CheckDrillAnswerDto } from './drills.dto';

@ApiTags('drills')
@Controller('drills')
@UseGuards(RolesGuard)
export class DrillsController {
  constructor(private readonly drills: DrillsService) {}

  private learnerId(user: RequestUser): string {
    if (!user?.profileId)
      throw new ForbiddenException('Learner profile required');
    return user.profileId;
  }

  @Post('build')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Build a targeted practice set (notebook review + fresh questions of the same type)',
  })
  build(@Body() dto: BuildDrillDto, @CurrentUser() user: RequestUser) {
    return this.drills.build(this.learnerId(user), dto);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Grade one drill answer immediately and update the mistake notebook',
  })
  check(
    @Body() dto: CheckDrillAnswerDto,
    @CurrentUser() user: RequestUser,
    @Query('skill') skill?: string,
  ) {
    return this.drills.check(this.learnerId(user), skill, dto);
  }
}
