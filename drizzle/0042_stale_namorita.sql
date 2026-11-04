CREATE TABLE `operator_attendance_records` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`authSessionId` bigint NOT NULL,
	`userId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`role` varchar(30) NOT NULL,
	`loginMethod` varchar(64),
	`loginAt` timestamp NOT NULL DEFAULT (now()),
	`logoutAt` timestamp,
	`logoutReason` enum('logout','session_replaced','session_expired','revoked'),
	`shiftCode` enum('first','second','third'),
	`workDate` varchar(10),
	`scheduledStartAt` timestamp,
	`scheduledEndAt` timestamp,
	CONSTRAINT `operator_attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `operator_attendance_records_authSessionId_unique` UNIQUE(`authSessionId`)
);
--> statement-breakpoint
CREATE TABLE `operator_shift_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`shiftCode` enum('first','second','third') NOT NULL,
	`cycleAnchorDate` varchar(10) NOT NULL,
	`effectiveFromDate` varchar(10) NOT NULL,
	`effectiveUntilDate` varchar(10),
	`changeReason` varchar(500),
	`changedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_shift_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_shift_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`workDate` varchar(10) NOT NULL,
	`kind` enum('work','off') NOT NULL,
	`shiftCode` enum('first','second','third'),
	`pairedUserId` int,
	`pairedOperatorName` varchar(255),
	`reason` varchar(500) NOT NULL,
	`createdBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`cancelledAt` timestamp,
	`cancelledBy` int,
	CONSTRAINT `operator_shift_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_shift_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`fromUserId` int NOT NULL,
	`fromOperatorName` varchar(255) NOT NULL,
	`fromAttendanceId` bigint NOT NULL,
	`toUserId` int NOT NULL,
	`toOperatorName` varchar(255) NOT NULL,
	`incidentId` int,
	`account` varchar(20),
	`message` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_shift_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_shift_reminders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`attendanceId` bigint NOT NULL,
	`userId` int NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`shiftCode` enum('first','second','third') NOT NULL,
	`workDate` varchar(10) NOT NULL,
	`minutesBefore` int NOT NULL,
	`shiftEndsAt` timestamp NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`acknowledgedAt` timestamp,
	CONSTRAINT `operator_shift_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `operator_shift_reminder_unique` UNIQUE(`attendanceId`,`workDate`,`shiftCode`,`minutesBefore`)
);
--> statement-breakpoint
CREATE INDEX `operator_attendance_user_login_idx` ON `operator_attendance_records` (`userId`,`loginAt`);--> statement-breakpoint
CREATE INDEX `operator_attendance_open_idx` ON `operator_attendance_records` (`logoutAt`,`userId`);--> statement-breakpoint
CREATE INDEX `operator_shift_assignments_user_effective_idx` ON `operator_shift_assignments` (`userId`,`effectiveFromDate`,`effectiveUntilDate`);--> statement-breakpoint
CREATE INDEX `operator_shift_exceptions_user_date_active_idx` ON `operator_shift_exceptions` (`userId`,`workDate`,`isActive`);--> statement-breakpoint
CREATE INDEX `operator_shift_message_inbox_idx` ON `operator_shift_messages` (`toUserId`,`readAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operator_shift_message_incident_idx` ON `operator_shift_messages` (`incidentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operator_shift_reminder_pending_idx` ON `operator_shift_reminders` (`userId`,`acknowledgedAt`,`sentAt`);