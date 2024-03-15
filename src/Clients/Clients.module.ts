import { Injectable, Module } from "@nestjs/common";
import { ClientService } from "./Client.service";
import { PrismaService } from "src/database/prisma.service";
import { ClientsControllers } from "./Client.contoller";
@Module(
  {
    controllers : [ClientsControllers],
    providers : [ClientService]
  }
)
export class ClientModule {}