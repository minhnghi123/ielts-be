import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RolesGuard, assertOwnerOrPrivileged } from '@app/common';
import type { RequestUser } from '@app/common';
import { MemoryService } from './memory.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/memory')
@UseGuards(RolesGuard)
export class MemoryController {
    constructor(private readonly service: MemoryService) {}

    @Get(':learnerId/forecast')
    @ApiOperation({ summary: 'Dự báo khả năng nhớ (HLR-lite) cho từ vựng và câu trong sổ lỗi — yếu nhất trước' })
    forecast(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.forecast(learnerId);
    }

    @Post(':learnerId/refit')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Ước lượng lại tham số quên của học viên từ lịch sử ôn (cần ≥ 50 lượt)' })
    refit(@Param('learnerId', ParseUUIDPipe) learnerId: string, @CurrentUser() user: RequestUser) {
        assertOwnerOrPrivileged(user, learnerId);
        return this.service.refit(learnerId);
    }
}
