import { PrismaService } from 'src/database/prisma.service';
import {
  ClientRepositoryModel,
  CreateClientProperties,
  UpdateClientType,
} from './interfaces/interface';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { hash, compare } from 'bcryptjs';
@Injectable()
export class ClientService implements ClientRepositoryModel {
  constructor(private prisma: PrismaService) {}

  async createClient(
    createDTO: CreateClientProperties,
    id: number,
  ): Promise<void | object> {
    try {
      const user = await this.prisma.clients.create({
        data: { ...createDTO, created: { connect: { user_id: id } } },
      });
      return user;
    } catch (err) {
      console.error(err);
      return { err };
    }
  }

  async queryClients(query?: string) {
    let queryObject = {};

    if (query) {
      queryObject = {
        where: {
          OR: [
            { name: { contains: query } },
            { cpf: { contains: query } },
            { email: { contains: query } },
          ],
        },
        select: {
          name: true,
          email: true,
          created_at: true,
          district: true,
        },
      };
    } else {
      queryObject = {
        select: {
          name: true,
          email: true,
          created_at: true,
          district: true,
        },
        take: 20,
        orderBy: { created_at: 'asc' },
      };
    }

    const members = await this.prisma.clients.findMany(queryObject);
    return members; // array or members found in query
  }

  async updateClient(updateData: UpdateClientType, id: number) {
    try {
      return await this.prisma.clients.update({
        where: { client_id: id },
        data: updateData,
      });
    } catch (e) {
      throw new InternalServerErrorException(e);
    }
  }

  async findByCpf(cpf: string): Promise<void | object> {
    const clientByCPF = await this.prisma.clients.findFirst({
      where: { cpf },
      select: {
        cpf: true,
        name: true,
        email: true,
        created_at: true,
      },
    });
    return clientByCPF;
  }
  async findByEmail(email: string) {
    const clientByEmail = await this.prisma.clients.findFirst({
      where: { email },
      select: {
        cpf: true,
        name: true,
        email: true,
        created_at: true,
      },
    });
    return clientByEmail;
  }
  async verifyPassword(userPassword: string, userId: number): Promise<boolean> {
    const userFetch = await this.prisma.users.findFirst({
      where: {
        user_id: userId,
      },
      select: {
        password: true,
      },
    });
    return await compare(userPassword, userFetch.password);
  }
  async deletion(id: number) {
    try {
      const responseDeletionClient = await this.prisma.clients.delete({
        where: { client_id: id },
      });
      return {
        message: 'Cliente deletado com sucesso',
        client: responseDeletionClient,
      };
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
}
