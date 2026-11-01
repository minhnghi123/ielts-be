import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Query,
  Put,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthServiceService } from './auth-service.service';
import { RegisterLearnerDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, UpdateUserStatusDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles, RolesGuard } from '@app/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthServiceController {
  constructor(private readonly authService: AuthServiceService) { }

  @Post('register')
  @ApiOperation({ summary: 'Register a new learner account' })
  @ApiResponse({ status: 201, description: 'Account successfully created' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() registerDto: RegisterLearnerDto) {
    return this.authService.registerLearner(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login to get access token' })
  @ApiResponse({ status: 200, description: 'Successfully logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('google')
  @ApiOperation({ summary: 'Login using Google OAuth access token' })
  @ApiResponse({ status: 200, description: 'Successfully logged in via Google' })
  @ApiResponse({ status: 401, description: 'Invalid token' })
  async googleLogin(@Body('access_token') accessToken: string) {
    return this.authService.googleLogin(accessToken);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.sub);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile (Name and Avatar)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(
    @Request() req,
    @Body() updateDto: { fullName?: string; avatarUrl?: string },
  ) {
    return this.authService.updateProfile(req.user.sub, updateDto);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the password of the current user' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  // ─── Admin: user management ───────────────────────────────────────────────

  @Get('users')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: 'learner' | 'admin',
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.authService.getUsers(pageNum, limitNum, search, role, status);
  }

  @Patch('users/:id/status')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend or re-activate a user (Admin only)' })
  async updateUserStatus(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.authService.updateUserStatus(id, dto.status, req.headers['x-user-id']);
  }
}
