import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUST'
  | 'ORDER_OUT'
  | 'ORDER_IN';

/**
 * Aplica `delta` ao estoque do produto e registra o movimento.
 * O incremento é atômico; se o saldo ficar negativo numa saída, a transação é abortada.
 */
export async function moveStock(
  tx: Prisma.TransactionClient,
  args: {
    product_id: number;
    delta: number;
    type: StockMovementType;
    reason?: string | null;
    order_id?: number | null;
    user_id?: number | null;
  },
) {
  if (args.delta === 0) return null;
  const product = await tx.products.update({
    where: { product_id: args.product_id },
    data: { stock: { increment: args.delta } },
    select: { product_id: true, name: true, stock: true },
  });
  if (args.delta < 0 && product.stock < 0) {
    throw new BadRequestException(
      `Estoque insuficiente para "${product.name}" (disponível: ${product.stock - args.delta}).`,
    );
  }
  await tx.stock_movements.create({
    data: {
      product_id: args.product_id,
      type: args.type,
      quantity: args.delta,
      balance: product.stock,
      reason: args.reason ?? null,
      order_id: args.order_id ?? null,
      user_id: args.user_id ?? null,
    },
  });
  return product;
}
