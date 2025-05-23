ALTER TABLE `lsv_agents` ADD `avatar` VARCHAR(255) NULL AFTER `date_expired`;

DROP TABLE IF EXISTS `lsv_stylings`;
CREATE TABLE `lsv_stylings` (
`styling_id`  int(11) NOT NULL AUTO_INCREMENT ,
`tenant`  varchar(255) NULL ,
`style` VARCHAR(2048) NULL,
PRIMARY KEY (`styling_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;