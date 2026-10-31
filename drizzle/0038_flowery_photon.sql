CREATE TABLE `alarm_schedule_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`scheduleId` int,
	`sourceEventId` int,
	`alertType` enum('missed_arm','unexpected_disarm') NOT NULL,
	`dedupeKey` varchar(191) NOT NULL,
	`alertDate` varchar(10) NOT NULL,
	`expectedAt` timestamp,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`currentState` varchar(20),
	`status` enum('active','acknowledged','resolved') NOT NULL DEFAULT 'active',
	`acknowledgedBy` int,
	`acknowledgedAt` timestamp,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alarm_schedule_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `alarm_schedule_alerts_dedupeKey_unique` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `alarm_schedule_override_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`overrideId` int,
	`alarmSystemId` int NOT NULL,
	`overrideDate` varchar(10) NOT NULL,
	`action` enum('created','updated','cancelled') NOT NULL,
	`operatorId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`requester` varchar(255) NOT NULL,
	`reason` text NOT NULL,
	`previousSettings` text,
	`newSettings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_schedule_override_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alarm_schedule_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`overrideDate` varchar(10) NOT NULL,
	`mode` enum('suspended','override') NOT NULL,
	`armAt` varchar(5),
	`disarmAt` varchar(5),
	`requester` varchar(255) NOT NULL,
	`reason` text NOT NULL,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alarm_schedule_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `alarm_schedule_overrides_system_date_unique` UNIQUE(`alarmSystemId`,`overrideDate`)
);
--> statement-breakpoint
ALTER TABLE `alarm_schedules` ADD `holidayArm` varchar(5);--> statement-breakpoint
ALTER TABLE `alarm_schedules` ADD `holidayDisarm` varchar(5);