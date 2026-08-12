ALTER TABLE `incidents` MODIFY COLUMN `status` enum('waiting','attending','observing','dispatched','maintenance','closed') NOT NULL DEFAULT 'waiting';
ALTER TABLE `incidents` MODIFY COLUMN `status` enum('waiting','attending','observing','dispatched','maintenance','closed') NOT NULL DEFAULT 'waiting';
