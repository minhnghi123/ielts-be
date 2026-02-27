import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Account } from './entities/account.entity';
import { LearnerProfile } from './entities/learner-profile.entity';
import { RegisterLearnerDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthServiceService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(LearnerProfile)
    private readonly learnerProfileRepository: Repository<LearnerProfile>,
    private readonly jwtService: JwtService,
  ) { }

  async registerLearner(registerDto: RegisterLearnerDto) {
    const { email, password, confirmPassword } = registerDto;

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
    });

    const savedAccount = await this.accountRepository.save(account);

    // Create learner profile
    const learnerProfile = this.learnerProfileRepository.create({
      accountId: savedAccount.id,
      currentLevel: 'beginner',
    });

    await this.learnerProfileRepository.save(learnerProfile);

    return {
      id: savedAccount.id,
      email: savedAccount.email,
      status: savedAccount.status,
      createdAt: savedAccount.createdAt,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find account with profile
    const account = await this.accountRepository.findOne({
      where: { email },
      relations: ['learnerProfile', 'adminProfile'],
    });

    if (!account) {
      throw new UnauthorizedException('Account not found');
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
    const role = account.learnerProfile ? 'learner' : 'admin';
    const profileId = account.learnerProfile?.id || account.adminProfile?.id;

    // Generate JWT token
    const payload = {
      sub: account.id,
      email: account.email,
      role,
      profileId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: account.id,
        email: account.email,
        role,
        profileId,
      },
    };
  }

  async validateUser(userId: string) {
    const account = await this.accountRepository.findOne({
      where: { id: userId },
      relations: ['learnerProfile', 'adminProfile'],
    });

    if (!account) {
      throw new NotFoundException('User not found');
    }

    const role = account.learnerProfile ? 'learner' : 'admin';
    const profileId = account.learnerProfile?.id || account.adminProfile?.id;

    return {
      id: account.id,
      email: account.email,
      role,
      profileId,
      status: account.status,
    };
  }

  async getProfile(userId: string) {
    return this.validateUser(userId);
  }

  async getUsers(page: number = 1, limit: number = 10, search?: string) {
    const queryBuilder = this.accountRepository.createQueryBuilder('account')
      .leftJoinAndSelect('account.learnerProfile', 'learnerProfile')
      .leftJoinAndSelect('account.adminProfile', 'adminProfile')
      .orderBy('account.createdAt', 'DESC');

    if (search) {
      queryBuilder.where('account.email ILIKE :search', { search: `%${search}%` });
    }

    const [accounts, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedAccounts = accounts.map((account) => {
      const role = account.adminProfile ? 'admin' : 'learner';
      const level = account.learnerProfile?.currentLevel;

      return {
        id: account.id,
        email: account.email,
        status: account.status,
        role,
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
}
