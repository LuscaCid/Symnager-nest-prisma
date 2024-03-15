import { Injectable, Module } from "@nestjs/common";
import { SessionController } from "./Session.controller";
import { SessionService } from "./Session.service";
import { PrismaService } from "src/database/prisma.service";

@Module({
  providers: [SessionService],
  controllers: [SessionController],
})
export class SessionModule {}