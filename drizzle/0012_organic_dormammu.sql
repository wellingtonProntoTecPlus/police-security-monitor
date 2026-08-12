ALTER TABLE `alarm_events` ADD `autoFinalized` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_events` ADD `autoFinalizationReason` varchar(255);