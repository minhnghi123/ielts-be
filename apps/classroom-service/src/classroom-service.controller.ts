import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, RMQ_PATTERNS } from '@app/common';
import type { ClassroomAttemptEvent, RequestUser } from '@app/common';
import { ClassroomServiceService } from './classroom-service.service';
import {
  CreateAssignmentDto,
  CreateClassDto,
  CreatePostDto,
  JoinClassDto,
  QueryAssignmentsDto,
  QueryClassesDto,
  ReviewSubmissionDto,
  UpdateAssignmentDto,
  UpdateClassDto,
  UpdateMemberDto,
  UpdatePostDto,
  AssignDrillDto,
} from './dto/classroom.dto';

@ApiTags('Classroom')
@ApiBearerAuth()
@Controller()
export class ClassroomServiceController {
  constructor(private readonly service: ClassroomServiceService) {}

  // ─── Teacher dashboard ────────────────────────────────────────────────────

  @Get('teacher/dashboard')
  @Roles('teacher', 'admin')
  @ApiOperation({ summary: 'Overview for the signed-in teacher' })
  teacherDashboard(@CurrentUser() user: RequestUser) {
    return this.service.teacherDashboard(user);
  }

  // ─── Classes ──────────────────────────────────────────────────────────────

  @Post('classes')
  @Roles('teacher', 'admin')
  @ApiOperation({
    summary: 'Create a class (teacher) — admins must pass teacherId',
  })
  createClass(
    @Body() dto: CreateClassDto,
    @CurrentUser() user: RequestUser,
    @Body('teacherId') teacherId?: string,
  ) {
    return this.service.createClass(dto, user, teacherId);
  }

  @Get('classes')
  @Roles('learner', 'teacher', 'admin')
  @ApiOperation({
    summary: 'List classes: mine (teacher), joined (learner), all (admin)',
  })
  listClasses(
    @Query() query: QueryClassesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.listClasses(query, user);
  }

  @Get('classes/my-assignments')
  @Roles('learner')
  @ApiOperation({ summary: 'Learner: upcoming assignments across all classes' })
  myAssignments(
    @CurrentUser() user: RequestUser,
    @Query('days') days?: string,
  ) {
    return this.service.myUpcomingAssignments(
      user,
      days ? parseInt(days, 10) || 7 : 7,
    );
  }

  @Post('classes/join')
  @Roles('learner')
  @ApiOperation({ summary: 'Join a class with its code' })
  join(@Body() dto: JoinClassDto, @CurrentUser() user: RequestUser) {
    return this.service.joinByCode(dto.code, user);
  }

  @Get('classes/:id')
  @Roles('learner', 'teacher', 'admin')
  getClass(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getClass(id, user);
  }

  @Patch('classes/:id')
  @Roles('teacher', 'admin')
  updateClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateClass(id, dto, user);
  }

  @Post('classes/:id/join-code/rotate')
  @Roles('teacher', 'admin')
  rotateJoinCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.rotateJoinCode(id, user);
  }

  @Delete('classes/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteClass(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deleteClass(id, user);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  @Get('classes/:id/members')
  @Roles('learner', 'teacher', 'admin')
  listMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('status') status?: string,
  ) {
    return this.service.listMembers(id, user, status);
  }

  @Patch('classes/:id/members/:learnerId')
  @Roles('teacher', 'admin')
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateMember(id, learnerId, dto, user);
  }

  @Post('classes/:id/leave')
  @Roles('learner')
  leave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.leaveClass(id, user);
  }

  @Get('classes/:id/students/:learnerId/progress')
  @Roles('teacher', 'admin')
  studentProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('learnerId', ParseUUIDPipe) learnerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.studentProgress(id, learnerId, user);
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  @Post('classes/:id/assignments')
  @Roles('teacher', 'admin')
  createAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createAssignment(id, dto, user);
  }

  @Get('classes/:id/assignments')
  @Roles('learner', 'teacher', 'admin')
  listAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryAssignmentsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.listAssignments(id, query, user);
  }

  @Get('classes/:id/assignments/:aid')
  @Roles('learner', 'teacher', 'admin')
  getAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getAssignment(id, aid, user);
  }

  @Patch('classes/:id/assignments/:aid')
  @Roles('teacher', 'admin')
  updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateAssignment(id, aid, dto, user);
  }

  @Delete('classes/:id/assignments/:aid')
  @Roles('teacher', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deleteAssignment(id, aid, user);
  }

  @Post('classes/:id/assignments/:aid/release')
  @Roles('teacher', 'admin')
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.releaseResults(id, aid, user);
  }

  @Post('classes/:id/assignments/:aid/sync')
  @Roles('teacher', 'admin')
  sync(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.syncAssignment(id, aid, user);
  }

  @Get('classes/:id/assignments/:aid/submissions')
  @Roles('teacher', 'admin')
  listSubmissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.listSubmissions(id, aid, user);
  }

  // ─── Gradebook & submissions ──────────────────────────────────────────────

  @Get('classes/:id/heatmap')
  @Roles('teacher', 'admin')
  heatmap(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.heatmap(id, user);
  }

  @Post('classes/:id/drills')
  @Roles('teacher', 'admin')
  @HttpCode(HttpStatus.OK)
  assignDrill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDrillDto, @CurrentUser() user: RequestUser) {
    return this.service.assignDrill(id, user, dto);
  }

  @Get('classes/:id/gradebook')
  @Roles('teacher', 'admin')
  gradebook(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('skill') skill?: string,
  ) {
    return this.service.gradebook(id, user, skill || undefined);
  }

  @Get('classes/:id/gradebook.csv')
  @Roles('teacher', 'admin')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="gradebook.csv"')
  gradebookCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query('skill') skill?: string,
  ) {
    return this.service.gradebookCsv(id, user, skill || undefined);
  }

  @Get('classes/:id/submissions/:sid')
  @Roles('learner', 'teacher', 'admin', 'system')
  getSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getSubmission(id, sid, user);
  }

  @Put('classes/:id/submissions/:sid/review')
  @Roles('teacher', 'admin')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reviewSubmission(id, sid, dto, user);
  }

  // ─── Posts ────────────────────────────────────────────────────────────────

  @Get('classes/:id/posts')
  @Roles('learner', 'teacher', 'admin')
  listPosts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.listPosts(id, user);
  }

  @Post('classes/:id/posts')
  @Roles('teacher', 'admin')
  createPost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createPost(id, dto, user);
  }

  @Patch('classes/:id/posts/:pid')
  @Roles('teacher', 'admin')
  updatePost(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updatePost(id, pid, dto, user);
  }

  @Delete('classes/:id/posts/:pid')
  @Roles('teacher', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deletePost(id, pid, user);
  }

  // ─── Internal (system) ────────────────────────────────────────────────────

  @Get('internal/access')
  @Roles('system', 'admin')
  @ApiOperation({
    summary:
      '[Internal] May this learner open this test via a class assignment?',
  })
  access(
    @Query('learnerId', ParseUUIDPipe) learnerId: string,
    @Query('testId', ParseUUIDPipe) testId: string,
  ) {
    return this.service.checkAccess(learnerId, testId);
  }

  @Get('internal/assignments/count')
  @Roles('system', 'admin')
  countAssignments(@Query('testId', ParseUUIDPipe) testId: string) {
    return this.service.countAssignmentsForTest(testId);
  }

  @Get('internal/assignments/:aid/eligibility')
  @Roles('system', 'admin')
  eligibility(
    @Param('aid', ParseUUIDPipe) aid: string,
    @Query('learnerId', ParseUUIDPipe) learnerId: string,
  ) {
    return this.service.eligibility(aid, learnerId);
  }

  // ─── RabbitMQ events from test-service ────────────────────────────────────

  @EventPattern(RMQ_PATTERNS.CLASSROOM.ATTEMPT_SUBMITTED)
  async onAttemptSubmitted(
    @Payload() event: ClassroomAttemptEvent,
    @Ctx() ctx: RmqContext,
  ) {
    await this.consume(event, ctx);
  }

  @EventPattern(RMQ_PATTERNS.CLASSROOM.ATTEMPT_GRADED)
  async onAttemptGraded(
    @Payload() event: ClassroomAttemptEvent,
    @Ctx() ctx: RmqContext,
  ) {
    await this.consume(event, ctx);
  }

  private async consume(event: ClassroomAttemptEvent, ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const message = ctx.getMessage();
    try {
      await this.service.handleAttemptEvent(event);
      channel.ack(message);
    } catch (err) {
      // Drop poison messages instead of redelivering forever; teachers can `sync` manually.
      console.error('[classroom] failed to process attempt event', err);
      channel.nack(message, false, false);
    }
  }
}
