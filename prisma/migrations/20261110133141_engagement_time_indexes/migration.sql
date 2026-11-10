-- CreateIndex
CREATE INDEX "EngagementEvent_type_createdAt_idx" ON "EngagementEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementEvent_createdAt_idx" ON "EngagementEvent"("createdAt");
