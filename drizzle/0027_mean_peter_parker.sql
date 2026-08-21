ALTER TABLE `alarm_systems` ADD `keepAliveExpectedIntervalSeconds` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `keepAliveFailureEventEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `keepAliveDisconnectAlertEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `keepAliveRepeatAlertEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `alarm_systems` ADD `keepAliveRepeatAlertEveryMinutes` int DEFAULT 60 NOT NULL;