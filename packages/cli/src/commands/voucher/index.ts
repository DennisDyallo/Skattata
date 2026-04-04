import type { Command } from 'commander';
import { register as registerAdd } from './add.js';
import { register as registerSale } from './sale.js';
import { register as registerExpense } from './expense.js';
import { register as registerTransfer } from './transfer.js';
import { register as registerOwner } from './owner.js';
import { register as registerList } from './list.js';
import { register as registerReverse } from './reverse.js';

export function register(program: Command): void {
  const voucher = program
    .command('voucher')
    .description('Add and list vouchers (transactions)');

  registerAdd(voucher);
  registerSale(voucher);
  registerExpense(voucher);
  registerTransfer(voucher);
  registerOwner(voucher);
  registerList(voucher);
  registerReverse(voucher);
}
