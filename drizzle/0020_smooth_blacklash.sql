ALTER TABLE `alarm_systems` ADD `keepAliveMonitoringEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `keepAliveOfflineAfterMinutes` int NOT NULL DEFAULT 60;
