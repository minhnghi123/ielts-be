import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Account } from './entities/account.entity';
import { LearnerProfile } from './entities/learner-profile.entity';
import { TeacherProfile, TeacherApprovalStatus } from './entities/teacher-profile.entity';
import { RegisterLearnerDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class AuthServiceService {
  private supabase;

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(LearnerProfile)
    private readonly learnerProfileRepository: Repository<LearnerProfile>,
    @InjectRepository(TeacherProfile)
    private readonly teacherProfileRepository: Repository<TeacherProfile>,
    private readonly jwtService: JwtService,
  ) {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_KEY || ''
    );
  }

  async googleLogin(accessToken: string) {
    // 1. Verify token with Supabase
    const { data: { user }, error } = await this.supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const email = user.email;
    const fullName = user.user_metadata?.full_name;
    const avatarUrl = user.user_metadata?.avatar_url;

    // 2. Check if account exists
    let account = await this.accountRepository.findOne({
      where: { email },
      relations: ['learnerProfile', 'adminProfile', 'teacherProfile'],
    });

    if (!account) {
      // 3. Create new user if they don't exist
      const newAccount = this.accountRepository.create({
        email,
        fullName,
        avatarUrl,
        status: 'active',
        // Note: password is nullable now
      });

      account = await this.accountRepository.save(newAccount);

      // Create learner profile
      const learnerProfile = this.learnerProfileRepository.create({
        accountId: account.id,
        currentLevel: 'beginner',
      });
      account.learnerProfile = await this.learnerProfileRepository.save(learnerProfile);
    } else {
      // Optional: Update name/avatar if they are missing
      let updated = false;
      if (!account.fullName && fullName) { account.fullName = fullName; updated = true; }
      if (!account.avatarUrl && avatarUrl) { account.avatarUrl = avatarUrl; updated = true; }
      if (updated) {
        await this.accountRepository.save(account);
      }
    }

    if (account.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    const { role, profileId, teacherStatus } = this.resolveIdentity(account);

    // 4. Generate system JWT
    const payload = {
      sub: account.id,
      email: account.email,
      role,
      teacherStatus,
      profileId,
    };

    const sysToken = this.jwtService.sign(payload);

    return {
      accessToken: sysToken,
      user: {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        avatarUrl: account.avatarUrl,
        role,
        teacherStatus,
        profileId,
      },
    };
  }

  async registerLearner(registerDto: RegisterLearnerDto) {
    const { email, password, confirmPassword, role, fullName, organization } = registerDto;

    // Validate password confirmation
    if (password !== confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }

    // Check if email already exists
    const existingAccount = await this.accountRepository.findOne({
      where: { email },
    });

    if (existingAccount) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create account
    const account = this.accountRepository.create({
      email,
      password: hashedPassword,
      status: 'active',
      fullName: fullName?.trim() || undefined,
    });

    const savedAccount = await this.accountRepository.save(account);

    if (role === 'teacher') {
      // Teachers wait for an admin to approve them before they can create classes.
      await this.teacherProfileRepository.save(
        this.teacherProfileRepository.create({
          accountId: savedAccount.id,
          organization: organization?.trim() || null,
          approvalStatus: 'pending',
        }),
      );
    } else {
      await this.learnerProfileRepository.save(
        this.learnerProfileRepository.create({
          accountId: savedAccount.id,
          currentLevel: 'beginner',
        }),
      );
    }

    return {
      id: savedAccount.id,
      email: savedAccount.email,
      status: savedAccount.status,
      role: role === 'teacher' ? 'teacher' : 'learner',
      teacherStatus: role === 'teacher' ? 'pending' : undefined,
      createdAt: savedAccount.createdAt,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find account with profile
    const account = await this.accountRepository.findOne({
      where: { email },
      relations: ['learnerProfile', 'adminProfile', 'teacherProfile'],
    });

    if (!account) {
      throw new UnauthorizedException('Account not found');
    }

    if (!account.password) {
      throw new UnauthorizedException('This account was created via Google Sign-In. Please sign in with Google.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, account.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account status
    if (account.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    // Determine role
    const { role, profileId, teacherStatus } = this.resolveIdentity(account);

    // Generate JWT token
    const payload = {
      sub: account.id,
      email: account.email,
      role,
      teacherStatus,
      profileId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        avatarUrl: account.avatarUrl,
        role,
        teacherStatus,
        profileId,
      },
    };
  }

  async validateUser(userId: string) {
    const account = await this.accountRepository.findOne({
      where: { id: userId },
      relations: ['learnerProfile', 'adminProfile', 'teacherProfile'],
    });

    if (!account) {
      throw new NotFoundException('User not found');
    }

    const { role, profileId, teacherStatus } = this.resolveIdentity(account);

    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      avatarUrl: account.avatarUrl,
      role,
      teacherStatus,
      profileId,
      status: account.status,
    };
  }

  async getProfile(userId: string) {
    return this.validateUser(userId);
  }

  async getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: 'learner' | 'teacher' | 'admin',
    status?: string,
  ) {
    const queryBuilder = this.accountRepository.createQueryBuilder('account')
      .leftJoinAndSelect('account.learnerProfile', 'learnerProfile')
      .leftJoinAndSelect('account.adminProfile', 'adminProfile')
      .leftJoinAndSelect('account.teacherProfile', 'teacherProfile')
      .orderBy('account.createdAt', 'DESC');

    if (search) {
      queryBuilder.andWhere(
        '(account.email ILIKE :search OR account.fullName ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (role === 'admin') queryBuilder.andWhere('adminProfile.id IS NOT NULL');
    if (role === 'teacher') queryBuilder.andWhere('adminProfile.id IS NULL AND teacherProfile.id IS NOT NULL');
    if (role === 'learner') queryBuilder.andWhere('adminProfile.id IS NULL AND teacherProfile.id IS NULL');
    if (status) queryBuilder.andWhere('account.status = :status', { status });

    const [accounts, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedAccounts = accounts.map((account) => {
      const { role, teacherStatus } = this.resolveIdentity(account);
      const level = account.learnerProfile?.currentLevel;

      return {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        avatarUrl: account.avatarUrl,
        status: account.status,
        role,
        teacherStatus,
        level,
        createdAt: account.createdAt,
      };
    });

    return {
      data: formattedAccounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const account = await this.accountRepository.findOne({ where: { id: userId } });
    if (!account) throw new NotFoundException('User not found');
    if (!account.password) {
      throw new UnauthorizedException(
        'This account uses Google Sign-In and has no password to change.',
      );
    }
    const ok = await bcrypt.compare(dto.currentPassword, account.password);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) {
      throw new ConflictException('New password must differ from the current password');
    }
    account.password = await bcrypt.hash(dto.newPassword, 10);
    await this.accountRepository.save(account);
    return { message: 'Password changed successfully' };
  }

  async updateUserStatus(
    targetId: string,
    status: 'active' | 'suspended',
    actingUserId?: string | string[],
  ) {
    if (actingUserId && actingUserId === targetId) {
      throw new ConflictException('You cannot change the status of your own account');
    }
    const account = await this.accountRepository.findOne({
      where: { id: targetId },
      relations: ['adminProfile'],
    });
    if (!account) throw new NotFoundException('User not found');
    account.status = status;
    await this.accountRepository.save(account);
    return this.validateUser(targetId);
  }

  async updateProfile(userId: string, updateData: { fullName?: string; avatarUrl?: string }) {
    const account = await this.accountRepository.findOne({
      where: { id: userId },
      relations: ['learnerProfile', 'adminProfile', 'teacherProfile'],
    });

    if (!account) {
      throw new NotFoundException('User not found');
    }

    if (updateData.fullName !== undefined) {
      account.fullName = updateData.fullName;
    }
    if (updateData.avatarUrl !== undefined) {
      account.avatarUrl = updateData.avatarUrl;
    }

    await this.accountRepository.save(account);

    return this.validateUser(userId);
  }

  // ─── Role resolution ───────────────────────────────────────────────────────

  /** admin > teacher > learner. Teachers keep any legacy learner profile for history. */
  private resolveIdentity(account: Account): {
    role: 'learner' | 'teacher' | 'admin';
    profileId: string | undefined;
    teacherStatus: TeacherApprovalStatus | undefined;
  } {
    if (account.adminProfile) {
      return { role: 'admin', profileId: account.adminProfile.id, teacherStatus: undefined };
    }
    if (account.teacherProfile && account.teacherProfile.approvalStatus !== 'rejected') {
      return {
        role: 'teacher',
        profileId: account.teacherProfile.id,
        teacherStatus: account.teacherProfile.approvalStatus,
      };
    }
    return { role: 'learner', profileId: account.learnerProfile?.id, teacherStatus: undefined };
  }

  // ─── Teacher management (admin) ───────────────────────────────────────────

  async getTeachers(approval?: TeacherApprovalStatus, page = 1, limit = 20, search?: string) {
    const qb = this.teacherProfileRepository
      .createQueryBuilder('teacher')
      .innerJoinAndSelect('teacher.account', 'account')
      .orderBy('teacher.createdAt', 'DESC');
    if (approval) qb.andWhere('teacher.approvalStatus = :approval', { approval });
    if (search) {
      qb.andWhere('(account.email ILIKE :search OR account.fullName ILIKE :search)', {
        search: `%${search}%`,
      });
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return {
      data: rows.map((t) => this.formatTeacher(t)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private formatTeacher(t: TeacherProfile) {
    return {
      id: t.id,
      accountId: t.accountId,
      email: t.account?.email,
      fullName: t.account?.fullName,
      avatarUrl: t.account?.avatarUrl,
      accountStatus: t.account?.status,
      organization: t.organization,
      bio: t.bio,
      approvalStatus: t.approvalStatus,
      approvedAt: t.approvedAt,
      rejectionReason: t.rejectionReason,
      createdAt: t.createdAt,
    };
  }

  async updateTeacherApproval(
    teacherId: string,
    status: 'approved' | 'rejected',
    adminAccountId: string | null,
    reason?: string,
  ) {
    const teacher = await this.teacherProfileRepository.findOne({
      where: { id: teacherId },
      relations: ['account'],
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    teacher.approvalStatus = status;
    teacher.approvedBy = status === 'approved' ? adminAccountId : null;
    teacher.approvedAt = status === 'approved' ? new Date() : null;
    teacher.rejectionReason = status === 'rejected' ? reason?.trim() || null : null;
    await this.teacherProfileRepository.save(teacher);
    return this.formatTeacher(teacher);
  }

  /** Promote a learner to teacher (auto-approved) or demote a teacher back to learner. */
  async updateUserRole(
    targetAccountId: string,
    role: 'teacher' | 'learner',
    actingAccountId: string | null,
    organization?: string,
  ) {
    if (actingAccountId && actingAccountId === targetAccountId) {
      throw new ConflictException('You cannot change your own role');
    }
    const account = await this.accountRepository.findOne({
      where: { id: targetAccountId },
      relations: ['learnerProfile', 'adminProfile', 'teacherProfile'],
    });
    if (!account) throw new NotFoundException('User not found');
    if (account.adminProfile) throw new ConflictException('Admin accounts cannot change role');

    if (role === 'teacher') {
      if (account.teacherProfile) {
        account.teacherProfile.approvalStatus = 'approved';
        account.teacherProfile.approvedBy = actingAccountId;
        account.teacherProfile.approvedAt = new Date();
        account.teacherProfile.rejectionReason = null;
        if (organization !== undefined) account.teacherProfile.organization = organization || null;
        await this.teacherProfileRepository.save(account.teacherProfile);
      } else {
        await this.teacherProfileRepository.save(
          this.teacherProfileRepository.create({
            accountId: account.id,
            organization: organization || null,
            approvalStatus: 'approved',
            approvedBy: actingAccountId,
            approvedAt: new Date(),
          }),
        );
      }
    } else {
      if (account.teacherProfile) {
        await this.teacherProfileRepository.remove(account.teacherProfile);
      }
      if (!account.learnerProfile) {
        await this.learnerProfileRepository.save(
          this.learnerProfileRepository.create({ accountId: account.id, currentLevel: 'beginner' }),
        );
      }
    }
    return this.validateUser(targetAccountId);
  }

  /** Teachers may edit their own organization/bio. */
  async updateTeacherProfile(accountId: string, data: { organization?: string; bio?: string }) {
    const teacher = await this.teacherProfileRepository.findOne({ where: { accountId } });
    if (!teacher) throw new NotFoundException('Teacher profile not found');
    if (data.organization !== undefined) teacher.organization = data.organization || null;
    if (data.bio !== undefined) teacher.bio = data.bio || null;
    await this.teacherProfileRepository.save(teacher);
    return this.formatTeacher(teacher);
  }

  // ─── Internal lookups (system) ────────────────────────────────────────────

  /** Display info for a set of learner_profiles.id — used by classroom-service gradebooks. */
  async getLearnersByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
    if (unique.length === 0) return [];
    const learners = await this.learnerProfileRepository.find({
      where: { id: In(unique) },
      relations: ['account'],
    });
    return learners.map((l) => ({
      id: l.id,
      accountId: l.accountId,
      email: l.account?.email ?? null,
      fullName: l.account?.fullName ?? null,
      avatarUrl: l.account?.avatarUrl ?? null,
      currentLevel: l.currentLevel,
      status: l.account?.status ?? null,
    }));
  }

  async getTeachersByIds(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 200);
    if (unique.length === 0) return [];
    const teachers = await this.teacherProfileRepository.find({
      where: { id: In(unique) },
      relations: ['account'],
    });
    return teachers.map((t) => this.formatTeacher(t));
  }
}
