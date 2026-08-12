CREATE TABLE `system_technical_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`account` varchar(10) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_technical_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_technical_accounts_account_unique` UNIQUE(`account`)
);
