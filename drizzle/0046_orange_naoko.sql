ALTER TABLE `operator_shift_messages` ADD `isCurrent` boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `operator_shift_messages` SET `isCurrent` = FALSE WHERE `incidentId` IS NOT NULL;
--> statement-breakpoint
UPDATE `operator_shift_messages` AS m
JOIN (
  SELECT message.`incidentId`, MAX(message.`id`) AS `latestId`
  FROM `operator_shift_messages` AS message
  JOIN `incidents` AS i ON i.`id` = message.`incidentId`
  WHERE i.`status` IN ('waiting','attending','observing','dispatched','maintenance')
  GROUP BY message.`incidentId`
) AS latest ON latest.`latestId` = m.`id`
SET m.`isCurrent` = TRUE;
