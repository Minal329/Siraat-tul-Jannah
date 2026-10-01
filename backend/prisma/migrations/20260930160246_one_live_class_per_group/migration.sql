-- Only one class per class group can be LIVE at a time. Prisma can't describe a
-- partial unique index in schema.prisma, so it is written by hand here (like
-- enrollments_one_active_per_student_course in the init migration).
CREATE UNIQUE INDEX "class_sessions_one_live_per_group" ON "class_sessions"("class_group_id") WHERE "status" = 'LIVE';
