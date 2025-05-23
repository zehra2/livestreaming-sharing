DROP TABLE IF EXISTS `lsv_logs`;
CREATE TABLE `lsv_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `message` varchar(255) DEFAULT NULL,
  `session` varchar(255) DEFAULT NULL,
  `ua` varchar(255) DEFAULT NULL,
  `constraint` varchar(255) DEFAULT NULL,
  `attendee` varchar(255) DEFAULT NULL,
  `agent` varchar(255) DEFAULT NULL,
  `agent_id` varchar(255) DEFAULT NULL,
  `date_created` datetime DEFAULT NULL,
  `room_id` varchar(255) DEFAULT NULL,
PRIMARY KEY (`log_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;