import { Injectable, Logger } from '@nestjs/common';
import { internalJson } from './internal-http';

export interface LearnerInfo {
  id: string;
  accountId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  currentLevel?: string;
  status?: string | null;
}

export interface TeacherInfo {
  id: string;
  accountId: string;
  email?: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  organization?: string | null;
  bio?: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
}

@Injectable()
export class AuthClient {
  private readonly logger = new Logger(AuthClient.name);
  private readonly baseUrl =
    process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
  private readonly teacherCache = new Map<
    string,
    { value: TeacherInfo | null; until: number }
  >();

  async getLearners(ids: string[]): Promise<Map<string, LearnerInfo>> {
    const map = new Map<string, LearnerInfo>();
    const unique = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const rows = await internalJson<LearnerInfo[]>(
        this.logger,
        `${this.baseUrl}/auth/internal/learners?ids=${chunk.join(',')}`,
      );
      for (const r of rows ?? []) map.set(r.id, r);
    }
    return map;
  }

  async getTeacher(id: string): Promise<TeacherInfo | null> {
    const cached = this.teacherCache.get(id);
    if (cached && cached.until > Date.now()) return cached.value;
    const rows = await internalJson<TeacherInfo[]>(
      this.logger,
      `${this.baseUrl}/auth/internal/teachers?ids=${id}`,
    );
    const value = rows?.[0] ?? null;
    this.teacherCache.set(id, { value, until: Date.now() + 60_000 });
    return value;
  }

  async getTeachers(ids: string[]): Promise<Map<string, TeacherInfo>> {
    const map = new Map<string, TeacherInfo>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const rows = await internalJson<TeacherInfo[]>(
      this.logger,
      `${this.baseUrl}/auth/internal/teachers?ids=${unique.join(',')}`,
    );
    for (const r of rows ?? []) map.set(r.id, r);
    return map;
  }
}
