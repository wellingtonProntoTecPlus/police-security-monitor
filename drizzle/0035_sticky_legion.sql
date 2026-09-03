ALTER TABLE `alarm_events` ADD `remoteCommandId` int;--> statement-breakpoint
ALTER TABLE `alarm_remote_commands` ADD `technicalUserCode` varchar(20);--> statement-breakpoint
ALTER TABLE `alarm_remote_commands` ADD `panelConfirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_remote_commands` ADD `remoteEventId` int;