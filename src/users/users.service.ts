import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { orderByFrom, paginate } from '../common/pagination';
import { comparePassword, hashPassword } from '../common/password';
import { USER_PUBLIC_SELECT, USER_SELECT } from './user.select';
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateMeDto,
  UpdateUserDto,
  UsersQueryDto,
} from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: UsersQueryDto, viewer: AuthUser) {
    const where: Prisma.usersWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q } },
          { username: { contains: query.q } },
          { email: { contains: query.q } },
        ],
      }),
    };
    const select = viewer.role === 'ADMIN' ? USER_SELECT : USER_PUBLIC_SELECT;
    return paginate(
      query,
      () => this.prisma.users.count({ where }),
      (page) =>
        this.prisma.users.findMany({
          where,
          select,
          ...page,
          orderBy: orderByFrom(
            query,
            ['name', 'username', 'role', 'created_at', 'last_login_at'],
            { name: 'asc' },
          ),
        }),
    );
  }

  async findById(id: number, viewer?: AuthUser) {
    const full = !viewer || viewer.role === 'ADMIN' || viewer.user_id === id;
    const user = await this.prisma.users.findUnique({
      where: { user_id: id },
      select: full ? USER_SELECT : USER_PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async create(dto: CreateUserDto) {
    await this.ensureUnique(dto.username, dto.email);
    const user = await this.prisma.users.create({
      data: { ...dto, password: await hashPassword(dto.password) },
      select: USER_SELECT,
    });
    await this.audit.log({
      action: 'USER_CREATE',
      entity: 'users',
      entity_id: user.user_id,
      meta: { role: user.role },
    });
    return user;
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthUser) {
    const current = await this.findById(id);
    await this.ensureUnique(dto.username, dto.email, id);

    const losesAdmin =
      current.role === 'ADMIN' &&
      current.active &&
      ((dto.role && dto.role !== 'ADMIN') || dto.active === false);
    if (losesAdmin) {
      if (id === actor.user_id) {
        throw new BadRequestException(
          'Você não pode remover seu próprio acesso de administrador.',
        );
      }
      await this.ensureNotLastAdmin(id);
    }

    const { password, ...rest } = dto;
    const user = await this.prisma.users.update({
      where: { user_id: id },
      data: {
        ...rest,
        ...(password && {
          password: await hashPassword(password),
          failed_attempts: 0,
          locked_until: null,
        }),
      },
      select: USER_SELECT,
    });
    if (
      password ||
      dto.active === false ||
      (dto.role && dto.role !== current.role)
    ) {
      await this.revokeSessions(id);
    }
    await this.audit.log({
      action: 'USER_UPDATE',
      entity: 'users',
      entity_id: id,
      meta: {
        fields: Object.keys(dto).map((k) =>
          k === 'password' ? 'password(alterada)' : k,
        ),
      },
    });
    return user;
  }

  async deactivate(id: number, actor: AuthUser) {
    if (id === actor.user_id)
      throw new BadRequestException('Você não pode desativar a si mesmo.');
    const current = await this.findById(id);
    if (current.role === 'ADMIN' && current.active)
      await this.ensureNotLastAdmin(id);
    await this.prisma.users.update({
      where: { user_id: id },
      data: { active: false },
    });
    await this.revokeSessions(id);
    await this.audit.log({
      action: 'USER_DEACTIVATE',
      entity: 'users',
      entity_id: id,
    });
  }

  async updateMe(actor: AuthUser, dto: UpdateMeDto) {
    await this.ensureUnique(dto.username, dto.email, actor.user_id);
    const user = await this.prisma.users.update({
      where: { user_id: actor.user_id },
      data: dto,
      select: USER_SELECT,
    });
    await this.audit.log({
      action: 'PROFILE_UPDATE',
      entity: 'users',
      entity_id: actor.user_id,
      meta: { fields: Object.keys(dto) },
    });
    return user;
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: actor.user_id },
    });
    if (
      !user ||
      !(await comparePassword(dto.current_password, user.password))
    ) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    if (dto.current_password === dto.new_password) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da atual.',
      );
    }
    await this.prisma.users.update({
      where: { user_id: actor.user_id },
      data: { password: await hashPassword(dto.new_password) },
    });
    await this.revokeSessions(actor.user_id, actor.session_id);
    await this.audit.log({
      action: 'PASSWORD_CHANGE',
      entity: 'users',
      entity_id: actor.user_id,
    });
  }

  private async revokeSessions(
    userId: number,
    exceptSessionId?: number | null,
  ) {
    await this.prisma.sessions.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
        ...(exceptSessionId && { NOT: { session_id: exceptSessionId } }),
      },
      data: { revoked_at: new Date() },
    });
  }

  private async ensureNotLastAdmin(exceptId: number) {
    const admins = await this.prisma.users.count({
      where: { role: 'ADMIN', active: true, NOT: { user_id: exceptId } },
    });
    if (admins === 0)
      throw new BadRequestException(
        'Deve existir ao menos um administrador ativo.',
      );
  }

  private async ensureUnique(
    username?: string,
    email?: string,
    exceptId?: number,
  ) {
    if (!username && !email) return;
    const existing = await this.prisma.users.findFirst({
      where: {
        OR: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email }] : []),
        ],
        ...(exceptId && { NOT: { user_id: exceptId } }),
      },
      select: { username: true, email: true },
    });
    if (!existing) return;
    throw new ConflictException(
      existing.username === username
        ? 'Este nome de usuário já está em uso.'
        : 'Este e-mail já está em uso.',
    );
  }
}
