import { IsNotEmpty } from 'class-validator';
import { PrismaService } from 'src/database/prisma.service';

function defaultValue(valueFromInstantiate: string) {
  return function (target: object, propertyKey: string | symbol) {
    let value: string;
    const setter = () => {
      console.log(value);
      if (!value) value = valueFromInstantiate;
    };
    const getter = () => {
      return value;
    };
    Object.defineProperty(target, propertyKey, {
      set: setter,
      get: getter,
    });
  };
}

export interface Tags {
  slug : string
}


export class OrderDTO {
  @IsNotEmpty()
  device: string;
  @IsNotEmpty()
  description: string;
  tags: Tags [];
  @defaultValue('PENDING')
  status: string;
  @IsNotEmpty({
    message:
      'O id precisa ser passsado para linkar um cliente a ordem de servico',
  })
  owner_id: number;
}
//in frontend has an special section that links one client id to an order
export type Order = OrderDTO & {
  order_id: number;
  arrived_at: Date;
  created_by_id: number;
};
const prisma = new PrismaService()
export type OrderReturn = ReturnType<typeof prisma.orders.create>
