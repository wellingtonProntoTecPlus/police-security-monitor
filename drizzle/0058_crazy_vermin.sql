CREATE TABLE `operator_message_group_audit` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`groupId` bigint NOT NULL,
	`actorUserId` int NOT NULL,
	`action` enum('created','renamed','member_added','member_removed','deactivated') NOT NULL,
	`subjectUserId` int,
	`groupName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_message_group_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_message_group_deliveries` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`groupMessageId` bigint NOT NULL,
	`userId` int NOT NULL,
	`recipientName` varchar(255) NOT NULL,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `operator_message_group_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `operator_group_delivery_unique` UNIQUE(`groupMessageId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `operator_message_group_members` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`groupId` bigint NOT NULL,
	`userId` int NOT NULL,
	`addedBy` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	`removedBy` int,
	`removedAt` timestamp,
	CONSTRAINT `operator_message_group_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_message_group_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`groupId` bigint NOT NULL,
	`groupName` varchar(100) NOT NULL,
	`fromUserId` int NOT NULL,
	`fromOperatorName` varchar(255) NOT NULL,
	`fromAttendanceId` bigint NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operator_message_group_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_message_groups` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operator_message_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `operator_message_group_audit_history_idx` ON `operator_message_group_audit` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operator_group_delivery_inbox_idx` ON `operator_message_group_deliveries` (`userId`,`readAt`,`deliveredAt`);--> statement-breakpoint
CREATE INDEX `operator_message_group_member_current_idx` ON `operator_message_group_members` (`groupId`,`userId`,`removedAt`);--> statement-breakpoint
CREATE INDEX `operator_message_group_member_user_idx` ON `operator_message_group_members` (`userId`,`removedAt`,`groupId`);--> statement-breakpoint
CREATE INDEX `operator_group_message_history_idx` ON `operator_message_group_messages` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `operator_message_group_active_name_idx` ON `operator_message_groups` (`isActive`,`name`);