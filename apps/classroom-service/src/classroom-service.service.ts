import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, FindOptionsWhere } from 'typeorm';
import {
  assertApprovedTeacher,
  ClassroomAttemptEvent,
  isPrivileged,
  isTeacher,
  RequestUser,
  resolveLearnerId,
} from '@app/common';
import { ClassEntity } from './entities/class.entity';
import { ClassMember, MemberStatus } from './entities/class-member.entity';
import { ClassAssignment } from './entities/class-assignment.entity';
import { AssignmentSubmission } from './entities/assignment-submission.entity';
import { ClassPost } from './entities/class-post.entity';
import { AuthClient, LearnerInfo } from './clients/auth.client';
import { TestClient, AttemptSummary } from './clients/test.client';
import { AnalyticsClient } from './clients/analytics.client';
import {
  CreateAssignmentDto,
  CreateClassDto,
  CreatePostDto,
  QueryAssignmentsDto,
  QueryClassesDto,
  ReviewSubmissionDto,
  UpdateAssignmentDto,
  UpdateClassDto,
  UpdateMemberDto,
  UpdatePostDto,
} from './dto/classroom.dto';
import {
  computeAssignmentStatus,
  effectiveCloseAt,
  evaluateEligibility,
  generateJoinCode,
  mapSubmissionStatus,
  normaliseJoinCode,
  resultsVisible,
  roundHalfBand,
} from './classroom.rules';

const REVIEWABLE_SKILLS = new Set(['writing', 'speaking']);
const COUNTED_STATUSES: AssignmentSubmission['status'][] = [
  'submitted',
  'late',
  'expired',
];

@Injectable()
export class ClassroomServiceService {
  private readonly logger = new Logger(ClassroomServiceService.name);

  constructor(
    @InjectRepository(ClassEntity)
    private readonly classRepo: Repository<ClassEntity>,
    @InjectRepository(ClassMember)
    private readonly memberRepo: Repository<ClassMember>,
    @InjectRepository(ClassAssignment)
    private readonly assignmentRepo: Repository<ClassAssignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissionRepo: Repository<AssignmentSubmission>,
    @InjectRepository(ClassPost)
    private readonly postRepo: Repository<ClassPost>,
    private readonly authClient: AuthClient,
    private readonly testClient: TestClient,
    private readonly analyticsClient: AnalyticsClient,
  ) {}

  // ─── Access helpers ───────────────────────────────────────────────────────

  private async loadClass(classId: string): Promise<ClassEntity> {
    const cls = await this.classRepo.findOne({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    return cls;
  }

  private ownsClass(cls: ClassEntity, user: RequestUser | null): boolean {
    if (isPrivileged(user)) return true;
    return (
      isTeacher(user) && !!user?.profileId && user.profileId === cls.teacherId
    );
  }

  /** Teacher-owner (approved) or admin. */
  private async requireOwner(
    classId: string,
    user: RequestUser | null,
  ): Promise<ClassEntity> {
    const cls = await this.loadClass(classId);
    if (!this.ownsClass(cls, user))
      throw new NotFoundException('Class not found');
    if (isTeacher(user)) assertApprovedTeacher(user);
    return cls;
  }

  private async membership(
    classId: string,
    learnerId: string,
  ): Promise<ClassMember | null> {
    return this.memberRepo.findOne({ where: { classId, learnerId } });
  }

  /** Owner, admin, or active learner member. Returns the member row for learners. */
  private async requireAccess(
    classId: string,
    user: RequestUser | null,
  ): Promise<{ cls: ClassEntity; member: ClassMember | null; owner: boolean }> {
    const cls = await this.loadClass(classId);
    if (this.ownsClass(cls, user)) return { cls, member: null, owner: true };
    if (user?.role === 'learner' && user.profileId) {
      const member = await this.membership(classId, user.profileId);
      if (
        member &&
        (member.status === 'active' || member.status === 'pending')
      ) {
        return { cls, member, owner: false };
      }
    }
    throw new NotFoundException('Class not found');
  }

  private async activeMemberIds(classId: string): Promise<string[]> {
    const rows = await this.memberRepo.find({
      where: { classId, status: 'active' },
      select: ['learnerId'],
    });
    return rows.map((r) => r.learnerId);
  }

  private publicClass(cls: ClassEntity, owner: boolean) {
    const { joinCode, ...rest } = cls;
    return owner ? { ...rest, joinCode } : rest;
  }

  // ─── Classes ──────────────────────────────────────────────────────────────

  async createClass(
    dto: CreateClassDto,
    user: RequestUser | null,
    teacherIdOverride?: string,
  ) {
    let teacherId: string;
    if (isPrivileged(user)) {
      if (!teacherIdOverride)
        throw new BadRequestException(
          'teacherId is required when an admin creates a class',
        );
      teacherId = teacherIdOverride;
    } else {
      teacherId = assertApprovedTeacher(user);
    }
    const cls = this.classRepo.create({
      teacherId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      targetBand: dto.targetBand ?? null,
      joinPolicy: dto.joinPolicy ?? 'approval',
      maxMembers: dto.maxMembers ?? null,
      coverColor: dto.coverColor ?? null,
      joinCode: await this.uniqueJoinCode(),
      status: 'active',
    });
    const saved = await this.classRepo.save(cls);
    return { ...saved, memberCount: 0, pendingCount: 0, assignmentCount: 0 };
  }

  private async uniqueJoinCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = generateJoinCode();
      if (!(await this.classRepo.exist({ where: { joinCode: code } })))
        return code;
    }
    throw new ConflictException(
      'Could not allocate a unique join code, please retry',
    );
  }

  async listClasses(query: QueryClassesDto, user: RequestUser | null) {
    const { status, search, teacherId, page, limit } = query;
    const qb = this.classRepo
      .createQueryBuilder('c')
      .orderBy('c.updatedAt', 'DESC');

    let memberByClass = new Map<string, ClassMember>();
    if (isPrivileged(user)) {
      if (teacherId) qb.andWhere('c.teacherId = :teacherId', { teacherId });
    } else if (isTeacher(user)) {
      qb.andWhere('c.teacherId = :teacherId', { teacherId: user!.profileId });
    } else {
      const learnerId = resolveLearnerId(user);
      const memberships = await this.memberRepo.find({
        where: { learnerId, status: In(['active', 'pending']) },
      });
      if (memberships.length === 0)
        return { data: [], total: 0, page, limit, totalPages: 0 };
      memberByClass = new Map(memberships.map((m) => [m.classId, m]));
      qb.andWhere('c.id IN (:...ids)', { ids: [...memberByClass.keys()] });
    }
    if (status) qb.andWhere('c.status = :status', { status });
    else if (!isPrivileged(user) && !isTeacher(user))
      qb.andWhere("c.status = 'active'");
    if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const ids = rows.map((r) => r.id);
    const counts = await this.classCounts(ids);
    const teachers = await this.authClient.getTeachers(
      rows.map((r) => r.teacherId),
    );
    const owner = isPrivileged(user) || isTeacher(user);

    return {
      data: rows.map((c) => ({
        ...this.publicClass(c, owner),
        ...(counts.get(c.id) ?? {
          memberCount: 0,
          pendingCount: 0,
          assignmentCount: 0,
        }),
        teacher: this.teacherCard(teachers.get(c.teacherId)),
        myMembership: memberByClass.get(c.id)?.status ?? undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private teacherCard(
    t?: {
      id: string;
      fullName?: string | null;
      avatarUrl?: string | null;
      organization?: string | null;
      email?: string;
    } | null,
  ) {
    if (!t) return null;
    return {
      id: t.id,
      fullName: t.fullName ?? null,
      avatarUrl: t.avatarUrl ?? null,
      organization: t.organization ?? null,
    };
  }

  private async classCounts(classIds: string[]) {
    const map = new Map<
      string,
      { memberCount: number; pendingCount: number; assignmentCount: number }
    >();
    if (classIds.length === 0) return map;
    for (const id of classIds)
      map.set(id, { memberCount: 0, pendingCount: 0, assignmentCount: 0 });
    const members = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.class_id', 'classId')
      .addSelect('m.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .where('m.class_id IN (:...ids)', { ids: classIds })
      .groupBy('m.class_id')
      .addGroupBy('m.status')
      .getRawMany<{ classId: string; status: MemberStatus; n: string }>();
    for (const r of members) {
      const c = map.get(r.classId)!;
      if (r.status === 'active') c.memberCount = Number(r.n);
      if (r.status === 'pending') c.pendingCount = Number(r.n);
    }
    const assignments = await this.assignmentRepo
      .createQueryBuilder('a')
      .select('a.class_id', 'classId')
      .addSelect('COUNT(*)', 'n')
      .where('a.class_id IN (:...ids)', { ids: classIds })
      .andWhere("a.status <> 'archived'")
      .groupBy('a.class_id')
      .getRawMany<{ classId: string; n: string }>();
    for (const r of assignments)
      map.get(r.classId)!.assignmentCount = Number(r.n);
    return map;
  }

  async getClass(classId: string, user: RequestUser | null) {
    const { cls, member, owner } = await this.requireAccess(classId, user);
    const counts = (await this.classCounts([cls.id])).get(cls.id);
    const teacher = await this.authClient.getTeacher(cls.teacherId);
    return {
      ...this.publicClass(cls, owner),
      ...counts,
      teacher: this.teacherCard(teacher),
      myMembership: member?.status ?? undefined,
      joinLink: owner ? `/classes/join?code=${cls.joinCode}` : undefined,
    };
  }

  async updateClass(
    classId: string,
    dto: UpdateClassDto,
    user: RequestUser | null,
  ) {
    const cls = await this.requireOwner(classId, user);
    if (dto.teacherId && dto.teacherId !== cls.teacherId) {
      if (!isPrivileged(user))
        throw new ForbiddenException('Only admins can reassign a class');
      cls.teacherId = dto.teacherId;
    }
    if (dto.name !== undefined) cls.name = dto.name.trim();
    if (dto.description !== undefined)
      cls.description = dto.description?.trim() || null;
    if (dto.targetBand !== undefined) cls.targetBand = dto.targetBand;
    if (dto.joinPolicy !== undefined) cls.joinPolicy = dto.joinPolicy;
    if (dto.maxMembers !== undefined) cls.maxMembers = dto.maxMembers;
    if (dto.coverColor !== undefined) cls.coverColor = dto.coverColor;
    if (dto.status !== undefined) cls.status = dto.status;
    await this.classRepo.save(cls);
    return this.getClass(classId, user);
  }

  async rotateJoinCode(classId: string, user: RequestUser | null) {
    const cls = await this.requireOwner(classId, user);
    cls.joinCode = await this.uniqueJoinCode();
    await this.classRepo.save(cls);
    return { joinCode: cls.joinCode };
  }

  async deleteClass(classId: string, user: RequestUser | null) {
    if (!isPrivileged(user))
      throw new ForbiddenException(
        'Only admins can delete a class; archive it instead',
      );
    const cls = await this.loadClass(classId);
    if (cls.status !== 'archived')
      throw new ConflictException('Archive the class before deleting it');
    const assignmentIds = (
      await this.assignmentRepo.find({ where: { classId }, select: ['id'] })
    ).map((a) => a.id);
    if (assignmentIds.length) {
      const n = await this.submissionRepo.count({
        where: { assignmentId: In(assignmentIds) },
      });
      if (n > 0)
        throw new ConflictException(
          'Classes with submissions cannot be deleted',
        );
      await this.assignmentRepo.delete({ classId });
    }
    await this.postRepo.delete({ classId });
    await this.memberRepo.delete({ classId });
    await this.classRepo.delete({ id: classId });
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async joinByCode(rawCode: string, user: RequestUser | null) {
    const learnerId = resolveLearnerId(user);
    if (user?.role !== 'learner')
      throw new ForbiddenException('Only learners can join classes');
    const code = normaliseJoinCode(rawCode);
    const cls = await this.classRepo.findOne({ where: { joinCode: code } });
    if (!cls || cls.status !== 'active')
      throw new NotFoundException('No active class matches this code');
    if (cls.joinPolicy === 'closed')
      throw new ConflictException('This class is not accepting new members');

    const existing = await this.membership(cls.id, learnerId);
    if (existing?.status === 'active')
      return {
        classId: cls.id,
        status: 'active',
        className: cls.name,
        alreadyMember: true,
      };
    if (existing?.status === 'pending')
      return {
        classId: cls.id,
        status: 'pending',
        className: cls.name,
        alreadyMember: true,
      };
    if (existing?.status === 'removed')
      throw new ForbiddenException(
        'You were removed from this class by the teacher',
      );

    if (cls.maxMembers) {
      const active = await this.memberRepo.count({
        where: { classId: cls.id, status: 'active' },
      });
      if (active >= cls.maxMembers)
        throw new ConflictException('This class is full');
    }

    const status: MemberStatus =
      cls.joinPolicy === 'open' ? 'active' : 'pending';
    const member =
      existing ?? this.memberRepo.create({ classId: cls.id, learnerId });
    member.status = status;
    member.joinedAt = status === 'active' ? new Date() : null;
    member.leftAt = null;
    await this.memberRepo.save(member);
    return {
      classId: cls.id,
      status,
      className: cls.name,
      alreadyMember: false,
    };
  }

  async listMembers(
    classId: string,
    user: RequestUser | null,
    status?: string,
  ) {
    const { owner } = await this.requireAccess(classId, user);
    const where: FindOptionsWhere<ClassMember> = { classId };
    if (owner && status) where.status = status as MemberStatus;
    else if (!owner) where.status = 'active';
    else where.status = In(['active', 'pending']);
    const members = await this.memberRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });
    const info = await this.authClient.getLearners(
      members.map((m) => m.learnerId),
    );
    const stats = owner
      ? await this.memberStats(
          classId,
          members.map((m) => m.learnerId),
        )
      : new Map();
    return members.map((m) =>
      this.memberCard(m, info.get(m.learnerId), owner, stats.get(m.learnerId)),
    );
  }

  private memberCard(
    m: ClassMember,
    info: LearnerInfo | undefined,
    owner: boolean,
    stats?: {
      submitted: number;
      avgBand: number | null;
      lastActiveAt: Date | null;
    },
  ) {
    return {
      id: m.id,
      learnerId: m.learnerId,
      status: m.status,
      joinedAt: m.joinedAt,
      fullName: info?.fullName ?? null,
      avatarUrl: info?.avatarUrl ?? null,
      ...(owner && {
        email: info?.email ?? null,
        currentLevel: info?.currentLevel ?? null,
        note: m.note,
        requestedAt: m.createdAt,
        stats: stats ?? { submitted: 0, avgBand: null, lastActiveAt: null },
      }),
    };
  }

  private async memberStats(classId: string, learnerIds: string[]) {
    const map = new Map<
      string,
      { submitted: number; avgBand: number | null; lastActiveAt: Date | null }
    >();
    if (learnerIds.length === 0) return map;
    const rows = await this.submissionRepo
      .createQueryBuilder('s')
      .innerJoin(
        ClassAssignment,
        'a',
        'a.id = s.assignment_id AND a.class_id = :classId',
        { classId },
      )
      .select('s.learner_id', 'learnerId')
      .addSelect(
        "COUNT(*) FILTER (WHERE s.status IN ('submitted','late','expired'))",
        'submitted',
      )
      .addSelect('AVG(s.final_band)', 'avgBand')
      .addSelect('MAX(COALESCE(s.submitted_at, s.started_at))', 'lastActiveAt')
      .where('s.learner_id IN (:...ids)', { ids: learnerIds })
      .groupBy('s.learner_id')
      .getRawMany<{
        learnerId: string;
        submitted: string;
        avgBand: string | null;
        lastActiveAt: Date | null;
      }>();
    for (const r of rows) {
      map.set(r.learnerId, {
        submitted: Number(r.submitted),
        avgBand:
          r.avgBand !== null ? Math.round(Number(r.avgBand) * 10) / 10 : null,
        lastActiveAt: r.lastActiveAt,
      });
    }
    return map;
  }

  async updateMember(
    classId: string,
    learnerId: string,
    dto: UpdateMemberDto,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const member = await this.membership(classId, learnerId);
    if (!member) throw new NotFoundException('Member not found');
    if (dto.status === 'active' && member.status !== 'active') {
      member.status = 'active';
      member.joinedAt = member.joinedAt ?? new Date();
      member.leftAt = null;
    } else if (dto.status === 'removed') {
      member.status = 'removed';
      member.leftAt = new Date();
    }
    if (dto.note !== undefined) member.note = dto.note || null;
    await this.memberRepo.save(member);
    const info = await this.authClient.getLearners([learnerId]);
    return this.memberCard(member, info.get(learnerId), true);
  }

  async leaveClass(classId: string, user: RequestUser | null) {
    const learnerId = resolveLearnerId(user);
    const member = await this.membership(classId, learnerId);
    if (!member || member.status === 'removed')
      throw new NotFoundException('You are not a member of this class');
    member.status = 'left';
    member.leftAt = new Date();
    await this.memberRepo.save(member);
    return { classId, status: 'left' };
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  private decorateAssignment(a: ClassAssignment, now = new Date()) {
    return {
      ...a,
      status: computeAssignmentStatus(a, now),
      effectiveCloseAt: effectiveCloseAt(a),
      resultsVisible: resultsVisible(a, now),
    };
  }

  private parseWindow(
    dto: Partial<CreateAssignmentDto>,
    existing?: ClassAssignment,
  ) {
    const openAt =
      dto.openAt !== undefined
        ? dto.openAt
          ? new Date(dto.openAt)
          : null
        : (existing?.openAt ?? null);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : existing?.dueAt;
    const closeAt =
      dto.closeAt !== undefined
        ? dto.closeAt
          ? new Date(dto.closeAt)
          : null
        : (existing?.closeAt ?? null);
    if (!dueAt || isNaN(dueAt.getTime()))
      throw new BadRequestException('dueAt is required');
    if (openAt && openAt >= dueAt)
      throw new BadRequestException('openAt must be before dueAt');
    if (closeAt && closeAt < dueAt)
      throw new BadRequestException('closeAt must be on or after dueAt');
    return { openAt, dueAt, closeAt };
  }

  async createAssignment(
    classId: string,
    dto: CreateAssignmentDto,
    user: RequestUser | null,
  ) {
    const cls = await this.requireOwner(classId, user);
    if (cls.status !== 'active')
      throw new ConflictException('Cannot assign work in an archived class');

    const test = await this.testClient.getTest(dto.testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'published')
      throw new BadRequestException('Only published tests can be assigned');
    if (
      test.visibility === 'private' &&
      !isPrivileged(user) &&
      test.createdBy !== user?.id
    ) {
      throw new ForbiddenException(
        'You can only assign public tests or your own private tests',
      );
    }
    const { openAt, dueAt, closeAt } = this.parseWindow(dto);

    const a = this.assignmentRepo.create({
      classId,
      testId: test.id,
      testSnapshot: {
        title: test.title,
        skill: test.skill,
        difficulty: test.difficulty,
        durationMinutes: test.durationMinutes,
        isMock: test.isMock,
      },
      title: (dto.title?.trim() || test.title).slice(0, 160),
      instructions: dto.instructions?.trim() || null,
      mode: dto.mode ?? 'mock',
      openAt,
      dueAt,
      closeAt,
      allowLate: dto.allowLate ?? true,
      maxAttempts: dto.maxAttempts ?? 1,
      resultPolicy: dto.resultPolicy ?? 'immediately',
      extraTime: dto.extraTime ?? null,
      status: 'open',
      createdBy: user?.id ?? cls.teacherId,
    });
    const saved = await this.assignmentRepo.save(a);
    return this.decorateAssignment(saved);
  }

  private async loadAssignment(
    classId: string,
    assignmentId: string,
  ): Promise<ClassAssignment> {
    const a = await this.assignmentRepo.findOne({
      where: { id: assignmentId, classId },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    return a;
  }

  async listAssignments(
    classId: string,
    query: QueryAssignmentsDto,
    user: RequestUser | null,
  ) {
    const { cls, member, owner } = await this.requireAccess(classId, user);
    if (!owner && member?.status !== 'active') return [];
    const rows = await this.assignmentRepo.find({
      where: { classId },
      order: { dueAt: 'ASC' },
    });
    const now = new Date();
    let list = rows.map((a) => this.decorateAssignment(a, now));
    if (query.skill)
      list = list.filter((a) => a.testSnapshot?.skill === query.skill);
    if (query.status) list = list.filter((a) => a.status === query.status);
    else if (!owner) list = list.filter((a) => a.status !== 'archived');

    if (owner) {
      const stats = await this.assignmentStats(
        classId,
        list.map((a) => a.id),
      );
      return list.map((a) => ({ ...a, stats: stats.get(a.id) }));
    }
    const learnerId = member!.learnerId;
    const mine = await this.latestSubmissions(
      list.map((a) => a.id),
      learnerId,
    );
    return list.map((a) => ({
      ...a,
      mySubmission: this.mySubmissionView(a, mine.get(a.id), cls, learnerId),
    }));
  }

  private mySubmissionView(
    a: ReturnType<ClassroomServiceService['decorateAssignment']>,
    s: { latest: AssignmentSubmission | null; used: number } | undefined,
    cls: ClassEntity,
    learnerId: string,
  ) {
    const latest = s?.latest ?? null;
    const used = s?.used ?? 0;
    const elig = evaluateEligibility({
      assignment: a,
      classStatus: cls.status,
      memberStatus: 'active',
      learnerId,
      attemptsUsed: used,
    });
    const visible = a.resultsVisible;
    return {
      status: latest?.status ?? 'missing',
      attemptsUsed: used,
      attemptId: latest?.attemptId ?? null,
      submittedAt: latest?.submittedAt ?? null,
      finalBand: visible ? (latest?.finalBand ?? null) : null,
      teacherReviewed: visible ? !!latest?.reviewedAt : false,
      canStart: elig.allowed,
      canResume: latest?.status === 'in_progress',
      cannotStartReason: elig.allowed ? null : elig.reason,
      canViewResult: visible && !!latest && latest.status !== 'in_progress',
    };
  }

  private async latestSubmissions(assignmentIds: string[], learnerId: string) {
    const map = new Map<
      string,
      { latest: AssignmentSubmission | null; used: number }
    >();
    if (assignmentIds.length === 0) return map;
    const rows = await this.submissionRepo.find({
      where: { assignmentId: In(assignmentIds), learnerId },
      order: { attemptNo: 'DESC', createdAt: 'DESC' },
    });
    for (const r of rows) {
      const entry = map.get(r.assignmentId) ?? { latest: null, used: 0 };
      if (!entry.latest) entry.latest = r;
      if (COUNTED_STATUSES.includes(r.status)) entry.used++;
      map.set(r.assignmentId, entry);
    }
    return map;
  }

  private async assignmentStats(classId: string, assignmentIds: string[]) {
    const map = new Map<
      string,
      {
        submitted: number;
        late: number;
        inProgress: number;
        missing: number;
        avgBand: number | null;
        pendingReview: number;
      }
    >();
    if (assignmentIds.length === 0) return map;
    const activeCount = (await this.activeMemberIds(classId)).length;
    const rows = await this.submissionRepo
      .createQueryBuilder('s')
      .select('s.assignment_id', 'assignmentId')
      .addSelect(
        "COUNT(DISTINCT s.learner_id) FILTER (WHERE s.status IN ('submitted','late','expired'))",
        'submitted',
      )
      .addSelect(
        "COUNT(DISTINCT s.learner_id) FILTER (WHERE s.status = 'late')",
        'late',
      )
      .addSelect(
        "COUNT(DISTINCT s.learner_id) FILTER (WHERE s.status = 'in_progress')",
        'inProgress',
      )
      .addSelect(
        "AVG(s.final_band) FILTER (WHERE s.status <> 'in_progress')",
        'avgBand',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE s.status <> 'in_progress' AND s.skill IN ('writing','speaking') AND s.reviewed_at IS NULL)",
        'pendingReview',
      )
      .where('s.assignment_id IN (:...ids)', { ids: assignmentIds })
      .groupBy('s.assignment_id')
      .getRawMany<Record<string, string | null>>();
    for (const id of assignmentIds) {
      map.set(id, {
        submitted: 0,
        late: 0,
        inProgress: 0,
        missing: activeCount,
        avgBand: null,
        pendingReview: 0,
      });
    }
    for (const r of rows) {
      const submitted = Number(r.submitted ?? 0);
      map.set(r.assignmentId as string, {
        submitted,
        late: Number(r.late ?? 0),
        inProgress: Number(r.inProgress ?? 0),
        missing: Math.max(0, activeCount - submitted),
        avgBand:
          r.avgBand !== null && r.avgBand !== undefined
            ? Math.round(Number(r.avgBand) * 10) / 10
            : null,
        pendingReview: Number(r.pendingReview ?? 0),
      });
    }
    return map;
  }

  async getAssignment(
    classId: string,
    assignmentId: string,
    user: RequestUser | null,
  ) {
    const { cls, member, owner } = await this.requireAccess(classId, user);
    const a = this.decorateAssignment(
      await this.loadAssignment(classId, assignmentId),
    );
    if (owner) {
      const stats = (await this.assignmentStats(classId, [a.id])).get(a.id);
      return { ...a, stats };
    }
    if (member?.status !== 'active' || a.status === 'archived')
      throw new NotFoundException('Assignment not found');
    const mine = await this.latestSubmissions([a.id], member.learnerId);
    return {
      ...a,
      mySubmission: this.mySubmissionView(
        a,
        mine.get(a.id),
        cls,
        member.learnerId,
      ),
    };
  }

  async updateAssignment(
    classId: string,
    assignmentId: string,
    dto: UpdateAssignmentDto,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const a = await this.loadAssignment(classId, assignmentId);
    const hasSubmissions =
      (await this.submissionRepo.count({ where: { assignmentId } })) > 0;
    if (dto.testId && dto.testId !== a.testId) {
      if (hasSubmissions)
        throw new ConflictException(
          'Cannot change the test once students have started',
        );
      const test = await this.testClient.getTest(dto.testId);
      if (!test || test.status !== 'published')
        throw new BadRequestException('Test is not available');
      if (
        test.visibility === 'private' &&
        !isPrivileged(user) &&
        test.createdBy !== user?.id
      ) {
        throw new ForbiddenException(
          'You can only assign public tests or your own private tests',
        );
      }
      a.testId = test.id;
      a.testSnapshot = {
        title: test.title,
        skill: test.skill,
        difficulty: test.difficulty,
        durationMinutes: test.durationMinutes,
        isMock: test.isMock,
      };
    }
    const { openAt, dueAt, closeAt } = this.parseWindow(dto, a);
    a.openAt = openAt;
    a.dueAt = dueAt;
    a.closeAt = closeAt;
    if (dto.title !== undefined)
      a.title = dto.title.trim() || a.testSnapshot.title;
    if (dto.instructions !== undefined)
      a.instructions = dto.instructions?.trim() || null;
    if (dto.mode !== undefined) a.mode = dto.mode;
    if (dto.allowLate !== undefined) a.allowLate = dto.allowLate;
    if (dto.maxAttempts !== undefined) a.maxAttempts = dto.maxAttempts;
    if (dto.resultPolicy !== undefined) a.resultPolicy = dto.resultPolicy;
    if (dto.extraTime !== undefined) a.extraTime = dto.extraTime;
    if (dto.status !== undefined) a.status = dto.status;
    await this.assignmentRepo.save(a);
    return this.getAssignment(classId, assignmentId, user);
  }

  async deleteAssignment(
    classId: string,
    assignmentId: string,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const a = await this.loadAssignment(classId, assignmentId);
    const n = await this.submissionRepo.count({ where: { assignmentId } });
    if (n > 0)
      throw new ConflictException(
        'Students have already worked on this assignment — archive it instead',
      );
    await this.assignmentRepo.remove(a);
  }

  async releaseResults(
    classId: string,
    assignmentId: string,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const a = await this.loadAssignment(classId, assignmentId);
    a.resultsReleasedAt = new Date();
    await this.assignmentRepo.save(a);
    return this.decorateAssignment(a);
  }

  /** Pull attempts from test-service and reconcile the read model (fallback when events are lost). */
  async syncAssignment(
    classId: string,
    assignmentId: string,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const a = await this.loadAssignment(classId, assignmentId);
    const attempts =
      await this.testClient.getAttemptsForAssignment(assignmentId);
    let upserted = 0;
    for (const at of attempts) {
      await this.upsertFromAttempt(a, {
        attemptId: at.id,
        assignmentId,
        learnerId: at.learnerId,
        testId: at.testId,
        skill: at.test?.skill ?? a.testSnapshot.skill ?? null,
        status: at.status,
        attemptNo: at.attemptNo ?? 1,
        rawScore: at.rawScore ?? null,
        bandScore:
          at.bandScore !== null && at.bandScore !== undefined
            ? Number(at.bandScore)
            : null,
        startedAt: at.startedAt,
        submittedAt: at.submittedAt,
        expiresAt: at.expiresAt,
      });
      upserted++;
    }
    return { synced: upserted };
  }

  // ─── Events from test-service ─────────────────────────────────────────────

  async handleAttemptEvent(event: ClassroomAttemptEvent): Promise<void> {
    if (!event?.assignmentId || !event.attemptId) return;
    const a = await this.assignmentRepo.findOne({
      where: { id: event.assignmentId },
    });
    if (!a) {
      this.logger.warn(
        `Attempt ${event.attemptId} references unknown assignment ${event.assignmentId}`,
      );
      return;
    }
    await this.upsertFromAttempt(a, event);
  }

  private async upsertFromAttempt(
    a: ClassAssignment,
    e: ClassroomAttemptEvent,
  ): Promise<AssignmentSubmission> {
    const submittedAt = e.submittedAt ? new Date(e.submittedAt) : null;
    let s = await this.submissionRepo.findOne({
      where: { attemptId: e.attemptId },
    });
    if (!s) {
      s = this.submissionRepo.create({
        assignmentId: a.id,
        learnerId: e.learnerId,
        attemptId: e.attemptId,
      });
    }
    s.attemptNo = e.attemptNo ?? s.attemptNo ?? 1;
    s.status = mapSubmissionStatus(e.status, submittedAt, a.dueAt);
    s.skill = e.skill ?? a.testSnapshot?.skill ?? s.skill ?? null;
    s.rawScore = e.rawScore ?? s.rawScore ?? null;
    if (e.bandScore !== null && e.bandScore !== undefined) {
      s.aiBand = e.bandScore;
      s.gradedAt = s.gradedAt ?? new Date();
    }
    s.finalBand = s.teacherBand ?? s.aiBand ?? null;
    s.startedAt = e.startedAt ? new Date(e.startedAt) : s.startedAt;
    s.submittedAt = submittedAt ?? s.submittedAt;
    return this.submissionRepo.save(s);
  }

  // ─── Internal queries used by test-service ────────────────────────────────

  async checkAccess(learnerId: string, testId: string) {
    const rows = await this.assignmentRepo
      .createQueryBuilder('a')
      .innerJoin(
        ClassMember,
        'm',
        "m.class_id = a.class_id AND m.learner_id = :learnerId AND m.status = 'active'",
        { learnerId },
      )
      .innerJoin(ClassEntity, 'c', "c.id = a.class_id AND c.status = 'active'")
      .where('a.test_id = :testId', { testId })
      .andWhere("a.status <> 'archived'")
      .getMany();
    const now = new Date();
    // Any non-archived assignment grants read access (a student may review a closed assignment).
    const assignmentIds = rows
      .filter((a) => computeAssignmentStatus(a, now) !== 'archived')
      .map((a) => a.id);
    return { allowed: assignmentIds.length > 0, assignmentIds };
  }

  async eligibility(assignmentId: string, learnerId: string) {
    const a = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    const cls = await this.loadClass(a.classId);
    const member = await this.membership(a.classId, learnerId);
    const used = await this.submissionRepo.count({
      where: { assignmentId, learnerId, status: In(COUNTED_STATUSES) },
    });
    return evaluateEligibility({
      assignment: a,
      classStatus: cls.status,
      memberStatus: member?.status ?? null,
      learnerId,
      attemptsUsed: used,
    });
  }

  async countAssignmentsForTest(testId: string) {
    const count = await this.assignmentRepo.count({ where: { testId } });
    return { count };
  }

  // ─── Gradebook & submissions ──────────────────────────────────────────────

  async gradebook(classId: string, user: RequestUser | null, skill?: string) {
    await this.requireOwner(classId, user);
    const learnerIds = await this.activeMemberIds(classId);
    const info = await this.authClient.getLearners(learnerIds);
    let assignments = (
      await this.assignmentRepo.find({
        where: { classId },
        order: { dueAt: 'ASC' },
      })
    ).filter((a) => a.status !== 'archived');
    if (skill)
      assignments = assignments.filter((a) => a.testSnapshot?.skill === skill);
    const assignmentIds = assignments.map((a) => a.id);
    const subs = assignmentIds.length
      ? await this.submissionRepo.find({
          where: { assignmentId: In(assignmentIds) },
          order: { attemptNo: 'DESC', createdAt: 'DESC' },
        })
      : [];

    const cells: Record<string, Record<string, unknown>> = {};
    for (const s of subs) {
      if (!learnerIds.includes(s.learnerId)) continue;
      cells[s.learnerId] ??= {};
      if (cells[s.learnerId][s.assignmentId]) continue; // keep latest attempt only
      cells[s.learnerId][s.assignmentId] = {
        submissionId: s.id,
        attemptId: s.attemptId,
        status: s.status,
        aiBand: s.aiBand,
        teacherBand: s.teacherBand,
        finalBand: s.finalBand,
        rawScore: s.rawScore,
        reviewed: !!s.reviewedAt,
        submittedAt: s.submittedAt,
      };
    }

    const now = new Date();
    const avg = (values: (number | null | undefined)[]) => {
      const nums = values
        .filter((v): v is number => v !== null && v !== undefined)
        .map(Number);
      return nums.length
        ? Math.round((nums.reduce((x, y) => x + y, 0) / nums.length) * 10) / 10
        : null;
    };
    const students = learnerIds.map((id) => {
      const i = info.get(id);
      const row = cells[id] ?? {};
      return {
        learnerId: id,
        fullName: i?.fullName ?? null,
        email: i?.email ?? null,
        avatarUrl: i?.avatarUrl ?? null,
        avgBand: avg(
          Object.values(row).map(
            (c) => (c as { finalBand: number | null }).finalBand,
          ),
        ),
        completed: Object.values(row).filter(
          (c) => (c as { status: string }).status !== 'in_progress',
        ).length,
      };
    });
    const assignmentCols = assignments.map((a) => ({
      id: a.id,
      title: a.title,
      skill: a.testSnapshot?.skill,
      dueAt: a.dueAt,
      status: computeAssignmentStatus(a, now),
      avgBand: avg(
        learnerIds.map(
          (l) =>
            (cells[l]?.[a.id] as { finalBand: number | null } | undefined)
              ?.finalBand,
        ),
      ),
      submitted: learnerIds.filter((l) => {
        const c = cells[l]?.[a.id] as { status: string } | undefined;
        return c && c.status !== 'in_progress';
      }).length,
    }));
    return {
      students,
      assignments: assignmentCols,
      cells,
      totalStudents: learnerIds.length,
    };
  }

  async gradebookCsv(
    classId: string,
    user: RequestUser | null,
    skill?: string,
  ): Promise<string> {
    const gb = await this.gradebook(classId, user, skill);
    const esc = (v: unknown) => {
      const s =
        v === null || v === undefined
          ? ''
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v as string | number | boolean);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Student',
      'Email',
      ...gb.assignments.map((a) => `${a.title} (${a.skill})`),
      'Average',
    ];
    const lines = [header.map(esc).join(',')];
    for (const st of gb.students) {
      const row = [
        st.fullName ?? '',
        st.email ?? '',
        ...gb.assignments.map((a) => {
          const c = gb.cells[st.learnerId]?.[a.id] as
            | { finalBand: number | null; status: string }
            | undefined;
          if (!c) return '';
          if (c.status === 'in_progress') return 'in progress';
          return c.finalBand ?? '';
        }),
        st.avgBand ?? '',
      ];
      lines.push(row.map(esc).join(','));
    }
    return '\uFEFF' + lines.join('\n');
  }

  async listSubmissions(
    classId: string,
    assignmentId: string,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const a = this.decorateAssignment(
      await this.loadAssignment(classId, assignmentId),
    );
    const learnerIds = await this.activeMemberIds(classId);
    const info = await this.authClient.getLearners(learnerIds);
    const subs = await this.submissionRepo.find({
      where: { assignmentId },
      order: { attemptNo: 'DESC', createdAt: 'DESC' },
    });
    const byLearner = new Map<string, AssignmentSubmission[]>();
    for (const s of subs)
      byLearner.set(s.learnerId, [...(byLearner.get(s.learnerId) ?? []), s]);
    const rows = learnerIds.map((learnerId) => {
      const list = byLearner.get(learnerId) ?? [];
      const latest = list[0] ?? null;
      const i = info.get(learnerId);
      return {
        learnerId,
        fullName: i?.fullName ?? null,
        email: i?.email ?? null,
        avatarUrl: i?.avatarUrl ?? null,
        attempts: list.length,
        latest: latest
          ? {
              submissionId: latest.id,
              attemptId: latest.attemptId,
              status: latest.status,
              aiBand: latest.aiBand,
              teacherBand: latest.teacherBand,
              finalBand: latest.finalBand,
              rawScore: latest.rawScore,
              submittedAt: latest.submittedAt,
              reviewed: !!latest.reviewedAt,
            }
          : null,
        status: latest?.status ?? 'missing',
      };
    });
    return { assignment: a, submissions: rows };
  }

  async getSubmission(
    classId: string,
    submissionId: string,
    user: RequestUser | null,
  ) {
    const { cls, member, owner } = await this.requireAccess(classId, user);
    const s = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });
    if (!s) throw new NotFoundException('Submission not found');
    const a = this.decorateAssignment(
      await this.loadAssignment(classId, s.assignmentId),
    );
    const isOwnerLearner = !owner && member?.learnerId === s.learnerId;
    if (!owner && !isOwnerLearner)
      throw new NotFoundException('Submission not found');

    const visible = owner || a.resultsVisible;
    const base = {
      id: s.id,
      assignment: a,
      className: cls.name,
      learnerId: s.learnerId,
      attemptId: s.attemptId,
      attemptNo: s.attemptNo,
      status: s.status,
      skill: s.skill,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      resultsVisible: visible,
    };
    if (!visible) {
      return {
        ...base,
        pendingMessage:
          a.resultPolicy === 'after_due'
            ? 'Results are released after the due date'
            : 'Results will be released by your teacher',
      };
    }
    const [attempt, learners] = await Promise.all([
      this.testClient.getAttempt(s.attemptId),
      owner
        ? this.authClient.getLearners([s.learnerId])
        : Promise.resolve(new Map<string, LearnerInfo>()),
    ]);
    const l = learners.get(s.learnerId);
    return {
      ...base,
      rawScore: s.rawScore,
      aiBand: s.aiBand,
      teacherBand: s.teacherBand,
      finalBand: s.finalBand,
      teacherFeedback: s.teacherFeedback,
      teacherRubric: s.teacherRubric,
      reviewedAt: s.reviewedAt,
      canReview:
        owner &&
        REVIEWABLE_SKILLS.has(s.skill ?? '') &&
        s.status !== 'in_progress',
      learner: owner
        ? {
            fullName: l?.fullName ?? null,
            email: l?.email ?? null,
            avatarUrl: l?.avatarUrl ?? null,
          }
        : undefined,
      attempt: attempt ? this.trimAttempt(attempt) : null,
    };
  }

  private trimAttempt(at: AttemptSummary) {
    const {
      draftAnswers,
      questionAttempts,
      aiFeedback,
      bandScore,
      rawScore,
      status,
      submittedAt,
      expiresAt,
      startedAt,
      test,
      id,
    } = at;
    return {
      id,
      status,
      startedAt,
      submittedAt,
      expiresAt,
      rawScore,
      bandScore,
      aiFeedback,
      draftAnswers,
      questionAttempts,
      test,
    };
  }

  async reviewSubmission(
    classId: string,
    submissionId: string,
    dto: ReviewSubmissionDto,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const s = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });
    if (!s) throw new NotFoundException('Submission not found');
    const a = await this.loadAssignment(classId, s.assignmentId);
    if (s.status === 'in_progress')
      throw new ConflictException('The student has not submitted yet');
    if (!REVIEWABLE_SKILLS.has(s.skill ?? '')) {
      throw new BadRequestException(
        'Only Writing and Speaking submissions can be re-scored by a teacher',
      );
    }
    if (dto.teacherBand !== undefined)
      s.teacherBand = roundHalfBand(dto.teacherBand);
    if (dto.teacherRubric !== undefined) {
      const rubric: Record<string, number> = {};
      for (const [k, v] of Object.entries(dto.teacherRubric)) {
        if (typeof v === 'number' && !Number.isNaN(v))
          rubric[k] = roundHalfBand(v);
      }
      s.teacherRubric = rubric;
      if (dto.teacherBand === undefined && Object.keys(rubric).length > 0) {
        const vals = Object.values(rubric);
        s.teacherBand = roundHalfBand(
          vals.reduce((x, y) => x + y, 0) / vals.length,
        );
      }
    }
    if (dto.teacherFeedback !== undefined)
      s.teacherFeedback = dto.teacherFeedback.trim() || null;
    s.finalBand = s.teacherBand ?? s.aiBand ?? null;
    s.reviewedBy = user?.id ?? null;
    s.reviewedAt = new Date();
    await this.submissionRepo.save(s);
    if (dto.releaseNow && a.resultPolicy === 'manual' && !a.resultsReleasedAt) {
      a.resultsReleasedAt = new Date();
      await this.assignmentRepo.save(a);
    }
    return this.getSubmission(classId, submissionId, user);
  }

  // ─── Student progress (teacher view) ──────────────────────────────────────

  async studentProgress(
    classId: string,
    learnerId: string,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const member = await this.membership(classId, learnerId);
    if (!member || member.status === 'removed')
      throw new NotFoundException('Student is not in this class');
    const assignments = await this.assignmentRepo.find({
      where: { classId },
      order: { dueAt: 'ASC' },
    });
    const subs = await this.submissionRepo.find({
      where: { assignmentId: In(assignments.map((a) => a.id)), learnerId },
      order: { createdAt: 'DESC' },
    });
    const [info, summary, bandProfiles, progress] = await Promise.all([
      this.authClient.getLearners([learnerId]),
      this.analyticsClient.getSummary(learnerId),
      this.analyticsClient.getBandProfiles(learnerId),
      this.analyticsClient.getProgress(learnerId),
    ]);
    const i = info.get(learnerId);
    const bySkill: Record<string, { count: number; avgBand: number | null }> =
      {};
    for (const s of subs) {
      if (!s.skill || s.finalBand === null) continue;
      const e = (bySkill[s.skill] ??= { count: 0, avgBand: 0 });
      e.avgBand =
        ((e.avgBand ?? 0) * e.count + Number(s.finalBand)) / (e.count + 1);
      e.count++;
    }
    for (const k of Object.keys(bySkill))
      bySkill[k].avgBand = Math.round((bySkill[k].avgBand ?? 0) * 10) / 10;
    return {
      learner: {
        id: learnerId,
        fullName: i?.fullName ?? null,
        email: i?.email ?? null,
        avatarUrl: i?.avatarUrl ?? null,
        currentLevel: i?.currentLevel ?? null,
      },
      member: {
        status: member.status,
        joinedAt: member.joinedAt,
        note: member.note,
      },
      classSkillAverages: bySkill,
      submissions: subs.map((s) => {
        const a = assignments.find((x) => x.id === s.assignmentId);
        return {
          id: s.id,
          assignmentId: s.assignmentId,
          assignmentTitle: a?.title,
          skill: s.skill,
          status: s.status,
          attemptNo: s.attemptNo,
          aiBand: s.aiBand,
          teacherBand: s.teacherBand,
          finalBand: s.finalBand,
          submittedAt: s.submittedAt,
          reviewed: !!s.reviewedAt,
        };
      }),
      analytics: { summary, bandProfiles, progress },
    };
  }

  // ─── Dashboards ───────────────────────────────────────────────────────────

  async teacherDashboard(user: RequestUser | null) {
    const teacherId = assertApprovedTeacher(user);
    const classes = await this.classRepo.find({
      where: { teacherId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) {
      return {
        classes: [],
        totals: {
          classes: 0,
          students: 0,
          openAssignments: 0,
          pendingReview: 0,
          pendingJoinRequests: 0,
        },
        needsAttention: [],
      };
    }
    const counts = await this.classCounts(classIds);
    const assignments = await this.assignmentRepo.find({
      where: { classId: In(classIds) },
    });
    const now = new Date();
    const open = assignments.filter(
      (a) => computeAssignmentStatus(a, now) === 'open',
    );
    const pendingReviewExact = assignments.length
      ? await this.submissionRepo
          .createQueryBuilder('s')
          .where('s.assignment_id IN (:...ids)', {
            ids: assignments.map((a) => a.id),
          })
          .andWhere("s.skill IN ('writing','speaking')")
          .andWhere("s.status <> 'in_progress'")
          .andWhere('s.reviewed_at IS NULL')
          .getCount()
      : 0;
    let students = 0;
    let pendingJoin = 0;
    for (const c of counts.values()) {
      students += c.memberCount;
      pendingJoin += c.pendingCount;
    }
    const dueSoon = open
      .filter(
        (a) => new Date(a.dueAt).getTime() - now.getTime() < 3 * 86_400_000,
      )
      .map((a) => ({
        id: a.id,
        classId: a.classId,
        title: a.title,
        skill: a.testSnapshot?.skill,
        dueAt: a.dueAt,
      }));
    return {
      classes: classes.map((c) => ({ ...c, ...(counts.get(c.id) ?? {}) })),
      totals: {
        classes: classes.length,
        students,
        openAssignments: open.length,
        pendingReview: pendingReviewExact,
        pendingJoinRequests: pendingJoin,
      },
      needsAttention: dueSoon,
    };
  }

  /** Learner widget: upcoming assignments across all active classes. */
  async myUpcomingAssignments(user: RequestUser | null, days = 7) {
    const learnerId = resolveLearnerId(user);
    const memberships = await this.memberRepo.find({
      where: { learnerId, status: 'active' },
    });
    if (memberships.length === 0) return [];
    const classIds = memberships.map((m) => m.classId);
    const classes = await this.classRepo.find({
      where: { id: In(classIds), status: 'active' },
    });
    const classById = new Map(classes.map((c) => [c.id, c]));
    const assignments = await this.assignmentRepo.find({
      where: { classId: In([...classById.keys()]) },
      order: { dueAt: 'ASC' },
    });
    const now = new Date();
    const horizon = now.getTime() + days * 86_400_000;
    const live = assignments
      .map((a) => this.decorateAssignment(a, now))
      .filter(
        (a) =>
          a.status === 'open' ||
          (a.status === 'scheduled' &&
            new Date(a.openAt as Date).getTime() < horizon),
      );
    const mine = await this.latestSubmissions(
      live.map((a) => a.id),
      learnerId,
    );
    return live
      .map((a) => ({
        ...a,
        className: classById.get(a.classId)?.name,
        mySubmission: this.mySubmissionView(
          a,
          mine.get(a.id),
          classById.get(a.classId)!,
          learnerId,
        ),
      }))
      .filter(
        (a) =>
          a.mySubmission.status === 'missing' ||
          a.mySubmission.status === 'in_progress',
      )
      .slice(0, 10);
  }

  // ─── Posts ────────────────────────────────────────────────────────────────

  async listPosts(classId: string, user: RequestUser | null) {
    const { member, owner } = await this.requireAccess(classId, user);
    if (!owner && member?.status !== 'active') return [];
    return this.postRepo.find({
      where: { classId },
      order: { pinned: 'DESC', createdAt: 'DESC' },
    });
  }

  async createPost(
    classId: string,
    dto: CreatePostDto,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const post = this.postRepo.create({
      classId,
      authorAccountId: user?.id ?? '00000000-0000-0000-0000-000000000000',
      type: dto.type ?? 'announcement',
      title: dto.title?.trim() || null,
      body: dto.body.trim(),
      attachments: dto.attachments ?? null,
      pinned: dto.pinned ?? false,
    });
    return this.postRepo.save(post);
  }

  async updatePost(
    classId: string,
    postId: string,
    dto: UpdatePostDto,
    user: RequestUser | null,
  ) {
    await this.requireOwner(classId, user);
    const post = await this.postRepo.findOne({
      where: { id: postId, classId },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (dto.type !== undefined) post.type = dto.type;
    if (dto.title !== undefined) post.title = dto.title?.trim() || null;
    if (dto.body !== undefined) post.body = dto.body.trim();
    if (dto.attachments !== undefined) post.attachments = dto.attachments;
    if (dto.pinned !== undefined) post.pinned = dto.pinned;
    return this.postRepo.save(post);
  }

  async deletePost(classId: string, postId: string, user: RequestUser | null) {
    await this.requireOwner(classId, user);
    await this.postRepo.delete({ id: postId, classId });
  }
}
