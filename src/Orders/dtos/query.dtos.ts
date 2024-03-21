import { Request } from 'express';

export interface QueryDTO extends Request {
  q: string;
}
