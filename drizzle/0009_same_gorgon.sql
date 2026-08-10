CREATE TABLE `finalizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(50) NOT NULL DEFAULT 'outros',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finalizations_id` PRIMARY KEY(`id`)
);
