ALTER TABLE `lsv_plans` CHANGE `interval` `interval` ENUM('H','D','W','M','Y') CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL COMMENT 'H=Hours (1 to 24) D=Days (1 to 90) | W=Weeks (1 to 52) | M=Months (1 to 24) | Y=Years (1 to 5)';
ALTER TABLE `lsv_subscriptions` CHANGE `subscr_interval` `subscr_interval` CHAR(1) CHARACTER SET utf8 COLLATE utf8_unicode_ci NULL DEFAULT NULL COMMENT 'H = Hours | D=Days | W=Weeks | M=Months | Y=Years';
ALTER TABLE `lsv_rooms` ADD `language` VARCHAR(10) NULL AFTER `video_ai_tools`;
ALTER TABLE `lsv_rooms` ADD `ai_greeting_text` VARCHAR(1000) NULL AFTER `language`, ADD`is_context` tinyint(4) NOT NULL DEFAULT '1' AFTER `ai_greeting_text`;

ALTER TABLE `lsv_rooms` CHANGE `video_ai_system` `video_ai_system` TEXT CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL;


DROP TABLE IF EXISTS `lsv_bookings`;
CREATE TABLE `lsv_bookings` (
  `booking_id` int(11) NOT NULL AUTO_INCREMENT,
  `timeslot` enum('9 am', '10 am', '11 am', '12 pm', '1 pm', '2 pm', '3 pm', '4 pm', '5 pm') DEFAULT NULL,
  `name` varchar(2048) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `date_created` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_booking` date DEFAULT NULL,
  PRIMARY KEY (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

ALTER TABLE `lsv_rooms` ADD `video_ai_assistant` VARCHAR(256) NULL AFTER `is_context`;