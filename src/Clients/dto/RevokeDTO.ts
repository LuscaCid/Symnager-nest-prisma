import { Request } from 'express';
import { UserInsideToken } from '../interfaces/token';

export interface RevokeDTO extends Request {
  user: UserInsideToken;
  body: {
    tryPassword: string;
    clientDeletedId: number;
  };
}
