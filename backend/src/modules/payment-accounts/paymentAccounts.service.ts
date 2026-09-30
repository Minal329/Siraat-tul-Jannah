// The academy's Easypaisa / JazzCash / bank accounts that students send fees to.
// Admins edit them from the dashboard, so a new number never needs a code change.
// Accounts are deactivated, never deleted, so old payments still show where they went.
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { getAdminId } from "../users/users.service.ts";
import type { CreateAccountInput, UpdateAccountInput } from "./paymentAccounts.schemas.ts";

type AccountRow = Prisma.PaymentAccountGetPayload<object>;

function toPublicAccount(account: AccountRow) {
  return {
    id: account.id,
    method: account.method,
    accountTitle: account.accountTitle,
    accountNumber: account.accountNumber,
    instructions: account.instructions,
  };
}

function toAdminAccount(account: AccountRow) {
  return { ...toPublicAccount(account), isActive: account.isActive, updatedAt: account.updatedAt };
}

export async function listActiveAccounts() {
  const accounts = await prisma.paymentAccount.findMany({ where: { isActive: true }, orderBy: { method: "asc" } });
  return { accounts: accounts.map(toPublicAccount) };
}

export async function listAllAccounts() {
  const accounts = await prisma.paymentAccount.findMany({ orderBy: [{ isActive: "desc" }, { method: "asc" }] });
  return { accounts: accounts.map(toAdminAccount) };
}

export async function createAccount(userId: string, input: CreateAccountInput) {
  const account = await prisma.paymentAccount.create({ data: { ...input, updatedById: await getAdminId(userId) } });
  return { account: toAdminAccount(account) };
}

export async function updateAccount(userId: string, id: string, changes: UpdateAccountInput) {
  try {
    const account = await prisma.paymentAccount.update({
      where: { id },
      data: { ...changes, updatedById: await getAdminId(userId) },
    });
    return { account: toAdminAccount(account) };
  } catch (err) {
    // P2025 = the row to update doesn't exist.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError(404, "NOT_FOUND", "Payment account not found.");
    }
    throw err;
  }
}
