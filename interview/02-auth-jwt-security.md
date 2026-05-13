# Interview: Authentication, JWT & Security

---

## Q1. Giải thích toàn bộ JWT flow trong auth-service. Từ login đến verify.

**Trả lời:**

**Bước 1: Login → Tạo JWT**

```typescript
// apps/auth-service/src/auth/auth.service.ts
async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
  // 1. Tìm account theo email
  const account = await this.accountRepo.findOne({
    where: { email: dto.email },
    relations: ['learnerProfile', 'adminProfile'],
  });
  if (!account) throw new UnauthorizedException('Invalid credentials');

  // 2. Verify password với bcrypt
  const isMatch = await bcrypt.compare(dto.password, account.password);
  if (!isMatch) throw new UnauthorizedException('Invalid credentials');

  // 3. Xác định role và profileId
  const role = account.learnerProfile ? 'learner' : 'admin';
  const profileId = account.learnerProfile?.id ?? account.adminProfile?.id;

  // 4. Sign JWT
  const payload = { sub: account.id, email: account.email, role, profileId };
  const accessToken = this.jwtService.sign(payload, {
    secret: this.configService.get('JWT_SECRET'),
    expiresIn: this.configService.get('JWT_EXPIRES_IN', '24h'),
  });

  return { accessToken, user: { id: account.id, email, role, profileId, fullName: account.fullName } };
}
```

**Bước 2: Request có Bearer token → Verify**

```typescript
// JWT Strategy (Passport.js pattern)
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),  // Đọc từ Authorization header
      ignoreExpiration: false,  // Reject expired tokens
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  // Được gọi SAU KHI Passport verify signature và expiry
  async validate(payload: JwtPayload): Promise<AuthUser> {
    // payload = { sub, email, role, profileId, iat, exp }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      profileId: payload.profileId,
    };
  }
}
```

**Bước 3: Controller dùng Guard**

```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)  // ← Passport JWT guard
getProfile(@Request() req) {
  // req.user = return value của JwtStrategy.validate()
  return this.authService.getProfile(req.user.id);
}
```

**JWT structure (3 parts, base64 encoded):**

```
Header.Payload.Signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  (Header: algorithm HS256, type JWT)
.eyJzdWIiOiJ1dWlkLi4uIiwiZW1haWwiOiIuLi4iLCJyb2xlIjoibGVhcm5lciIsInByb2ZpbGVJZCI6InV1aWQuLi4iLCJpYXQiOjE2OTk5OTk5OTksImV4cCI6MTcwMDA4NjM5OX0  (Payload)
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  (Signature = HMAC-SHA256(header.payload, secret))
```

**HS256 (HMAC-SHA256):** Dùng cùng một `JWT_SECRET` để sign và verify. Tất cả services phải dùng cùng secret → `JWT_SECRET` phải giống nhau trong tất cả `.env` files.

---

## Q2. bcrypt là gì? Tại sao không hash password bằng MD5 hay SHA256?

**Trả lời:**

**MD5/SHA256 — không an toàn cho password:**

```python
md5("password123") → "482c811da5d5b4bc6d497ffa98491e38"
# Cùng input → LUÔN cùng output (deterministic)
# Rainbow table attack: precompute hash của 1 billion common passwords
# Lookup "482c811..." → "password123" trong milliseconds
```

**bcrypt — password hashing an toàn:**

```typescript
// 1. Hash với salt
const salt = await bcrypt.genSalt(10); // 10 = cost factor
// salt = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
// (random bytes included, duy nhất mỗi lần)

const hash = await bcrypt.hash(password, salt);
// hash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy.WUy5..."
```

**3 đặc điểm quan trọng của bcrypt:**

1. **Salt built-in:** Salt ngẫu nhiên embed trong hash → cùng "password123" cho ra hash khác nhau mỗi lần → rainbow table attack không hoạt động.

2. **Deliberately slow (cost factor = 10):** 2^10 = 1024 iterations → ~100ms per hash trên modern hardware. Attacker brute-force 10,000 passwords/second thay vì 10 tỷ. Cost factor có thể tăng khi hardware mạnh hơn.

3. **One-way:** Không thể reverse hash thành password. Chỉ có thể verify bằng bcrypt.compare():

```typescript
// Verify (không cần store salt riêng — nó đã trong hash string)
const isMatch = await bcrypt.compare("user_input_password", storedHash);
// bcrypt extract salt từ storedHash → rehash → compare
```

**Cost factor 10 — practical choice:**

```
Cost 10: ~100ms → Brute force: ~10/second → attack 1M passwords = 27 giờ
Cost 12: ~400ms → ~2.5/second → attack 1M passwords = 111 giờ
Cost 14: ~1.5s  → ~0.7/second → User wait 1.5s to login (quá chậm)
```

10 là sweet spot cho web apps.

---

## Q3. Passport.js trong NestJS hoạt động như thế nào? Guard là gì?

**Trả lời:**

Passport.js là authentication middleware với concept **strategies** — mỗi strategy xử lý một auth method:

- `passport-jwt` — JWT Bearer token
- `passport-local` — username/password
- `passport-google-oauth20` — Google OAuth

**NestJS wraps Passport với Guards:**

```
Request vào → Guard intercept → Strategy.validate() → req.user set → Controller
```

```typescript
// JwtAuthGuard
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 'jwt' tương ứng với JwtStrategy đã register

  // Có thể override canActivate để custom behavior:
  canActivate(context: ExecutionContext) {
    // Gọi Passport's AuthGuard logic
    return super.canActivate(context);
  }

  // Có thể override handleRequest để custom error:
  handleRequest(err, user, info) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user; // → req.user
  }
}
```

**Custom Guards (ví dụ RolesGuard cho RBAC):**

```typescript
// Decorator để mark route:
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Guard:
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true; // Không có @Roles() → public

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// Usage:
@Post('tests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')  // ← Chỉ admin mới được tạo test
createTest(@Body() dto: CreateTestDto, @Request() req) { ... }
```

Dự án hiện tại CÓ `JwtAuthGuard` nhưng chưa có `RolesGuard` ở Gateway level (Known Issue F-01).

---

## Q4. Google OAuth với Supabase — tại sao không dùng `passport-google-oauth20` trực tiếp?

**Trả lời:**

**Traditional Google OAuth (passport-google-oauth20):**

```typescript
// 1. User click "Login with Google"
// 2. Redirect: GET /auth/google
// 3. passport-google redirect → Google OAuth consent
// 4. Google redirect: GET /auth/google/callback?code=XXX
// 5. passport exchange code for tokens
// 6. Gọi Google API để lấy user info
// 7. Create/find user → sign JWT
```

Cần setup: Google Cloud Console, OAuth consent screen, production domain verification, handle token refresh...

**Supabase approach (dự án hiện tại):**

```typescript
// Supabase xử lý toàn bộ Google OAuth complexity
// Frontend chỉ cần:
const { data } = await supabase.auth.signInWithOAuth({ provider: 'google' });
// Supabase redirect → Google → Supabase callback → cấp Supabase session

// Sau đó frontend gửi Supabase token lên backend:
POST /auth/google
{ accessToken: "<supabase-access-token>" }

// Backend verify với Supabase:
const { data: { user } } = await supabase.auth.getUser(accessToken);
// { id: 'supabase-uuid', email: 'user@gmail.com', ... }
```

**Ưu điểm Supabase approach:**

- Không cần setup Google Cloud Console (Supabase đã làm)
- Supabase handle refresh tokens, session management
- Dễ thêm providers khác (GitHub, Facebook) không cần thay đổi backend

**Nhược điểm:**

- Phụ thuộc vào Supabase service availability
- Nếu migrate khỏi Supabase → phải implement lại OAuth
- Double verification: Supabase verify Google, backend verify Supabase

---

## Q5. Tại sao JWT secret phải giống nhau trên tất cả services?

**Trả lời:**

```
User login → auth-service sign JWT với JWT_SECRET
                     ↓
User gọi /api/tests → api-gateway proxy → test-service
                                                ↓
                     test-service verify JWT với JWT_SECRET (phải GIỐNG NHAU)
```

JWT signature là HMAC-SHA256 của `header.payload` với secret key. Nếu secret khác nhau:

```
auth-service sign với "secret-A" → signature X
test-service verify với "secret-B" → signature Y ≠ X → FAIL (401)
```

**Config trong dự án:**

Mỗi service có `.env` file riêng. Phải đảm bảo:
```env
# apps/auth-service/.env
JWT_SECRET=my-super-secret-key-change-in-production

# apps/test-service/.env
JWT_SECRET=my-super-secret-key-change-in-production  ← PHẢI GIỐNG

# apps/submission-service/.env
JWT_SECRET=my-super-secret-key-change-in-production  ← PHẢI GIỐNG
```

**Giải pháp tốt hơn (production):** Dùng Vault (HashiCorp) hoặc AWS Secrets Manager để inject secret vào tất cả services từ một source, tránh copy-paste error.

**Rotate JWT secret:**

Nếu secret bị lộ → phải rotate. Khi rotate:
1. Update secret ở tất cả services đồng thời
2. Tất cả existing JWT tokens bị invalidate (users phải login lại)
3. Không có built-in grace period

Giải pháp advanced: Support nhiều secrets (current + old) trong thời gian ngắn.

---

## Q6. Password validation rules trong RegisterDto. Tại sao cần strict rules?

**Trả lời:**

```typescript
// apps/auth-service/src/auth/dto/register.dto.ts
export class RegisterLearnerDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    { message: 'Password must contain uppercase, lowercase, number, and special character' }
  )
  password: string;

  @IsString()
  confirmPassword: string;

  @ValidateIf(o => o.password !== o.confirmPassword)
  @IsEmpty({ message: 'Passwords must match' })
  passwordsMustMatch?: never;  // Trick để validate relationship giữa 2 fields
}
```

**Regex breakdown:**

```
^                    Start
(?=.*[a-z])          Lookahead: ít nhất 1 lowercase
(?=.*[A-Z])          Lookahead: ít nhất 1 uppercase
(?=.*\d)             Lookahead: ít nhất 1 digit
(?=.*[@$!%*?&])      Lookahead: ít nhất 1 special char
[A-Za-z\d@$!%*?&]{8,}  Chỉ cho phép các ký tự này, min 8
$                    End
```

**Tại sao cần rules:**

1. **Min 8 chars:** Brute force 7-char passwords với bcrypt cost 10 mất vài giờ. 8+ chars → days/weeks.
2. **Mixed case + digit + special:** Password entropy tăng đáng kể:
   - Chỉ lowercase 8 chars: 26^8 = 208 tỷ combinations
   - Mixed case + digit + special: 70^8 = 576 nghìn tỷ combinations

**Thực tế:** NIST 2024 guidelines không còn khuyến nghị complexity rules mạnh (vì users dùng "P@ssw0rd!" predictable patterns). NIST khuyến nghị **passphrase** (dài, dễ nhớ). Nhưng đây là dự án học thuật — rules trên OK.

---

## Q7. Nếu JWT bị stolen, attacker có thể làm gì? Cách mitigate?

**Trả lời:**

JWT là **stateless** — server không lưu trạng thái token. Nếu attacker có JWT hợp lệ:

1. Gọi bất kỳ API nào với token đó (đến khi hết hạn)
2. Không có cách revoke từ server (trừ rotate secret → invalidate tất cả)

**Các mitigation strategies:**

**1. Short expiry time:**
```
JWT_EXPIRES_IN=15m  ← Token hết hạn sau 15 phút
```
Kết hợp với **Refresh Token** (long-lived, stored HttpOnly, dùng để lấy token mới).

Dự án hiện tại: `JWT_EXPIRES_IN=24h` — khá dài, single token approach (không có refresh token).

**2. HttpOnly cookies (đã đề cập):**
Token không accessible qua JavaScript → XSS không steal được.

**3. Token binding:**
Bind token với client fingerprint (IP, User-Agent). Nếu IP thay đổi → reject. (Phức tạp, false positives với mobile users)

**4. Denylist (blacklist) trên Redis:**
```typescript
// Khi logout hoặc phát hiện compromise:
await redis.set(`blacklist:${token}`, '1', 'EX', remainingTTL);

// Trong JwtStrategy.validate():
const isBlacklisted = await redis.get(`blacklist:${token}`);
if (isBlacklisted) throw new UnauthorizedException('Token revoked');
```

Trade-off: Mất tính "stateless" của JWT → cần Redis, thêm latency mỗi request.

**5. Audience và Issuer claims:**
```typescript
this.jwtService.sign(payload, {
  audience: 'ielts-platform',   // Chỉ accept tokens intended for this app
  issuer: 'auth-service',       // Biết ai issued token
});
```

**Trong dự án hiện tại:**

Single long-lived (24h) token, không có refresh, không có revocation. Phù hợp cho dự án học thuật nhưng cần cải thiện trước production deployment.
