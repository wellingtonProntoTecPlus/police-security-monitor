CREATE TABLE `system_disconnect_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`outageStartedAt` timestamp NOT NULL,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`eventId` int,
	`incidentId` int,
	`restoredAt` timestamp,
	`restoredKeepAliveAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_disconnect_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_disconnect_alerts_system_outage_unique` UNIQUE(`alarmSystemId`,`outageStartedAt`)
);
