CREATE TABLE `managing_holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`managingCompanyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`date` varchar(10) NOT NULL,
	`recurring` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `managing_holidays_id` PRIMARY KEY(`id`)
);
