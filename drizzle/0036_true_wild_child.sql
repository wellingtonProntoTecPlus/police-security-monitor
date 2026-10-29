ALTER TABLE `alarm_systems` MODIFY COLUMN `lastKeepAliveIntervalMs` bigint;--> statement-breakpoint
ALTER TABLE `system_keep_alive_samples` MODIFY COLUMN `intervalMs` bigint;