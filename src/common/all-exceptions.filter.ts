import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

const PRISMA_ERRORS: Record<string, [number, string, string]> = {
  P2002: [
    HttpStatus.CONFLICT,
    'Já existe um registro com estes dados.',
    'Conflict',
  ],
  P2003: [
    HttpStatus.CONFLICT,
    'Registro vinculado a outros dados.',
    'Conflict',
  ],
  P2025: [HttpStatus.NOT_FOUND, 'Registro não encontrado.', 'Not Found'],
};

// Converte erros conhecidos do Prisma em respostas HTTP e garante que erros
// inesperados nunca vazem stack/SQL para o cliente.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, message: string, error: string) =>
      res.status(status).json({ statusCode: status, message, error });

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) this.logger.error(exception.stack);
      res
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      PRISMA_ERRORS[exception.code]
    ) {
      return send(...PRISMA_ERRORS[exception.code]);
    }

    // Erros do body-parser/multer chegam como objetos com status.
    const err = exception as { status?: number; type?: string; code?: string };
    if (err?.status === 413 || err?.code === 'LIMIT_FILE_SIZE') {
      return send(413, 'Conteúdo muito grande.', 'Payload Too Large');
    }
    if (err?.type === 'entity.parse.failed') {
      return send(400, 'JSON inválido.', 'Bad Request');
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    send(500, 'Erro interno do servidor.', 'Internal Server Error');
  }
}
