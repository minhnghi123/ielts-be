# Auth Service

**Port:** 5001  
**Prefix:** `/auth`  
**Swagger:** http://localhost:5001/api/docs

Handles account registration, email/password login, Google OAuth, JWT signing, and profile management.

---

## Entities

### Account (`accounts` table)

```typescript
@Entity('accounts')
class Account {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ nullable: true }) password: string;      // bcrypt hash; null for OAuth
  @Column({ default: 'active' }) status: string;
  @Column({ name: 'full_name', nullable: true }) fullName: string;
  @Column({ name: 'avatar_url', nullable: true }) avatarUrl: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @OneToOne(() => LearnerProfile) learnerProfile: LearnerProfile;
  @OneToOne(() => AdminProfile) adminProfile: AdminProfile;
}
```

### LearnerProfile (`learner_profiles` table)

```typescript
@Entity('learner_profiles')
class LearnerProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'account_id' }) accountId: string;
  @Column({ name: 'current_level', default: 'beginner' }) currentLevel: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToOne(() => Account) account: Account;
}
```

### AdminProfile (`admin_profiles` table)

```typescript
@Entity('admin_profiles')
class AdminProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'account_id' }) accountId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToOne(() => Account) account: Account;
}
```

---

## DTOs

### RegisterLearnerDto

```typescript
{
  email: string;          // @IsEmail()
  password: string;       // 8–32 chars, must contain uppercase, lowercase, number, special char
  confirmPassword: string; // Must match password
}
```

### LoginDto

```typescript
{
  email: string;     // @IsEmail()
  password: string;  // @IsNotEmpty()
}
```

### UpdateProfileDto

```typescript
{
  fullName?: string;
  avatarUrl?: string;
}
```

---

## Endpoints

### POST `/auth/register`

Register a new learner account.

**Auth:** None  
**Request body:** `RegisterLearnerDto`

**Logic:**
1. Check email uniqueness
2. Hash password with bcrypt (10 rounds)
3. Create `Account` record
4. Create `LearnerProfile` record (linked to account)

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "status": "active",
  "createdAt": "2025-01-15T10:00:00.000Z"
}
```

**Error cases:**
- 409: Email already exists
- 400: Password validation failure

---

### POST `/auth/login`

Authenticate with email and password.

**Auth:** None  
**Request body:** `LoginDto`

**Logic:**
1. Find account by email
2. Verify password with bcrypt.compare
3. Load learner/admin profile to determine role and profileId
4. Sign JWT with payload: `{ sub: account.id, email, role, profileId }`

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "account-uuid",
    "email": "user@example.com",
    "role": "learner",
    "profileId": "learner-profile-uuid",
    "fullName": "John Doe",
    "avatarUrl": null
  }
}
```

**Error cases:**
- 401: Invalid email or password

---

### POST `/auth/google`

Exchange a Supabase Google OAuth access token for a platform JWT.

**Auth:** None  
**Request body:**
```json
{ "accessToken": "<supabase-google-token>" }
```

**Logic:**
1. Verify the Supabase token with Supabase client
2. Extract email from Supabase user
3. Find or create `Account` (no password) + `LearnerProfile`
4. Sign and return platform JWT

**Response:** Same shape as `/auth/login`

---

### GET `/auth/profile`

Get the current user's full profile.

**Auth:** Bearer JWT (`JwtAuthGuard`)  
**Request body:** None

**Response:**
```json
{
  "account": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "avatarUrl": "https://...",
    "status": "active"
  },
  "profile": {
    "id": "learner-profile-uuid",
    "currentLevel": "intermediate"
  },
  "role": "learner"
}
```

---

### PUT `/auth/profile`

Update the authenticated user's display name or avatar URL.

**Auth:** Bearer JWT (`JwtAuthGuard`)  
**Request body:** `UpdateProfileDto`

```json
{
  "fullName": "Jane Doe",
  "avatarUrl": "https://cloudinary.com/..."
}
```

**Response:** Updated `Account` object

---

### GET `/auth/users`

Get a paginated list of all user accounts (admin use).

**Auth:** None (currently — backend guard not yet enforced at gateway)  
**Query params:**
- `page` (default: 1)
- `limit` (default: 20)
- `search` (optional — searches email and fullName)

**Response:**
```json
{
  "data": [ /* Account[] */ ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

## JWT Strategy

**Algorithm:** HS256  
**Secret:** `JWT_SECRET` env var (must match across all services)  
**Payload:**
```typescript
{
  sub: string;       // account.id
  email: string;
  role: 'learner' | 'admin';
  profileId: string; // learner_profiles.id or admin_profiles.id
  iat: number;
  exp: number;
}
```

**Guard:** `JwtAuthGuard` (extends `AuthGuard('jwt')`) — attach with `@UseGuards(JwtAuthGuard)` on any protected endpoint.

**Extracting the user in a controller:**
```typescript
@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile(@Request() req) {
  const userId = req.user.sub;  // account.id
  const role = req.user.role;
  const profileId = req.user.profileId;
}
```
