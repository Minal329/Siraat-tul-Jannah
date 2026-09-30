// GET   /api/v1/payment-accounts            — any logged-in user: active accounts only
// GET   /api/v1/admin/payment-accounts      — admins: all, including inactive
// POST  /api/v1/admin/payment-accounts      — admins: add an account
// PATCH /api/v1/admin/payment-accounts/:id  — admins: edit, or { "isActive": false } to hide
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createAccountSchema, updateAccountSchema } from "./paymentAccounts.schemas.ts";
import * as accountsService from "./paymentAccounts.service.ts";

export const paymentAccountsRouter = Router();
paymentAccountsRouter.use(requireAuth);

paymentAccountsRouter.get("/", async (_req, res) => {
  res.json({ data: await accountsService.listActiveAccounts() });
});

export const adminPaymentAccountsRouter = Router();
adminPaymentAccountsRouter.use(requireAuth, requireRole("ADMIN"));

adminPaymentAccountsRouter.get("/", async (_req, res) => {
  res.json({ data: await accountsService.listAllAccounts() });
});

adminPaymentAccountsRouter.post("/", async (req, res) => {
  const input = createAccountSchema.parse(req.body);
  res.status(201).json({ data: await accountsService.createAccount(req.auth!.userId, input) });
});

adminPaymentAccountsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Payment account");
  const changes = updateAccountSchema.parse(req.body);
  res.json({ data: await accountsService.updateAccount(req.auth!.userId, id, changes) });
});
