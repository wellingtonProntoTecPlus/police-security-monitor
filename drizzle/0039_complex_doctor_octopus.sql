CREATE TABLE `auth_sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `incident_history` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`incidentId` int NOT NULL,
	`parentIncidentId` int,
	`operatorId` int,
	`operatorName` varchar(255) NOT NULL,
	`action` varchar(40) NOT NULL,
	`statusBefore` varchar(24),
	`statusAfter` varchar(24),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incident_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `incidents` DROP INDEX `incidents_event_id_unique`;--> statement-breakpoint
ALTER TABLE `alarm_schedule_overrides` ADD `validFromAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_schedule_overrides` ADD `validUntilAt` timestamp;--> statement-breakpoint
ALTER TABLE `incidents` ADD `parentIncidentId` int;--> statement-breakpoint
ALTER TABLE `incidents` ADD `version` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `claimedAt` timestamp;--> statement-breakpoint
ALTER TABLE `occurrences` ADD `incidentId` int;--> statement-breakpoint
CREATE INDEX `auth_sessions_user_active_idx` ON `auth_sessions` (`userId`,`revokedAt`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `incident_history_incident_created_idx` ON `incident_history` (`incidentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `incidents_event_id_idx` ON `incidents` (`eventId`);--> statement-breakpoint
CREATE INDEX `incidents_parent_status_idx` ON `incidents` (`parentIncidentId`,`status`);