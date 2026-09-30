// POST /api/v1/teacher/feedback        — teachers: JSON { enrollmentId, text } for a written note,
//                                         or a form with enrollmentId, optional text, durationSeconds
//                                         and an audio file in the field "voice"
// GET  /api/v1/teacher/feedback        — teachers: feedback I've sent (?enrollmentId=… to filter)
// GET  /api/v1/feedback/mine           — students: my feedback, newest first, with unread count
// POST /api/v1/feedback/:id/read       — students: mark as read
// GET  /api/v1/feedback/:id/voice      — play a voice note (student, its teacher, or an admin)
import { Router } from "express";
import { audioUpload, requireAudio } from "../../middleware/upload.ts";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { sendFeedbackSchema, teacherFeedbackQuery } from "./feedback.schemas.ts";
import * as feedbackService from "./feedback.service.ts";

export const teacherFeedbackRouter = Router();
teacherFeedbackRouter.use(requireAuth, requireRole("TEACHER"));

teacherFeedbackRouter.post("/", audioUpload("voice"), async (req, res) => {
  const input = sendFeedbackSchema.parse(req.body ?? {});
  const voice = req.file ? requireAudio(req.file) : undefined;
  res.status(201).json({ data: await feedbackService.sendFeedback(req.auth!, input, voice) });
});

teacherFeedbackRouter.get("/", async (req, res) => {
  const { enrollmentId } = teacherFeedbackQuery.parse(req.query);
  res.json({ data: await feedbackService.listSentFeedback(req.auth!, enrollmentId) });
});

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

feedbackRouter.get("/mine", requireRole("STUDENT"), async (req, res) => {
  res.json({ data: await feedbackService.listMyFeedback(req.auth!.userId) });
});

feedbackRouter.post("/:id/read", requireRole("STUDENT"), async (req, res) => {
  const id = parseId(req.params.id, "Feedback");
  res.json({ data: await feedbackService.markRead(req.auth!.userId, id) });
});

feedbackRouter.get("/:id/voice", async (req, res) => {
  const id = parseId(req.params.id, "Feedback");
  const file = await feedbackService.findVoiceFile(req.auth!, id);
  res.set("Cache-Control", "private, no-store");
  // sendFile supports "Range" requests, which phone audio players need to seek.
  res.type(file.contentType).sendFile(file.fullPath);
});
