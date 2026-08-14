CREATE TABLE `system_keep_alive_samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`brand` varchar(30) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`intervalMs` int,
	CONSTRAINT `system_keep_alive_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `lastKeepAliveAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `lastKeepAliveIntervalMs` int;