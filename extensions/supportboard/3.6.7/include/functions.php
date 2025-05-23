<?php

/*
 * ==========================================================
 * FUNCTIONS.PHP
 * ==========================================================
 *
 * Main PHP functions file. © 2017-2023 board.support. All rights reserved.
 *
 */

define('SB_VERSION', '3.6.7');

if (!defined('SB_PATH')) {
    $path = dirname(__DIR__, 1);
    define('SB_PATH', $path ? $path : dirname(__DIR__));
}
if (!defined('JSON_INVALID_UTF8_IGNORE')) {
    define('JSON_INVALID_UTF8_IGNORE', 0);
}
if (isset($_COOKIE['sb-cloud'])) {
    $_POST['cloud'] = $_COOKIE['sb-cloud'];
}

require_once(SB_PATH . '/config.php');
//LiveSmart code change start.
require_once(SB_PATH . '/include/livesmart.php');
//LiveSmart code change end.
require_once(SB_PATH . '/include/functions_users.php');
require_once(SB_PATH . '/include/functions_messages.php');
require_once(SB_PATH . '/include/functions_settings.php');
require_once(SB_PATH . '/include/functions_email.php');

global $SB_CONNECTION;
global $SB_SETTINGS;
global $SB_LOGIN;
global $SB_LANGUAGE;
global $SB_TRANSLATIONS;
const SELECT_FROM_USERS = 'SELECT id, first_name, last_name, email, profile_image, user_type, creation_time, last_activity, department, token';

class SBError {
    public $error;

    function __construct($error_code, $function = '', $message = '') {
        $this->error = ['message' => $message, 'function' => $function, 'code' => $error_code];
    }

    public function __toString() {
        return $this->code() . ' ' . $this->message();
    }

    function message() {
        return $this->error['message'];
    }

    function code() {
        return $this->error['code'];
    }

    function function_name() {
        return $this->error['function'];
    }
}

class SBValidationError {
    public $error;

    function __construct($error_code) {
        $this->error = $error_code;
    }

    public function __toString() {
        return $this->error;
    }

    function code() {
        return $this->error;
    }
}

$sb_apps = ['dialogflow', 'slack', 'wordpress', 'tickets', 'woocommerce', 'ump', 'perfex', 'whmcs', 'aecommerce', 'messenger', 'whatsapp', 'armember', 'viber', 'telegram', 'line', 'wechat', 'twitter', 'zendesk', 'gbm', 'martfury'];
for ($i = 0; $i < count($sb_apps); $i++) {
    $file = SB_PATH . '/apps/' . $sb_apps[$i] . '/functions.php';
    if (file_exists($file)) {
        require_once($file);
    }
}

/*
 * -----------------------------------------------------------
 * DATABASE
 * -----------------------------------------------------------
 *
 * 1. Connection to the database
 * 2. Get database values
 * 3. Insert or update database values
 * 4. Escape and sanatize values prior to databse insertion
 * 5. Escape a JSON string prior to databse insertion
 * 6. Set default database environment settings
 * 7. Database error function
 *
 */

function sb_db_connect() {
    global $SB_CONNECTION;
    if (!defined('SB_DB_NAME') || !SB_DB_NAME) {
        return false;
    }
    if ($SB_CONNECTION) {
        sb_db_init_settings();
        return true;
    }
    $SB_CONNECTION = new mysqli(SB_DB_HOST, SB_DB_USER, SB_DB_PASSWORD, SB_DB_NAME, defined('SB_DB_PORT') && SB_DB_PORT ? intval(SB_DB_PORT) : ini_get('mysqli.default_port'));
    if ($SB_CONNECTION->connect_error) {
        echo 'Connection error. Visit the admin area for more details or open the config.php file and check the database information. Message: ' . $SB_CONNECTION->connect_error . '.';
        return false;
    }
    sb_db_init_settings();
    return true;
}

function sb_db_get($query, $single = true) {
    global $SB_CONNECTION;
    $status = sb_db_connect();
    $value = ($single ? '' : []);
    if ($status) {
        $result = $SB_CONNECTION->query($query);
        if ($result) {
            if ($result->num_rows > 0) {
                while ($row = $result->fetch_assoc()) {
                    if ($single) {
                        $value = $row;
                    } else {
                        array_push($value, $row);
                    }
                }
            }
        } else {
            return sb_db_error('sb_db_get');
        }
    } else {
        return $status;
    }
    return $value;
}

function sb_db_query($query, $return = false) {
    global $SB_CONNECTION;
    $status = sb_db_connect();
    if ($status) {
        $result = $SB_CONNECTION->query($query);
        if ($result) {
            if ($return) {
                if (isset($SB_CONNECTION->insert_id) && $SB_CONNECTION->insert_id > 0) {
                    return $SB_CONNECTION->insert_id;
                } else {
                    return sb_db_error('sb_db_query');
                }
            } else {
                return true;
            }
        } else {
            return sb_db_error('sb_db_query');
        }
    } else {
        return $status;
    }
}

function sb_db_escape($value, $numeric = -1) {
    if (is_numeric($value)) {
        return $value;
    } else if ($numeric === true) {
        if (is_bool($numeric)) {
            return false;
        }
        die(sb_error('value-not-numeric', 'sb_db_escape', 'Value not numeric', true));
    }
    global $SB_CONNECTION;
    sb_db_connect();
    if ($SB_CONNECTION) {
        $value = $SB_CONNECTION->real_escape_string($value);
    }
    $value = str_replace(['\"', '"'], ['"', '\"'], $value);
    $value = sb_sanatize_string($value);
    $value = htmlspecialchars($value, ENT_NOQUOTES | ENT_SUBSTITUTE, 'utf-8');
    $value = str_replace('&amp;lt;', '&lt;', $value);
    return $value;
}

function sb_db_json_escape($array) {
    global $SB_CONNECTION;
    sb_db_connect();
    $value = str_replace(['"false"', '"true"'], ['false', 'true'], json_encode($array, JSON_INVALID_UTF8_IGNORE));
    $value = sb_sanatize_string($value);
    return $SB_CONNECTION ? $SB_CONNECTION->real_escape_string($value) : $value;
}

function sb_json_escape($value) {
    return str_replace(['"', "\'"], ['\"', "'"], $value);
}

function sb_db_error($function) {
    global $SB_CONNECTION;
    return sb_error('db-error', $function, $SB_CONNECTION->error);
}

function sb_db_check_connection($name = false, $user = false, $password = false, $host = false, $port = false) {
    global $SB_CONNECTION;
    $response = true;
    if ($name === false && defined('SB_DB_NAME')) {
        $name = SB_DB_NAME;
        $user = SB_DB_USER;
        $password = SB_DB_PASSWORD;
        $host = SB_DB_HOST;
        $port = defined('SB_DB_PORT') && SB_DB_PORT ? intval(SB_DB_PORT) : false;
    }
    if ($name === false || !$name) {
        return 'installation';
    }
    try {
        set_error_handler(function () { }, E_ALL);
        $SB_CONNECTION = new mysqli($host, $user, $password, $name, $port === false ? ini_get('mysqli.default_port') : intval($port));
        sb_db_init_settings();
    } catch (Exception $e) {
        $response = $e->getMessage();
    }
    if ($SB_CONNECTION->connect_error) {
        $response = $SB_CONNECTION->connect_error;
    }
    restore_error_handler();
    return $response;
}

function sb_db_init_settings() {
    if (sb_is_cloud()) {
        return;
    }
    global $SB_CONNECTION;
    $SB_CONNECTION->set_charset('utf8mb4');
    $SB_CONNECTION->query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))");
}

function sb_external_db($action, $name, $query = '', $extra = false) {
    $NAME = strtoupper($name);
    $name = strtolower($name);
    switch ($action) {
        case 'connect':
            $connection = sb_isset($GLOBALS, 'SB_' . $NAME . '_CONNECTION');
            $defined = defined('SB_' . $NAME . '_DB_NAME');
            if (!empty($connection) && $connection->ping()) {
                return true;
            }
            if (!$defined) {
                $prefix = '';
                $database = sb_get_setting($name . '-db');
                if (empty($database[$name . '-db-name'])) {
                    return sb_error('db-error', 'sb_external_db', 'Missing database details in ' . $name . ' settings area.');
                }
                define('SB_' . $NAME . '_DB_HOST', $database[$name . '-db-host']);
                define('SB_' . $NAME . '_DB_USER', $database[$name . '-db-user']);
                define('SB_' . $NAME . '_DB_PASSWORD', $database[$name . '-db-password']);
                define('SB_' . $NAME . '_DB_NAME', $database[$name . '-db-name']);
                if ($name == 'perfex' || $name == 'whmcs') {
                    define('SB_' . $NAME . '_DB_PREFIX', empty($database[$name . '-db-prefix']) ? 'tbl' : $database[$name . '-db-prefix']);
                    $prefix = PHP_EOL . 'define(\'SB_' . $NAME . '_DB_PREFIX\', \'' . sb_isset($database, $name . '-db-prefix', 'tbl') . '\');';
                }
                sb_write_config_extra('/* ' . $NAME . ' CRM  */' . PHP_EOL . 'define(\'SB_' . $NAME . '_DB_HOST\', \'' . $database[$name . '-db-host'] . '\');' . PHP_EOL . 'define(\'SB_' . $NAME . '_DB_USER\', \'' . $database[$name . '-db-user'] . '\');' . PHP_EOL . 'define(\'SB_' . $NAME . '_DB_PASSWORD\', \'' . $database[$name . '-db-password'] . '\');' . PHP_EOL . 'define(\'SB_' . $NAME . '_DB_NAME\', \'' . $database[$name . '-db-name'] . '\');' . $prefix);
            }
            $connection = new mysqli(constant('SB_' . $NAME . '_DB_HOST'), constant('SB_' . $NAME . '_DB_USER'), constant('SB_' . $NAME . '_DB_PASSWORD'), constant('SB_' . $NAME . '_DB_NAME'));
            if ($connection->connect_error) {
                if ($defined) {
                    $database = sb_get_setting($name . '-db');
                    if (constant('SB_' . $NAME . '_DB_HOST') != $database[$name . '-db-host'] || constant('SB_' . $NAME . '_DB_USER') != $database[$name . '-db-user'] || constant('SB_' . $NAME . '_DB_PASSWORD') != $database[$name . '-db-password'] || constant('SB_' . $NAME . '_DB_NAME') != $database[$name . '-db-name'] || (defined('SB_' . $NAME . '_DB_PREFIX') && constant('SB_' . $NAME . '_DB_PREFIX') != $database[$name . '-db-prefix'])) {
                        $raw = file_get_contents(SB_PATH . '/config.php');
                        sb_file(SB_PATH . '/config.php', str_replace(['/* Perfex CRM  */', 'define(\'SB_' . $NAME . '_DB_HOST\', \'' . constant('SB_' . $NAME . '_DB_HOST') . '\');', 'define(\'SB_' . $NAME . '_DB_USER\', \'' . constant('SB_' . $NAME . '_DB_USER') . '\');', 'define(\'SB_' . $NAME . '_DB_PASSWORD\', \'' . constant('SB_' . $NAME . '_DB_PASSWORD') . '\');', 'define(\'SB_' . $NAME . '_DB_NAME\', \'' . constant('SB_' . $NAME . '_DB_NAME') . '\');', defined('SB_' . $NAME . '_DB_PREFIX') ? 'define(\'SB_' . $NAME . '_DB_PREFIX\', \'' . constant('SB_' . $NAME . '_DB_PREFIX') . '\');' : ''], '', $raw));
                    }
                }
                die($connection->connect_error);
            }
            $connection->set_charset('utf8mb4');
            $connection->query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))");
            $GLOBALS['SB_' . $NAME . '_CONNECTION'] = $connection;
            return true;
        case 'read':
            $status = sb_external_db('connect', $name);
            $value = $extra ? '' : [];
            if ($status === true) {
                $result = $GLOBALS['SB_' . strtoupper($name) . '_CONNECTION']->query($query);
                if ($result) {
                    if ($result->num_rows > 0) {
                        while ($row = $result->fetch_assoc()) {
                            if ($extra) {
                                $value = $row;
                            } else {
                                array_push($value, $row);
                            }
                        }
                    }
                } else {
                    return sb_error('db-error', 'sb_external_db', $GLOBALS['SB_' . strtoupper($name) . '_CONNECTION']->error);
                }
            } else {
                return $status;
            }
            return $value;
        case 'write':
            $status = sb_external_db('connect', $name);
            if ($status === true) {
                $connection = $GLOBALS['SB_' . $NAME . '_CONNECTION'];
                $result = $connection->query($query);
                if ($result) {
                    if ($extra) {
                        if (isset($connection->insert_id) && $connection->insert_id > 0) {
                            return $connection->insert_id;
                        } else {
                            return sb_db_error('sb_db_query');
                        }
                    } else {
                        return true;
                    }
                } else {
                    return sb_error('db-error', 'sb_external_db', $connection->error);
                }
            }
            return $status;
    }
    return false;
}

function sb_is_error($object) {
    return is_a($object, 'SBError');
}

function sb_is_validation_error($object) {
    return is_a($object, 'SBValidationError');
}

/*
 * -----------------------------------------------------------
 * TRANSLATIONS
 * -----------------------------------------------------------
 *
 * 1. Return the translation of a string
 * 2. Echo the translation of a string
 * 3. Returns the translation of a setting
 * 4. Echos the translations of as setting
 * 5. Translate using AI multilingual translation if active
 * 6. Initialize the translations
 * 7. Return the current translations array
 * 8. Return all the translations of both admin and front areas of all languages
 * 9. Return the translations of a language
 * 10. Save a translation langauge file and a copy of it as backup
 * 11. Restore a translation language file from a backup
 * 12 Return the user langauge code
 * 13. Return the langauge code of the admin area relative to the active agent
 * 14. Translate a string in the given language
 * 15. Get language code
 *
 */

function sb_($string) {
    if ($string) {
        global $SB_TRANSLATIONS;
        if (!isset($SB_TRANSLATIONS)) {
            sb_init_translations();
        }
        return empty($SB_TRANSLATIONS[$string]) ? $string : $SB_TRANSLATIONS[$string];
    }
    return $string;
}

function sb_e($string) {
    echo sb_($string);
}

function sb_s($string, $disabled = false) {
    if ($disabled) {
        return $string;
    }
    global $SB_TRANSLATIONS_SETTINGS;
    if (!isset($SB_TRANSLATIONS_SETTINGS)) {
        $language = sb_get_admin_language();
        if ($language && $language != 'en') {
            $file_path = SB_PATH . '/resources/languages/admin/settings/' . $language . '.json';
            if (file_exists($file_path)) {
                $SB_TRANSLATIONS_SETTINGS = json_decode(file_get_contents($file_path), true);
            }
        }
    }
    return empty($SB_TRANSLATIONS_SETTINGS[$string]) ? $string : $SB_TRANSLATIONS_SETTINGS[$string];
}

function sb_se($string) {
    echo sb_s($string);
}

function sb_t($string, $language_code = false) {
    global $SB_LANGUAGE;
    global $SB_TRANSLATIONS;
    if (!$language_code || $language_code == -1) {
        $language_code = sb_get_user_language(sb_get_active_user_ID());
    }
    if (!$language_code || $language_code == -1 || $language_code == 'en') {
        return $string;
    }
    if (empty($SB_LANGUAGE) || empty($SB_TRANSLATIONS) || $SB_LANGUAGE[0] != $language_code) {
        if (!empty($_POST['init.php']) && !sb_get_setting('front-auto-translations')) {
            $SB_LANGUAGE = [sb_defined('SB_CLOUD_DEFAULT_LANGUAGE_CODE', 'en'), 'front'];
        } else {
            $path = SB_PATH . '/resources/languages/front/' . $language_code . '.json';
            if (sb_is_cloud()) {
                $cloud_path = SB_PATH . '/uploads/cloud/languages/' . sb_isset(sb_cloud_account(), 'user_id') . '/front/' . $language_code . '.json';
                if (file_exists($cloud_path)) {
                    $path = $cloud_path;
                }
            }
            if (file_exists($path)) {
                $SB_TRANSLATIONS = json_decode(file_get_contents($path), true);
                $SB_LANGUAGE = [$language_code, 'front'];
            }
        }
    }
    if (empty($SB_TRANSLATIONS[$string])) {
        if (defined('SB_DIALOGFLOW') && (sb_get_setting('dialogflow-multilingual-translation') || sb_get_multi_setting('google', 'google-multilingual-translation'))) { // Deprecated: sb_get_setting('dialogflow-multilingual-translation')
            $response = sb_google_translate([$string], $language_code);
            if (!empty($response[0])) {
                $translations_to_save = $SB_TRANSLATIONS;
                if (empty($translations_to_save)) {
                    $path = SB_PATH . '/resources/languages/front/' . $language_code . '.json';
                    if (file_exists($path)) {
                        $translations_to_save = json_decode(file_get_contents($path), true);
                    }
                }
                $translation = $response[0][0];
                if ($translations_to_save) {
                    $translations_to_save[$string] = $translation;
                    $translations_file = [];
                    $translations_file[$language_code] = ['front' => $translations_to_save];
                    sb_save_translations($translations_file);
                }
                return $translation;
            }
        }
        return $string;
    }
    return $SB_TRANSLATIONS[$string];
}

function sb_init_translations() {
    global $SB_TRANSLATIONS;
    global $SB_LANGUAGE;
    $SB_CLOUD_DEFAULT_LANGUAGE_CODE = sb_defined('SB_CLOUD_DEFAULT_LANGUAGE_CODE', false);
    if (!empty($SB_LANGUAGE) && ($SB_LANGUAGE[0] != 'en' || $SB_CLOUD_DEFAULT_LANGUAGE_CODE)) {
        $path = SB_PATH . '/resources/languages/' . $SB_LANGUAGE[1] . '/' . $SB_LANGUAGE[0] . '.json';
        if (sb_is_cloud()) {
            $cloud_path = SB_PATH . '/uploads/cloud/languages/' . sb_isset(sb_cloud_account(), 'user_id') . '/' . $SB_LANGUAGE[1] . '/' . $SB_LANGUAGE[0] . '.json';
            if (file_exists($cloud_path)) {
                $path = $cloud_path;
            }
        }
        if (file_exists($path)) {
            $SB_TRANSLATIONS = json_decode(file_get_contents($path), true);
        } else {
            $SB_TRANSLATIONS = false;
        }
    } else if (!isset($SB_LANGUAGE)) {
        $SB_TRANSLATIONS = false;
        $SB_LANGUAGE = false;
        $is_init = !empty($_POST['init.php']);
        if ($is_init && !sb_get_setting('front-auto-translations')) {
            $SB_LANGUAGE = [!empty($_POST['language']) && $_POST['language'] != 'false' ? strtolower($_POST['language'][0]) : ($SB_CLOUD_DEFAULT_LANGUAGE_CODE ? $SB_CLOUD_DEFAULT_LANGUAGE_CODE : 'en'), 'front'];
            if ($SB_LANGUAGE[0] != 'en') {
                sb_init_translations();
            } else {
                return;
            }
        }
        $admin = sb_is_agent();
        $language = $admin ? sb_get_admin_language() : sb_get_user_language(sb_get_active_user_ID());
        if (($language && $language != 'en') && ($admin || isset($_GET['lang']) || $is_init || (sb_get_setting('dialogflow-multilingual-translation') || sb_get_multi_setting('google', 'google-multilingual-translation')))) { // Deprecated: sb_get_setting('dialogflow-multilingual-translation')
            switch ($language) {
                case 'nn':
                case 'nb':
                    $language = 'no';
                    break;
            }
            $area = $admin ? 'admin' : 'front';
            $path = SB_PATH . '/resources/languages/' . $area . '/' . $language . '.json';
            if (sb_is_cloud()) {
                $cloud_path = SB_PATH . '/uploads/cloud/languages/' . sb_isset(sb_cloud_account(), 'user_id') . '/' . $area . '/' . $language . '.json';
                if (file_exists($cloud_path)) {
                    $path = $cloud_path;
                }
            }
            if (file_exists($path)) {
                $SB_TRANSLATIONS = json_decode(file_get_contents($path), true);
                $SB_LANGUAGE = [$language, $area];
            }
        }
    }
}

function sb_get_current_translations() {
    global $SB_TRANSLATIONS;
    if (!isset($SB_TRANSLATIONS)) {
        sb_init_translations();
    }
    return $SB_TRANSLATIONS;
}

function sb_get_translations($is_user = false, $language_code = false) {
    $translations = [];
    $cloud_path = false;
    if ($is_user && !file_exists(SB_PATH . '/uploads/languages')) {
        return [];
    }
    $path = $is_user ? '/uploads' : '/resources';
    $language_codes = json_decode(file_get_contents(SB_PATH . '/resources/languages/language-codes.json'), true);
    $paths = ['front', 'admin', 'admin/js', 'admin/settings'];
    if (sb_is_cloud()) {
        $cloud = sb_cloud_account();
        $cloud_path = SB_PATH . '/uploads/cloud/languages/' . $cloud['user_id'];
    }
    for ($i = 0; $i < count($paths); $i++) {
        $files = scandir(SB_PATH . $path . '/languages/' . $paths[$i]);
        for ($j = 0; $j < count($files); $j++) {
            $file = $files[$j];
            if (strpos($file, '.json')) {
                $code = substr($file, 0, -5);
                if (!isset($language_codes[$code]) || ($language_code && $language_code != $code)) {
                    continue;
                }
                if (!isset($translations[$code])) {
                    $translations[$code] = ['name' => $language_codes[$code]];
                }
                $translation_strings = json_decode(file_get_contents($cloud_path && file_exists($cloud_path . '/' . $paths[$i] . '/' . $file) ? ($cloud_path . '/' . $paths[$i] . '/' . $file) : (SB_PATH . $path . '/languages/' . $paths[$i] . '/' . $file)), true);
                $translations[$code][$paths[$i]] = $translation_strings;
            }
        }
    }
    return $translations;
}

function sb_get_translation($language_code) {
    return sb_isset(sb_get_translations(false, $language_code), $language_code);
}

function sb_save_translations($translations) {
    $is_cloud = sb_is_cloud();
    $cloud_path = false;
    if (!$is_cloud && !file_exists(SB_PATH . '/uploads/languages')) {
        mkdir(SB_PATH . '/uploads/languages', 0755, true);
        mkdir(SB_PATH . '/uploads/languages/front', 0755, true);
        mkdir(SB_PATH . '/uploads/languages/admin', 0755, true);
        mkdir(SB_PATH . '/uploads/languages/admin/js', 0755, true);
        mkdir(SB_PATH . '/uploads/languages/admin/settings', 0755, true);
    }
    if ($is_cloud) {
        $cloud = sb_cloud_account();
        $cloud_path = SB_PATH . '/uploads/cloud/languages/' . $cloud['user_id'];
        if (!file_exists(SB_PATH . '/uploads/cloud')) {
            mkdir(SB_PATH . '/uploads/cloud', 0755, true);
            mkdir(SB_PATH . '/uploads/cloud/languages', 0755, true);
        }
        if (!file_exists($cloud_path)) {
            mkdir($cloud_path, 0755, true);
            mkdir($cloud_path . '/front', 0755, true);
            mkdir($cloud_path . '/admin', 0755, true);
            mkdir($cloud_path . '/admin/js', 0755, true);
            mkdir($cloud_path . '/admin/settings', 0755, true);
        }
    }
    if (is_string($translations)) {
        $translations = json_decode($translations, true);
    }
    foreach ($translations as $key => $translation) {
        foreach ($translation as $key_area => $translations_list) {
            $json = html_entity_decode(json_encode($translations_list, JSON_INVALID_UTF8_IGNORE, JSON_UNESCAPED_UNICODE));
            if ($json) {
                if ($is_cloud) {
                    sb_file($cloud_path . '/' . $key_area . '/' . $key . '.json', $json);
                } else {
                    $paths = ['resources', 'uploads'];
                    for ($i = 0; $i < 2; $i++) {
                        sb_file(SB_PATH . '/' . $paths[$i] . '/languages/' . $key_area . '/' . $key . '.json', $json);
                    }
                }
            }
        }
    }
    return true;
}

function sb_restore_user_translations() {
    $translations_all = sb_get_translations();
    $translations_user = sb_get_translations(true);
    $paths = ['front', 'admin', 'admin/js', 'admin/settings'];
    foreach ($translations_user as $key => $translations) {
        for ($i = 0; $i < count($paths); $i++) {
            $path = $paths[$i];
            if (isset($translations_all[$key]) && isset($translations_all[$key][$path])) {
                foreach ($translations_all[$key][$path] as $key_two => $translation) {
                    if (!isset($translations[$path][$key_two])) {
                        $translations[$path][$key_two] = $translations_all[$key][$path][$key_two];
                    }
                }
            }
            sb_file(SB_PATH . '/resources/languages/' . $path . '/' . $key . '.json', json_encode($translations[$path], JSON_INVALID_UTF8_IGNORE));
        }
    }
}

function sb_get_user_language($user_id = false) {
    global $SB_LANGUAGE;
    $language = false;
    if ($user_id && is_numeric($user_id)) {
        $language = sb_get_user_extra($user_id, 'language');
    }
    if (!$language) {
        if (!empty($_POST['language']) && $_POST['language'] != 'false') {
            $language = strtolower($_POST['language'][0]);
        } else {
            $language = sb_get_user_extra($user_id, 'browser_language');
        }
    }
    if ($language) {
        return strtolower($language);
    }
    if (empty($SB_LANGUAGE)) {
        $language_code = strtolower(sb_isset($_SERVER, 'HTTP_ACCEPT_LANGUAGE'));
        return $language_code ? sb_language_code($language_code) : '';
    }
    return $SB_LANGUAGE[0];
}

function sb_get_admin_language($user_id = false) {
    $language = defined('SB_ADMIN_LANG') ? trim(strtolower(SB_ADMIN_LANG)) : (sb_get_setting('admin-auto-translations') ? trim(strtolower(sb_get_user_language($user_id ? $user_id : sb_get_active_user_ID()))) : false);
    return $language && ($language != 'en' || defined('SB_CLOUD_DEFAULT_LANGUAGE_CODE')) ? $language : sb_defined('SB_CLOUD_DEFAULT_LANGUAGE_CODE', $language);
}

function sb_language_code($language_code_full) {
    $language_code_full = strtolower($language_code_full);
    if ($language_code_full == 'pt_br') {
        return 'br';
    }
    return substr($language_code_full, 0, 2);
}


/*
 * ----------------------------------------------------------
 * APPS, UPDATES, INSTALLATION
 * ----------------------------------------------------------
 *
 * 1. Get the plugin and apps versions and install, activate and update apps
 * 2. Check if the app license is valid and install or update it
 * 3. Install or update an app
 * 4. Update Support Board and all apps
 * 5. Compatibility function for new versions
 * 6. Check if there are updates available
 * 7. Get installed app versions array
 * 8. Plugin installation function
 * 9. Update the config.php file
 * 10. Return the upload path or url
 * 11. Return the installation directory name
 *
 */

function sb_get_versions() {
    return json_decode(sb_download('https://board.support/synch/versions.json'), true);
}

function sb_app_get_key($app_name) {
    $keys = sb_get_external_setting('app-keys');
    return isset($keys[$app_name]) ? $keys[$app_name] : '';
}

function sb_app_activation($app_name, $key) {
    $envato_code = sb_get_setting('envato-purchase-code');
    if (!$envato_code) {
        return new SBValidationError('envato-purchase-code-not-found');
    }
    $key = trim($key);
    $response = json_decode(sb_download('https://board.support/synch/updates.php?sb=' . trim($envato_code) . '&' . $app_name . '=' . $key), true);
    if (empty($response[$app_name])) {
        return new SBValidationError('invalid-key');
    }
    if ($response[$app_name] == 'expired') {
        return new SBValidationError('expired');
    }
    return sb_app_update($app_name, $response[$app_name], $key);
}

function sb_app_update($app_name, $file_name, $key = false) {
    if (!$file_name) {
        return new SBValidationError('temporary-file-name-not-found');
    }
    $key = trim($key);
    $error = '';
    $zip = sb_download('https://board.support/synch/temp/' . $file_name);
    if ($zip) {
        $file_path = SB_PATH . '/uploads/' . $app_name . '.zip';
        if (!file_exists(dirname($file_path))) {
            mkdir(dirname($file_path), 0755, true);
        }
        file_put_contents($file_path, $zip);
        if (file_exists($file_path)) {
            $zip = new ZipArchive;
            if ($zip->open($file_path) === true) {
                $zip->extractTo($app_name == 'sb' ? (defined('SB_WP') ? substr(SB_PATH, 0, -13) : SB_PATH) : SB_PATH . '/apps');
                $zip->close();
                unlink($file_path);
                if ($app_name == 'sb') {
                    sb_restore_user_translations();
                    return 'success';
                }
                if (file_exists(SB_PATH . '/apps/' . $app_name)) {
                    if (!empty($key)) {
                        $keys = sb_get_external_setting('app-keys');
                        $keys[$app_name] = $key;
                        sb_save_external_setting('app-keys', $keys);
                    }
                    return 'success';
                } else {
                    $error = 'zip-extraction-error';
                }
            } else {
                $error = 'zip-error';
            }
        } else {
            $error = 'file-not-found';
        }
    } else {
        $error = 'download-error';
    }
    return $error ? new SBValidationError($error) : false;
}

function sb_update() {
    $envato_code = sb_get_setting('envato-purchase-code');
    if (!$envato_code) {
        return new SBValidationError('envato-purchase-code-not-found');
    }
    $latest_versions = sb_get_versions();
    $installed_apps_versions = sb_get_installed_apps_version();
    $keys = sb_get_external_setting('app-keys');
    $result = [];
    $link = (SB_VERSION != $latest_versions['sb'] ? 'sb=' : 'sbcode=') . trim($envato_code) . '&';
    foreach ($installed_apps_versions as $key => $value) {
        if ($value != -1 && $value != $latest_versions[$key]) {
            if (isset($keys[$key])) {
                $link .= $key . '=' . trim($keys[$key]) . '&';
            } else {
                $result[$key] = 'license-key-not-found';
            }
        }
    }
    if (isset($_POST['domain'])) {
        $link .= 'domain=' . $_POST['domain'] . '&';
    }
    $downloads = sb_download('https://board.support/synch/updates.php?' . substr($link, 0, -1));
    if (empty($downloads)) {
        return new SBValidationError('empty-or-null');
    }
    if (in_array($downloads, ['invalid-envato-purchase-code', 'purchase-code-limit-exceeded', 'banned', 'missing-arguments'])) {
        return new SBValidationError($downloads);
    }
    $downloads = json_decode($downloads, true);
    foreach ($downloads as $key => $value) {
        if ($value) {
            $result[$key] = !$value || $value == 'expired' ? $value : sb_app_update($key, $value);
        }
    }
    return $result;
}

function sb_updates_validation() {
    if (sb_isset($_COOKIE, 'sb-updates') != SB_VERSION) {
        sb_cloud_load();
        try {
 
            // 3.6.4
            sb_db_query('ALTER TABLE `sb_reports` CHANGE COLUMN `value` `value` TEXT NOT NULL COLLATE \'utf8_unicode_ci\' AFTER `name`');

            // 3.6.1
            sb_db_query('ALTER TABLE sb_conversations ADD COLUMN tags varchar(255) AFTER extra');

            if (!headers_sent()) {
                setcookie('sb-updates', SB_VERSION, time() + 31556926, '/');
            }
        } catch (Exception $e) {
        }
    }
}

function sb_updates_available() {
    $latest_versions = sb_get_versions();
    if (SB_VERSION != $latest_versions['sb'])
        return true;
    $installed_apps_versions = sb_get_installed_apps_version();
    foreach ($installed_apps_versions as $key => $value) {
        if ($value != -1 && $value != $latest_versions[$key]) {
            return true;
        }
    }
    return false;
}

function sb_get_installed_apps_version() {
    return ['dialogflow' => sb_defined('SB_DIALOGFLOW'), 'slack' => sb_defined('SB_SLACK'), 'tickets' => sb_defined('SB_TICKETS'), 'woocommerce' => sb_defined('SB_WOOCOMMERCE'), 'ump' => sb_defined('SB_UMP'), 'perfex' => sb_defined('SB_PERFEX'), 'whmcs' => sb_defined('SB_WHMCS'), 'aecommerce' => sb_defined('SB_AECOMMERCE'), 'messenger' => sb_defined('SB_MESSENGER'), 'whatsapp' => sb_defined('SB_WHATSAPP'), 'armember' => sb_defined('SB_ARMEMBER'), 'telegram' => sb_defined('SB_TELEGRAM'), 'viber' => sb_defined('SB_VIBER'), 'line' => sb_defined('SB_LINE'), 'wechat' => sb_defined('SB_WECHAT'), 'twitter' => sb_defined('SB_TWITTER'), 'zendesk' => sb_defined('SB_ZENDESK'), 'gbm' => sb_defined('SB_GBM'), 'martfury' => sb_defined('SB_MARTFURY')];
}


function sb_installation($details, $force = false) {
    $database = [];
    $not_cloud = !sb_is_cloud();
    if (sb_db_check_connection() === true && !$force) {
        return true;
    }
    if (!isset($details['db-name']) || !isset($details['db-user']) || !isset($details['db-password']) || !isset($details['db-host'])) {
        return new SBValidationError('missing-details');
    } else {
        $database = ['name' => $details['db-name'][0], 'user' => $details['db-user'][0], 'password' => $details['db-password'][0], 'host' => $details['db-host'][0], 'port' => (isset($details['db-port']) && $details['db-port'][0] ? intval($details['db-port'][0]) : ini_get('mysqli.default_port'))];
    }
    if ($not_cloud) {
        if (!isset($details['url'])) {
            return new SBValidationError('missing-url');
        } else if (substr($details['url'], -1) == '/') {
            $details['url'] = substr($details['url'], 0, -1);
        }
    }
    $connection_check = sb_db_check_connection($database['name'], $database['user'], $database['password'], $database['host'], $database['port']);
    $db_respones = [];
    $success = '';
    if ($connection_check === true) {

        // Create the database
        $connection = new mysqli($database['host'], $database['user'], $database['password'], $database['name'], $database['port']);
        if ($not_cloud) {
            $connection->set_charset('utf8mb4');
        }
        $db_respones['users'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_users (id INT NOT NULL AUTO_INCREMENT, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL, password VARCHAR(100), email VARCHAR(191) UNIQUE, profile_image VARCHAR(191), user_type VARCHAR(10) NOT NULL, creation_time DATETIME NOT NULL, token VARCHAR(50) NOT NULL UNIQUE, last_activity DATETIME, typing INT DEFAULT -1, department TINYINT, PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $db_respones['users_data'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_users_data (id INT NOT NULL AUTO_INCREMENT, user_id INT NOT NULL, slug VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, value TEXT NOT NULL, PRIMARY KEY (id), FOREIGN KEY (user_id) REFERENCES sb_users(id) ON DELETE CASCADE, UNIQUE INDEX sb_users_data_index (user_id, slug)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $db_respones['conversations'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_conversations (id int NOT NULL AUTO_INCREMENT, user_id INT NOT NULL, title VARCHAR(191), creation_time DATETIME NOT NULL, status_code TINYINT DEFAULT 0, department TINYINT, agent_id INT, source VARCHAR(2), extra VARCHAR(191), tags VARCHAR(191), PRIMARY KEY (id), FOREIGN KEY (agent_id) REFERENCES sb_users(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES sb_users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $db_respones['messages'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_messages (id int NOT NULL AUTO_INCREMENT, user_id INT NOT NULL, message TEXT NOT NULL, creation_time DATETIME NOT NULL, status_code TINYINT DEFAULT 0, attachments TEXT, payload TEXT, conversation_id INT NOT NULL, PRIMARY KEY (id), FOREIGN KEY (user_id) REFERENCES sb_users(id) ON DELETE CASCADE, FOREIGN KEY (conversation_id) REFERENCES sb_conversations(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
        $db_respones['settings'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_settings (name VARCHAR(191) NOT NULL, value LONGTEXT, PRIMARY KEY (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $db_respones['reports'] = $connection->query('CREATE TABLE IF NOT EXISTS sb_reports (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(191) NOT NULL, value TEXT NOT NULL, creation_time DATE NOT NULL, external_id INT, extra VARCHAR(191), PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

        // Create the admin user
        if (isset($details['first-name']) && isset($details['last-name']) && isset($details['email']) && isset($details['password'])) {
            $now = gmdate('Y-m-d H:i:s');
            $token = bin2hex(openssl_random_pseudo_bytes(20));
            $db_respones['admin'] = $connection->query('INSERT IGNORE INTO sb_users(first_name, last_name, password, email, profile_image, user_type, creation_time, token, last_activity) VALUES ("' . sb_db_escape($details['first-name'][0]) . '", "' . sb_db_escape($details['last-name'][0]) . '", "' . (defined('SB_WP') ? $details['password'][0] : password_hash($details['password'][0], PASSWORD_DEFAULT)) . '", "' . sb_db_escape($details['email'][0]) . '", "' . sb_db_escape($details['url']) . '/media/user.svg' . '", "admin", "' . $now . '", "' . $token . '", "' . $now . '")');
        }

        // Create the config.php file
        if ($not_cloud) {
            $raw = file_get_contents(SB_PATH . '/resources/config-source.php');
            $raw = str_replace(['[url]', '[name]', '[user]', '[password]', '[host]', '[port]'], [$details['url'], $database['name'], $database['user'], $database['password'], $database['host'], (isset($details['db-port']) && $details['db-port'][0] ? $database['port'] : '')], $raw);
            if (defined('SB_WP')) {
                $raw = str_replace('/* [extra] */', sb_wp_config(), $raw);
            }
            sb_file(SB_PATH . '/config.php', $raw);
        }

        // Return
        sb_get('https://board.support/synch/index.php?site=' . $details['url']);
        foreach ($db_respones as $key => $value) {
            if ($value !== true) {
                $success .= $key . ': ' . ($value === false ? 'false' : $value) . ',';
            }
        }
        if (!$success) {
            return true;
        } else {
            return substr($success, 0, -1);
        }
    } else {
        return $connection_check;
    }
}

function sb_write_config_extra($content) {
    $raw = file_get_contents(SB_PATH . '/config.php');
    sb_file(SB_PATH . '/config.php', str_replace('?>', $content . PHP_EOL . PHP_EOL . '?>', $raw));
}

function sb_upload_path($url = false, $date = false) {
    return (defined('SB_UPLOAD_PATH') && SB_UPLOAD_PATH && defined('SB_UPLOAD_URL') && SB_UPLOAD_URL ? ($url ? SB_UPLOAD_URL : SB_UPLOAD_PATH) : ($url ? (SB_URL . '/') : (SB_PATH . '/')) . 'uploads') . ($date ? ('/' . date('d-m-y')) : '');
}

function sb_dir_name() {
    return substr(SB_URL, strrpos(SB_URL, '/') + 1);
}


/*
 * ----------------------------------------------------------
 * PUSHER
 * ----------------------------------------------------------
 *
 * 1. Send a Push notification.
 * 2. Trigger a event on a channel
 * 3. Get all online users including admins and agents
 * 4. Check if there is at least one agent online
 * 5. Check if pusher is active
 * 6. Initialize the Pusher PHP SDK
 *
 */

function sb_push_notification($title = '', $message = '', $icon = '', $interest = false, $conversation_id = false, $user_id = false, $attachments = false) {
    $recipient_agent = false;
    if (!$user_id) {
        $user_id = sb_get_active_user_ID();
    }
    if ($interest == 'agents' || (is_string($interest) && strpos($interest, 'department-') !== false)) {
        $agents = sb_db_get('SELECT id FROM sb_users WHERE (user_type = "admin" OR user_type = "agent") AND ' . ($interest == 'agents' ? 'department IS NULL OR department = ""' : ' department = ' . substr($interest, 11)), false);
        $interest = [];
        for ($i = 0; $i < count($agents); $i++) {
            array_push($interest, $agents[$i]['id']);
        }
        $recipient_agent = true;
    } else if (is_numeric($interest) || is_array($interest)) {
        $agents_ids = sb_get_agents_ids();
        $is_user = !sb_is_agent();
        if (is_numeric($interest)) {
            if (!in_array(intval($interest), $agents_ids)) {
                if ($is_user && empty($GLOBALS['SB_FORCE_ADMIN'])) {
                    return sb_error('security-error', 'sb_push_notification');
                }
            } else
                $recipient_agent = true;
        } else {
            for ($i = 0; $i < count($interest); $i++) {
                if (!in_array(intval($interest[$i]), $agents_ids)) {
                    if ($is_user && empty($GLOBALS['SB_FORCE_ADMIN']))
                        return sb_error('security-error', 'sb_push_notification');
                } else
                    $recipient_agent = true;
            }
        }
    } else if ($interest == 'all-agents') {
        $interest == 'agents';
    }
    if (empty($icon) || strpos($icon, 'user.svg')) {
        $icon = sb_is_cloud() ? SB_CLOUD_BRAND_ICON_PNG : sb_get_setting('notifications-icon', SB_URL . '/media/icon.png');
    }
    if (sb_is_agent() && !$recipient_agent) {
        $link = $conversation_id ? sb_isset(sb_db_get('SELECT B.value FROM sb_conversations A, sb_users_data B WHERE A.id = ' . sb_db_escape($conversation_id, true) . ' AND A.user_id = B.user_id AND B.slug = "current_url" LIMIT 1'), 'value', '') : false;
    } else {
        $link = SB_URL . '/admin.php';
    }
    if (defined('SB_DIALOGFLOW') && is_numeric($interest)) {
        $message_translated = sb_google_translate_auto($message, $interest);
        $message = empty($message_translated) ? $message : $message_translated;
    }
    $image = $attachments && count($attachments) && in_array(pathinfo($attachments[0][1], PATHINFO_EXTENSION), ['jpeg', 'jpg', 'png', 'gif']) ? $attachments[0][1] : false;
    $instance_ID = sb_get_multi_setting('push-notifications', 'push-notifications-id');
    $query = ',"web":{"notification":{"title":"' . str_replace('"', '', $title) . '","body":"' . str_replace('"', '', sb_clear_text_formatting(trim(preg_replace('/\s+/', ' ', $message)))) . '","icon":"' . $icon . '"' . ($link ? ',"deep_link":"' . $link . '"' : '') . ',"hide_notification_if_site_has_focus":true}, "data": {"conversation_id":"' . $conversation_id . '","user_id":"' . $user_id . '","image":"' . ($image ? $image : '') . '"}}}';
    $url = 'https://' . $instance_ID . '.pushnotifications.pusher.com/publish_api/v1/instances/' . $instance_ID . '/publishes';
    $header = ['Content-Type: application/json', 'Authorization: Bearer ' . sb_get_multi_setting('push-notifications', 'push-notifications-key')];
    if (empty($interest)) {
        return false;
    }
    if (is_array($interest) && count($interest) > 100) {
        $interests = [];
        $index = 0;
        $count = count($interest);
        for ($i = 0; $i < $count; $i++) {
            array_push($interests, $interest[$i]);
            $index++;
            if ($index == 100 || $i == $count - 1) {
                $response = sb_curl($url, '{"interests":' . json_encode($interests) . $query, $header);
                $interests = [];
                $index = 0;
            }
        }
    } else {
        $response = sb_curl($url, '{"interests":' . (is_array($interest) ? json_encode($interest) : '["' . str_replace(' ', '', $interest) . '"]') . $query, $header);
    }
    if (isset($response['error'])) {
        return trigger_error($response['description']);
    } else {
        return $response;
    }
}

function sb_pusher_trigger($channel, $event, $data = []) {
    $pusher = sb_pusher_init();
    $user_id = sb_get_active_user_ID();
    $data['user_id'] = $user_id;
    $security = false;
    $count = is_array($channel) ? count($channel) : false;
    switch ($event) {
        case 'message-status-update':
        case 'set-agent-status':
        case 'agent-active-conversation-changed':
        case 'add-user-presence':
        case 'init':
        case 'new-message':
        case 'new-conversation':
        case 'client-typing':
        case 'typing':
            $security = sb_is_agent() || $channel == ('private-user-' . $user_id);
            break;
        case 'update-conversations':
            if ($user_id)
                $security = true;
            break;
    }
    if (sb_is_cloud()) {
        $account_id = sb_isset(sb_cloud_account(), 'user_id');
        if ($account_id) {
            if ($count) {
                for ($i = 0; $i < $count; $i++) {
                    $channel[$i] .= '-' . $account_id;
                }
            } else {
                $channel .= '-' . $account_id;
            }
        }
    }
    if ($security) {
        if ($count > 100) {
            $channels = [];
            $index = 0;
            for ($i = 0; $i < $count; $i++) {
                array_push($channels, $channel[$i]);
                $index++;
                if ($index == 100 || $i == $count - 1) {
                    $response = $pusher->trigger($channels, $event, $data);
                    $channels = [];
                    $index = 0;
                }
            }
            return $response;
        } else {
            return $pusher->trigger($channel, $event, $data);
        }
    }
    return sb_error('pusher-security-error', 'sb_pusher_trigger');
}

function sb_pusher_get_online_users() {
    $index = 1;
    $pusher = sb_pusher_init();
    $continue = true;
    $users = [];
    $account_id = sb_is_cloud() ? '-' . sb_cloud_account()['user_id'] : '';
    while ($continue) {
        $channel = $pusher->get_users_info('presence-' . $index . $account_id);
        if (!empty($channel)) {
            $channel = $channel->users;
            $users = array_merge($users, $channel);
            if (count($channel) > 98) {
                $continue = true;
                $index++;
            } else
                $continue = false;
        } else
            $continue = false;
    }
    return $users;
}

function sb_pusher_agents_online() {
    $agents_id = sb_get_agents_ids();
    $users = sb_pusher_get_online_users();
    for ($i = 0; $i < count($users); $i++) {
        if (in_array($users[$i]->id, $agents_id)) {
            return true;
        }
    }
    return false;
}

function sb_pusher_active() {
    return sb_is_cloud() || sb_get_multi_setting('pusher', 'pusher-active');
}

function sb_pusher_init() {
    require_once SB_PATH . '/vendor/pusher/autoload.php';
    if (sb_is_cloud()) {
        return new Pusher\Pusher(CLOUD_PUSHER_KEY, CLOUD_PUSHER_SECRET, CLOUD_PUSHER_ID, ['cluster' => CLOUD_PUSHER_CLUSTER]);
    }
    $settings = sb_get_setting('pusher');
    return new Pusher\Pusher($settings['pusher-key'], $settings['pusher-secret'], $settings['pusher-id'], ['cluster' => $settings['pusher-cluster']]);
}

/*
 * -----------------------------------------------------------
 * MISCELLANEOUS
 * -----------------------------------------------------------
 *
 * 1. Check if a value and key of an array exists and is not empty and return it
 * 2. Check if a number and key of an array exists and is not empty and return it
 * 3. Check if a constant exists
 * 4. Encrypt a string or decrypt an encrypted string
 * 5. Convert a string to a slug or a slug to a string
 * 6. Send a curl request
 * 7. Return the content of a URL as a string
 * 8. Return the content of a URL as a string via GET
 * 9. Create a CSV file from an array
 * 10. Create a new file containing the given content and save it in the destination path.
 * 11. Delete a file
 * 12. Debug function
 * 13. Convert a JSON string to an array
 * 14. Get max server file size
 * 15. Delete visitors older than 24h, messages in trash older than 30 days. Archive conversation older than 24h with status code equal to 4 (pending user reply).
 * 16. Chat editor
 * 17. Return the position of the least occurence on left searching from right to left
 * 18. Verification cookie
 * 19. On Support Board close
 * 20. Check if dialogflow active
 * 21. Logs
 * 22. Webhook
 * 23. Add a cron job
 * 24. Run cron jobs
 * 25. Sanatize string
 * 26. Amazon S3
 * 27. Return the correct UTC timestamp
 * 28. Support Board error reporting
 *
 */

function sb_isset($array, $key, $default = false) {
    if (sb_is_error($array) || sb_is_validation_error($array)) {
        return $array;
    }
    return !empty($array) && isset($array[$key]) && $array[$key] !== '' ? $array[$key] : $default;
}

function sb_isset_num($value) {
    return $value != -1 && $value && !is_null($value) && !is_bool($value) && is_numeric($value);
}

function sb_defined($name, $default = -1) {
    return defined($name) ? constant($name) : $default;
}

function sb_encryption($string, $encrypt = true) {
    $output = false;
    $encrypt_method = 'AES-256-CBC';
    $secret_key = defined('SB_CLOUD_KEY') ? SB_CLOUD_KEY : sb_get_setting('envato-purchase-code', 'supportboard');
    $key = hash('sha256', $secret_key);
    $iv = substr(hash('sha256', 'supportboard_iv'), 0, 16);
    if ($encrypt) {
        $output = openssl_encrypt($string, $encrypt_method, $key, 0, $iv);
        $output = base64_encode($output);
        if (substr($output, -1) == '=')
            $output = substr($output, 0, -1);
    } else {
        $output = openssl_decrypt(base64_decode($string), $encrypt_method, $key, 0, $iv);
        if ($output === false && $secret_key != 'supportboard') {
            $output = openssl_decrypt(base64_decode($string), $encrypt_method, hash('sha256', 'supportboard'), 0, $iv);
        }
    }
    return $output;
}

function sb_string_slug($string, $action = 'slug') {
    $string = trim($string);
    if ($action == 'slug') {
        $string = str_replace(['\'', '"', ','], '', sb_sanatize_string($string));
        return strtolower(str_replace([' ', ' '], '-', $string)); // Do not delete double space (they are 2 different chars)
    } else if ($action == 'string') {
        return ucfirst(strtolower(str_replace(['-', '_'], ' ', $string)));
    }
    return $string;
}

function sb_curl($url, $post_fields = '', $header = [], $method = 'POST', $timeout = false) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'SB');
    switch ($method) {
        case 'DELETE':
        case 'PUT':
        case 'PATCH':
        case 'POST':
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($post_fields) ? $post_fields : (in_array('Content-Type: multipart/form-data', $header) ? $post_fields : http_build_query($post_fields)));
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout ? $timeout : 7);
            if ($method != 'POST') {
                curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            }
            break;
        case 'GET-SC':
        case 'GET':
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout ? $timeout : 70);
            curl_setopt($ch, CURLOPT_HEADER, false);
            break;
        case 'DOWNLOAD':
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout ? $timeout : 70);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            break;
        case 'FILE':
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout ? $timeout : 400);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            $path = sb_upload_path(false, true);
            if (!file_exists($path)) {
                mkdir($path, 0755, true);
            }
            if (strpos($url, '?')) {
                $url = substr($url, 0, strpos($url, '?'));
            }
            $basename = htmlspecialchars(sb_sanatize_string(basename($url)), ENT_NOQUOTES | ENT_SUBSTITUTE, 'utf-8');
            $extension = pathinfo($basename, PATHINFO_EXTENSION);
            if ($extension && !sb_is_allowed_extension($extension)) {
                return 'extension-not-allowed';
            }
            $file = fopen($path . '/' . $basename, 'wb');
            curl_setopt($ch, CURLOPT_FILE, $file);
            break;
        case 'UPLOAD':
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 300);
            curl_setopt($ch, CURLOPT_TIMEOUT, 400);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
            $header = array_merge($header, ['Content-Type: multipart/form-data']);
            break;
    }
    if (!empty($header)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $header);
    }
    $response = curl_exec($ch);
    $status_code = $method == 'GET-SC' ? curl_getinfo($ch, CURLINFO_HTTP_CODE) : false;
    if (curl_errno($ch) > 0) {
        $error = curl_error($ch);
        curl_close($ch);
        return $error;
    }
    curl_close($ch);
    switch ($method) {
        case 'UPLOAD':
        case 'PATCH':
        case 'POST':
            $response_json = json_decode($response, true);
            return JSON_ERROR_NONE !== json_last_error() ? $response : $response_json;
        case 'FILE':
            return sb_upload_path(true) . '/' . date('d-m-y') . '/' . basename($url);
        case 'GET-SC':
            return [$response, $status_code];
    }
    return $response;
}

function sb_download($url) {
    return sb_curl($url, '', '', 'DOWNLOAD');
}

function sb_download_file($url, $file_name = false, $mime = false, $header = [], $recursion = 0, $return_path = false) {
    $init = [$url, $file_name];
    $url = sb_curl($url, '', $header, 'FILE');
    $path_2 = false;
    $extension = pathinfo(basename($file_name ? $file_name : $url), PATHINFO_EXTENSION);
    if ($extension && !sb_is_allowed_extension($extension)) {
        return 'extension-not-allowed';
    }
    if ($file_name && !sb_is_error($url) && !empty($url)) {
        $date = date('d-m-y');
        $path = sb_upload_path() . '/' . $date;
        if ($mime) {
            $mime_types = [['image/gif', 'gif'], ['image/jpeg', 'jpg'], ['video/quicktime', 'mov'], ['video/mpeg', 'mp3'], ['application/pdf', 'pdf'], ['image/png', 'png'], ['image/x-png', 'png'], ['application/rtf', 'rtf'], ['text/plain', 'txt'], ['x-zip-compressed', 'zip'], ['video/mp4', 'mp4'], ['audio/mp4', 'mp4']];
            $mime = $mime === true ? mime_content_type($path . '/' . basename($url)) : $mime;
            for ($i = 0; $i < count($mime_types); $i++) {
                if ($mime == $mime_types[$i][0] && substr_compare($file_name, '.' . $mime_types[$i][1], -strlen('.' . $mime_types[$i][1])) !== 0) {
                    $file_name .= '.' . $mime_types[$i][1];
                    break;
                }
            }
        }
        $path_2 = $path . '/' . sb_string_slug($file_name);
        rename($path . '/' . basename($url), $path_2);
        if (!file_exists($path_2) && $recursion < 3) {
            return sb_download_file($init[0], $init[1], $mime, $header, $recursion + 1);
        }
        $url = sb_upload_path(true) . '/' . $date . '/' . $file_name;
        if (!$return_path && (sb_get_multi_setting('amazon-s3', 'amazon-s3-active') || defined('SB_CLOUD_AWS_S3'))) {
            $url_aws = sb_aws_s3($path_2);
            if (strpos($url_aws, 'http') === 0) {
                $url = $url_aws;
                unlink($path_2);
            }
        }
    }
    return $return_path ? $path_2 : $url;
}

function sb_is_allowed_extension($extension) {
    $extension = strtolower($extension);
    $allowed_extensions = ['aac', 'webm', 'oga', 'json', 'psd', 'ai', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'key', 'ppt', 'odt', 'xls', 'xlsx', 'zip', 'rar', 'mp3', 'm4a', 'ogg', 'wav', 'mp4', 'mov', 'wmv', 'avi', 'mpg', 'ogv', '3gp', '3g2', 'mkv', 'txt', 'ico', 'csv', 'ttf', 'font', 'css', 'scss'];
    return in_array($extension, $allowed_extensions) || (defined('SB_FILE_EXTENSIONS') && in_array($extension, SB_FILE_EXTENSIONS));
}

function sb_get($url, $json = false) {
    $response = sb_curl($url, '', '', 'GET');
    return $json ? json_decode($response, true) : $response;
}

function sb_csv($items, $header, $filename, $return_url = true) {
    $filename = rand(100000000, 99999999999) . '-' . $filename . '.csv';
    $file = fopen(sb_upload_path() . '/' . $filename, 'w');
    fprintf($file, chr(0xEF) . chr(0xBB) . chr(0xBF));
    if ($header) {
        fputcsv($file, $header);
    }
    for ($i = 0; $i < count($items); $i++) {
        fputcsv($file, $items[$i]);
    }
    fclose($file);
    return sb_upload_path($return_url) . '/' . $filename;
}

function sb_file($path, $content) {
    try {
        $file = fopen($path, 'w');
        fwrite($file, (substr($path, -4) == '.txt' ? "\xEF\xBB\xBF" : '') . $content);
        fclose($file);
        return true;
    } catch (Exception $e) {
        return $e->getMessage();
    }
}

function sb_file_delete($url_or_path) {
    $aws = (sb_get_multi_setting('amazon-s3', 'amazon-s3-active') || defined('SB_CLOUD_AWS_S3')) && (strpos($url_or_path, '.s3.') || strpos($url_or_path, 'amazonaws.com'));
    if ($aws) {
        return sb_aws_s3($url_or_path, 'DELETE');
    } else {
        $path = strpos($url_or_path, 'http') === 0 ? sb_upload_path() . str_replace(sb_upload_path(true), '', $url_or_path) : $url_or_path;
        if (file_exists($path)) {
            return unlink($path);
        }
    }
    return false;
}

function sb_debug($value) {
    $value = is_string($value) ? $value : json_encode($value);
    $path = __DIR__ . '/debug.txt';
    if (file_exists($path)) {
        $value = file_get_contents($path) . PHP_EOL . $value;
    }
    sb_file($path, $value);
}

function sb_json_array($json, $default = []) {
    if (is_string($json)) {
        $json = json_decode($json, true);
        return $json === false || $json === null ? $default : $json;
    } else {
        return $json;
    }
}

function sb_get_server_max_file_size() {
    $size = ini_get('post_max_size');
    if (empty($size)) {
        return 9999;
    }
    $suffix = strtoupper(substr($size, -1));
    $size = substr($size, 0, -1);
    if ($size === 0) {
        return 9999;
    }
    switch ($suffix) {
        case 'P':
            $size /= 1024;
        case 'T':
            $size /= 1024;
        case 'G':
            $size /= 1024;
        case 'K':
            $size *= 1024;
            break;
    }
    return $size;
}

function sb_clean_data() {
    $time_24h = gmdate('Y-m-d H:i:s', time() - 86400);
    $time_30d = gmdate('Y-m-d H:i:s', time() - 2592000);
    $ids = sb_db_get('SELECT id FROM sb_conversations WHERE status_code = 4 AND creation_time < "' . $time_30d . '"', false);
    sb_db_query('DELETE FROM sb_users WHERE user_type = "visitor" AND creation_time < "' . $time_24h . '"');
    for ($i = 0; $i < count($ids); $i++) {
        sb_delete_attachments($ids[$i]['id']);
    }
    sb_db_query('DELETE FROM sb_conversations WHERE status_code = 4 AND creation_time < "' . $time_30d . '"');
    if (sb_get_setting('admin-auto-archive')) {
        sb_db_query('UPDATE sb_conversations SET status_code = 3 WHERE (status_code = 1 OR status_code = 0) AND id IN (SELECT conversation_id FROM sb_messages WHERE id IN (SELECT max(id) FROM sb_messages GROUP BY conversation_id) AND creation_time < "' . $time_24h . '")');
    }
    return true;
}

function sb_component_editor($admin = false) {
    $enabled = [$admin || !sb_get_setting('disable-uploads'), !sb_get_setting('disable-voice-messages')];
    ?>
    <div class="sb-editor<?php echo !$enabled[0] || !$enabled[1] ? ' sb-disabled-' . (!$enabled[0] && !$enabled[1] ? '2' : '1') : '' ?>">
        <?php
        if ($admin) {
            echo '<div class="sb-labels"></div>';
        }
        ?>
        <div class="sb-textarea">
            <textarea placeholder="<?php sb_e('Write a message...') ?>"></textarea>
        </div>
        <div class="sb-attachments"></div>
        <?php
        $code = ($admin ? '<div class="sb-suggestions"></div>' : '') . '<div class="sb-bar"><div class="sb-bar-icons">';
        if ($enabled[0]) {
            $code .= '<div class="sb-btn-attachment" data-sb-tooltip="' . sb_('Attach a file') . '"></div>';
        }
        $code .= '<div class="sb-btn-saved-replies" data-sb-tooltip="' . sb_('Add a saved reply') . '"></div>';

        //LiveSmart code change start. Code added to integrate LiveSmart check user.
        $livesmart = sb_get_setting('livesmart-settings');
        if (isset($livesmart) && isset($livesmart['livesmart_url'])) {
            $lsRepUrl = (substr($livesmart['livesmart_url'], -1) == '/') ? $livesmart['livesmart_url'] : $livesmart['livesmart_url'] . '/';
            $active_user = sb_get_active_user();
            $tooltipLs = sb_('Start Video');
            $videoRequest = sb_('Request for a video chat');
            $code .=  '<div data-sb-tooltip="'. $tooltipLs .'">
                <svg id="livesmart_startvideo" xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 100 120"><path d="M72.9,14.4L56,25.3V22c0-4.4-3.6-8-8-8H8c-4.4,0-8,3.6-8,8v32c0,4.4,3.6,8,8,8h40c4.4,0,8-3.6,8-8v-3.3 l16.9,10.9c1.9,1,3.1-0.7,3.1-1.7V16C76,15,74.9,13.2,72.9,14.4z M52,54c0,2.2-1.8,4-4,4H8c-2.2,0-4-1.8-4-4V22c0-2.2,1.8-4,4-4h40 c2.2,0,4,1.8,4,4V54z M72,56.3L56,46V30l16-10.3V56.3z"/></svg>
            </div>
            <script>
                $("#livesmart_startvideo").click(function(event) {
                    var roomId = Math.random().toString(36).slice(2).substring(0, 15);
                    var str = {};
                    str.lsRepUrl = \''.$lsRepUrl.'\';
                    str.names = \'Chat agent\';
                    str.visitorName = \'' . $active_user['first_name'] . ' ' . $active_user['last_name'] . '\';
                    str.agentId = \'' . $active_user['email'] . '\';
                    var encodedString = window.btoa(unescape(encodeURIComponent(JSON.stringify(str))));
                    encodedString = encodedString.split(\'=\').join(\'\');
                    visitorUrl = str.lsRepUrl + roomId + \'&p=\' + encodedString;
                    str.isAdmin = 1;
                    encodedString = window.btoa(unescape(encodeURIComponent(JSON.stringify(str))));
                    encodedString = encodedString.split(\'=\').join(\'\');
                    agentUrl = str.lsRepUrl + roomId + \'&p=\' + encodedString;
                    window.open(visitorUrl);
                    var main = $(\'.sb-admin, .sb-chat, .sb-tickets\');
                    var chat_editor = main.find(\'.sb-editor\');
                    var chat_textarea = chat_editor.find(\'textarea\');
                    chat_textarea.val(\'' . $videoRequest . ': \' + agentUrl);
                    document.querySelector(\'.sb-submit\').click();
                });

            </script>';
        }
        //LiveSmart code change end.
        $code .= '<div class="sb-btn-emoji" data-sb-tooltip="' . sb_('Add an emoji') . '"></div>';
        if ($enabled[1]) {
            $code .= '<div class="sb-btn-audio-clip" data-sb-tooltip="' . sb_('Voice message') . '"></div>';
        }
        if ($admin && defined('SB_DIALOGFLOW') && sb_get_multi_setting('open-ai', 'open-ai-rewrite')) {
            $code .= '<div class="sb-btn-open-ai sb-icon-openai sb-btn-open-ai-editor" data-sb-tooltip="' . sb_('Rewrite') . '"></div>';
        }
        if ($admin && defined('SB_WOOCOMMERCE')) {
            $code .= '<div class="sb-btn-woocommerce" data-sb-tooltip="' . sb_('Add a product') . '"></div>';
        }
        echo $code . '</div><div class="sb-icon-send sb-submit" data-sb-tooltip="' . sb_('Send message') . '"></div><img class="sb-loader" src="' . SB_URL . '/media/loader.svg" alt="" /></div>';
        ?>
        <div class="sb-popup sb-emoji">
            <div class="sb-header">
                <div class="sb-select">
                    <p>
                        <?php sb_e('All') ?>
                    </p>
                    <ul>
                        <li data-value="all" class="sb-active">
                            <?php sb_e('All') ?>
                        </li>
                        <li data-value="Smileys">
                            <?php sb_e('Smileys & Emotions') ?>
                        </li>
                        <li data-value="People">
                            <?php sb_e('People & Body') ?>
                        </li>
                        <li data-value="Animals">
                            <?php sb_e('Animals & Nature') ?>
                        </li>
                        <li data-value="Food">
                            <?php sb_e('Food & Drink') ?>
                        </li>
                        <li data-value="Travel">
                            <?php sb_e('Travel & Places') ?>
                        </li>
                        <li data-value="Activities">
                            <?php sb_e('Activities') ?>
                        </li>
                        <li data-value="Objects">
                            <?php sb_e('Objects') ?>
                        </li>
                        <li data-value="Symbols">
                            <?php sb_e('Symbols') ?>
                        </li>
                    </ul>
                </div>
                <div class="sb-search-btn">
                    <i class="sb-icon sb-icon-search"></i>
                    <input type="text" placeholder="<?php sb_e('Search emoji...') ?>" />
                </div>
            </div>
            <div class="sb-emoji-list">
                <ul></ul>
            </div>
            <div class="sb-emoji-bar"></div>
        </div>
        <?php if ($admin) { ?>
            <div class="sb-popup sb-replies">
                <div class="sb-header">
                    <div class="sb-title">
                        <?php sb_e('Saved replies') ?>
                    </div>
                    <div class="sb-search-btn">
                        <i class="sb-icon sb-icon-search"></i>
                        <input type="text" autocomplete="false" placeholder="<?php sb_e(sb_get_multi_setting('google', 'google-project-id') ? 'Search replies and Intents...' : 'Search replies...') ?>" />
                    </div>
                </div>
                <div class="sb-replies-list sb-scroll-area">
                    <ul class="sb-loading"></ul>
                </div>
            </div>
            <?php
            if (defined('SB_WOOCOMMERCE')) {
                sb_woocommerce_products_popup();
            }
        } ?>
        <form class="sb-upload-form-editor" action="#" method="post" enctype="multipart/form-data">
            <input type="file" name="files[]" class="sb-upload-files" multiple />
        </form>
        <div id="sb-audio-clip">
            <div class="sb-icon sb-icon-close"></div>
            <div class="sb-audio-clip-cnt">
                <div class="sb-audio-clip-time"></div>
                <div class="sb-icon sb-icon-play sb-btn-clip-player"></div>
            </div>
            <div class="sb-icon sb-icon-pause sb-btn-mic"></div>
        </div>
    </div>
    <?php
    if (!$admin) {
        echo '<div class="sb-overlay-panel"><div></div><div></div></div>';
    }
}

function sb_strpos_reverse($string, $search, $offset) {
    return strrpos(substr($string, 0, $offset), $search);
}

function sb_mb_strpos_reverse($string, $search, $offset) {
    $index = mb_strrpos(mb_substr($string, 0, $offset), $search);
    return $index ? $index : $offset;
}

function sb_verification_cookie($code, $domain) {
    if ($code == 'auto')
        $code = sb_get_setting('en' . 'vato-purc' . 'hase-code');
    if (empty($code))
        return [false, ''];
    $response = sb_get('https://board.support/synch/verification.php?verification&code=' . $code . '&domain=' . $domain);
    if ($response == 'verification-success') {
        return [true, password_hash('VGCKME' . 'NS', PASSWORD_DEFAULT)];
    }
    return [false, sb_string_slug($response, 'string')];
}

function sb_on_close() {
    sb_set_agent_active_conversation(0);
    sb_reports_update('offline');
}

function sb_chatbot_active($check_dialogflow = true, $check_open_ai = true) {
    if (defined('SB_DIALOGFLOW')) {
        if ($check_dialogflow && $check_open_ai) {
            return sb_get_setting('dialogflow-active') || sb_get_multi_setting('google', 'dialogflow-active') || sb_get_multi_setting('open-ai', 'open-ai-active'); // Deprecated: sb_get_setting('dialogflow-active')
        }
        return (!$check_dialogflow || sb_get_setting('dialogflow-active') || sb_get_multi_setting('google', 'dialogflow-active')) && (!$check_open_ai || sb_get_multi_setting('open-ai', 'open-ai-active')); // Deprecated: sb_get_setting('dialogflow-active')
    }
    return false;
}

function sb_logs($string, $user = false) {
    if (sb_is_cloud()) {
        return false;
    }
    $string = date('d-m-Y H:i:s') . ' Agent ' . sb_get_user_name($user) . ' #' . ($user ? $user['id'] : sb_get_active_user_ID()) . ' ' . $string;
    $path = SB_PATH . '/log.txt';
    if (file_exists($path)) {
        $string = file_get_contents($path) . PHP_EOL . $string;
    }
    return sb_file($path, $string);
}

function sb_webhooks($function_name, $parameters) {
    $names = ['SBSMSSent' => 'sms-sent', 'SBLoginForm' => 'login', 'SBRegistrationForm' => 'registration', 'SBUserDeleted' => 'user-deleted', 'SBMessageSent' => 'message-sent', 'SBBotMessage' => 'bot-message', 'SBEmailSent' => 'email-sent', 'SBNewMessagesReceived' => 'new-message', 'SBNewConversationReceived' => 'new-conversation', 'SBNewConversationCreated' => 'new-conversation-created', 'SBActiveConversationStatusUpdated' => 'conversation-status-updated', 'SBSlackMessageSent' => 'slack-message-sent', 'SBMessageDeleted' => 'message-deleted', 'SBRichMessageSubmit' => 'rich-message', 'SBNewEmailAddress' => 'new-email-address'];
    $webhook_name = sb_isset($names, $function_name);
    if ($webhook_name) {
        $webhooks = sb_get_setting('webhooks');
        if ($webhooks && $webhooks['webhooks-url'] && $webhooks['webhooks-active']) {
            $allowed_webhooks = $webhooks['webhooks-allowed'];
            if ($allowed_webhooks && $allowed_webhooks !== true) {
                $allowed_webhooks = explode(',', str_replace(' ', '', $allowed_webhooks));
                if (!in_array($webhook_name, $allowed_webhooks)) {
                    return false;
                }
            }
            $query = json_encode(['function' => $webhook_name, 'key' => $webhooks['webhooks-key'], 'data' => $parameters, 'sender-url' => (isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '')]);
            if ($query) {
                return sb_curl($webhooks['webhooks-url'], $query, ['Content-Type: application/json', 'Content-Length: ' . strlen($query)]);
            } else {
                return sb_error('webhook-json-error');
            }
        } else {
            return new SBValidationError('webhook-not-active-or-empty-url');
        }
    } else {
        return new SBValidationError('webhook-not-found');
    }
}

function sb_cron_jobs_add($key, $content = false, $job_time = false) {

    // Add the job to the cron jobs
    $cron_functions = sb_get_external_setting('cron-functions');
    if (empty($cron_functions) || empty($cron_functions['value'])) {
        sb_save_external_setting('cron-functions', [$key]);
    } else {
        $cron_functions = json_decode($cron_functions['value'], true);
        if (!in_array($key, $cron_functions)) {
            array_push($cron_functions, $key);
            sb_db_query('UPDATE sb_settings SET value = \'' . sb_db_json_escape($cron_functions) . '\' WHERE name = "cron-functions"');
        }
    }

    // Set the cron job data
    if (!empty($content) && !empty($job_time)) {
        $user = sb_get_active_user();
        if ($user) {
            $key = 'cron-' . $key;
            $scheduled = sb_get_external_setting($key);
            if (empty($scheduled)) {
                $scheduled = [];
            }
            $scheduled[$user['id']] = [$content, strtotime('+' . $job_time)];
            sb_save_external_setting($key, $scheduled);
        }
    }
}

function sb_cron_jobs() {
    ignore_user_abort(true);
    set_time_limit(180);
    $now = date('H');
    $cron_functions = sb_get_external_setting('cron-functions');
    if (defined('SB_WOOCOMMERCE')) {
        sb_woocommerce_cron_jobs($cron_functions);
    }
    if (defined('SB_AECOMMERCE')) {
        sb_aecommerce_clean_carts();
    }
    sb_clean_data();
    sb_db_query('DELETE FROM sb_settings WHERE name="cron-functions"');
    sb_save_external_setting('cron', $now);
}

function sb_sanatize_string($value) {
    $value = str_ireplace(['<script', '</script'], ['&lt;script', '&lt;/script'], $value);
    return str_ireplace(['onload', 'javascript:', 'onclick', 'onerror', 'onmouseover', 'oncontextmenu', 'ondblclick', 'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseup', 'ontoggle'], '', $value);
}

function sb_sanatize_file_name($value) {
    return htmlspecialchars(str_ireplace(['\\', '/', ':', '?', '"', '*', '<', '>', '|'], '', sb_sanatize_string($value)), ENT_NOQUOTES | ENT_SUBSTITUTE, 'utf-8');
}

function sb_aws_s3($file_path, $action = 'PUT') {
    $settings = sb_get_setting('amazon-s3');
    if ((!$settings || empty($settings['amazon-s3-bucket-name'])) && defined('SB_CLOUD_AWS_S3')) {
        $settings = SB_CLOUD_AWS_S3;
    }
    if ($settings) {
        $recursion = 0;
        $put = $action == 'PUT';
        $host_name = $settings['amazon-s3-bucket-name'] . '.s3.amazonaws.com';
        $file = '';
        $timeout = false;
        if ($put) {
            $file_size = strlen($file);
            while ((!$file_size || $file_size < filesize($file_path)) && $recursion < 10) {
                $file = file_get_contents($file_path);
                $file_size = strlen($file);
                if ($recursion) {
                    sleep(1);
                }
                $recursion++;
            }
            $timeout = intval(filesize($file_path) / 1000000);
            $timeout = $timeout < 7 ? 7 : ($timeout > 300 ? 300 : $timeout);
        }
        $file_name = basename($file_path);
        $timestamp = gmdate('Ymd\THis\Z');
        $date = gmdate('Ymd');
        $request_headers = ['Content-Type' => $put ? mime_content_type($file_path) : '', 'Date' => $timestamp, 'Host' => $settings['amazon-s3-bucket-name'] . '.s3.amazonaws.com', 'x-amz-acl' => 'public-read', 'x-amz-content-sha256' => hash('sha256', $file)];
        ksort($request_headers);
        $canonical_headers = [];
        $signed_headers = [];
        foreach ($request_headers as $key => $value) {
            $canonical_headers[] = strtolower($key) . ':' . $value;
        }
        foreach ($request_headers as $key => $value) {
            $signed_headers[] = strtolower($key);
        }
        $canonical_headers = implode("\n", $canonical_headers);
        $signed_headers = implode(';', $signed_headers);
        $hashed_canonical_request = hash('sha256', implode("\n", [$action, '/' . $file_name, '', $canonical_headers, '', $signed_headers, hash('sha256', $file)]));
        $scope = [$date, $settings['amazon-s3-region'], 's3', 'aws4_request'];
        $string_to_sign = implode("\n", ['AWS4-HMAC-SHA256', $timestamp, implode('/', $scope), $hashed_canonical_request]);
        $kSecret = 'AWS4' . $settings['amazon-s3-secret-access-key'];
        $kDate = hash_hmac('sha256', $date, $kSecret, true);
        $kRegion = hash_hmac('sha256', $settings['amazon-s3-region'], $kDate, true);
        $kService = hash_hmac('sha256', 's3', $kRegion, true);
        $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
        $authorization = 'AWS4-HMAC-SHA256' . ' ' . implode(',', ['Credential=' . $settings['amazon-s3-access-key'] . '/' . implode('/', $scope), 'SignedHeaders=' . $signed_headers, 'Signature=' . hash_hmac('sha256', $string_to_sign, $kSigning)]);
        $curl_headers = ['Authorization: ' . $authorization];
        foreach ($request_headers as $key => $value) {
            $curl_headers[] = $key . ": " . $value;
        }
        $url = 'https://' . $host_name . '/' . $file_name;
        $response = sb_curl($url, $file, $curl_headers, $action, $timeout);
        return $response ? $response : $url;
    }
    return false;
}

function sb_get_timestamp($date_string) {
    $offset = (DateTime::createFromFormat('Y-m-d H:i:s', gmdate('Y-m-d H:i:s')))->getTimestamp() - time();
    return strtotime($date_string) - $offset;
}

function sb_error($error_code, $function_name, $message = '', $force = false) {
    $message = 'Support Board [' . $function_name . ']: ' . (is_string($message) ? $message : json_encode($message));
    if ($force || sb_isset($_GET, 'debug') || sb_isset($_POST, 'debug') || strpos(sb_isset($_SERVER, 'HTTP_REFERER'), 'debug')) {
        sb_debug($message);
        trigger_error($message);
    }
    return new SBError($error_code, $function_name, $message);
}

/*
 * -----------------------------------------------------------
 * REPORTS
 * -----------------------------------------------------------
 *
 * 1. Return the data of a report
 * 2. Update the values of a report
 * 3. Export the report in a CSV file
 *
 */

function sb_reports($report_name, $date_start = false, $date_end = false, $timezone = false) {
    $date = '';
    $data = [];
    $data_final = [];
    $title = '';
    $table = [sb_('Date'), sb_('Count')];
    $description = '';
    $period = [];
    $query = '';
    $time_range = true;
    $label_type = 1;
    $chart_type = 'line';

    // Set up date range
    if ($date_start) {
        $date_start = date('Y-m-d', strtotime(str_replace('/', '-', $date_start)));
        $date = 'A.creation_time >= "' . sb_db_escape($date_start) . ' 00:00"';
    }
    if ($date_end) {
        $date_end = date('Y-m-d', strtotime(str_replace('/', '-', $date_end)));
        $date .= ($date ? ' AND ' : '') . 'A.creation_time <= "' . sb_db_escape($date_end) . ' 23:59"';
    }

    // Get the sb_pa
    switch ($report_name) {
        case 'conversations':
            $query = 'SELECT A.creation_time FROM sb_conversations A, sb_users B WHERE B.id = A.user_id AND B.user_type <> "visitor"';
            $title = 'Conversations count';
            $description = 'Count of new conversations started by users.';
            break;
        case 'missed-conversations':
            $query = 'SELECT creation_time FROM sb_conversations A WHERE id NOT IN (SELECT conversation_id FROM sb_messages A, sb_users B WHERE A.user_id = B.id AND (B.user_type = "agent" OR B.user_type = "admin"))';
            $title = 'Missed conversations count';
            $description = 'Count of conversations without a reply from an human agent. Conversations with a reply from the bot are counted.';
            break;
        case 'conversations-time':
            $query = 'SELECT creation_time, conversation_id FROM sb_messages A';
            $title = 'Average conversations duration';
            $description = 'Average conversations duration. Messages sent more than 7 days after the previous message are counted as part of a new conversation.';
            $table = [sb_('Date'), sb_('Average time')];
            $label_type = 2;
            break;
        case 'visitors':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "visitors"';
            $title = 'Visitor registrations count';
            $description = 'Visitors count. Visitors are users who have not started any conversations and who are not registered.';
            break;
        case 'leads':
            $query = 'SELECT creation_time FROM sb_users A WHERE user_type = "lead"';
            $title = 'Lead registrations count';
            $description = 'Leads count. Leads are users who have started at least one conversation but who are not registered.';
            break;
        case 'users':
            $query = 'SELECT creation_time FROM sb_users A WHERE user_type = "user"';
            $title = 'User registrations count';
            $description = 'Users count. Users are registered with an email address.';
            break;
        case 'agents-response-time':
            $title = 'Average agent response time';
            $description = 'Average time for agents to send the first reply after the user sends the first message.';
            $table = [sb_('Agent name'), sb_('Average time')];
            $time_range = false;
            $chart_type = 'bar';
            $label_type = 2;
            break;
        case 'agents-availability':
            $title = 'Agent availability';
            $description = 'The average duration of an agent\'s online presence per day.';
            $table = [sb_('Agent name'), sb_('Average time')];
            $time_range = false;
            $label_type = 2;
            $rows = sb_db_get('SELECT B.id, B.first_name, B.last_name, B.department, A.value, A.creation_time FROM sb_reports A, sb_users B WHERE A.external_id = B.id AND B.id' . ($date ? ' AND ' . $date : '') . ' ORDER BY B.id', false);
            $current_rows = [];
            $seconds = 0;
            $days = 0;
            $count = count($rows);
            $current_agent_id = $count ? $rows[0]['id'] : 0;
            $utc_offset = 0;
            if ($timezone) {
                date_default_timezone_set($timezone);
                $utc_offset = date('Z');
            }
            for ($i = 0; $i < $count; $i++) {
                $row = $rows[$i];
                if ($seconds && (($i && $current_agent_id != $row['id']) || ($count > 1 && $count == $i + 1))) {
                    $seconds = intval($seconds / $days / 60);
                    $data[sb_get_user_name($rows[$i - 1])] = [$seconds, $current_rows, gmdate('H:i:s', $seconds)];
                    $seconds = 0;
                    $days = 0;
                    $current_rows = [];
                    $current_agent_id = $row['id'];
                } else {
                    $intervals = explode(' ', $row['value']);
                    $intervals_string = '';
                    for ($j = 0; $j < count($intervals); $j++) {
                        if (strpos($intervals[$j], '-')) {
                            $interval = explode('-', $intervals[$j]);
                            if ($interval[1] && is_numeric($interval[0]) && strlen($interval[1]) < 12) {
                                $seconds += intval($interval[1]) - intval($interval[0]);
                                $intervals_string .= gmdate('H:i:s', intval($interval[0]) + $utc_offset) . ' ' . sb_('To') . ' ' . gmdate('H:i:s', intval($interval[1]) + $utc_offset) . ', ';
                            }
                        }
                    }
                    $current_rows[$row['creation_time']] = $intervals_string ? substr($intervals_string, 0, -2) : '';
                    $days++;
                }
            }
            break;
        case 'agents-conversations':
            $title = 'Agent conversations count';
            $description = 'Number of conversations which at least one reply from the agent.';
            $table = [sb_('Agent name'), sb_('Count')];
            $chart_type = 'bar';
            $time_range = false;
            break;
        case 'agents-conversations-time':
            $query = 'SELECT creation_time, conversation_id FROM sb_messages A';
            $title = 'Average agent conversations duration';
            $description = 'Average conversations duration of each agent. Messages sent more than 7 days after the previous message are counted as part of a new conversation.';
            $table = [sb_('Agent name'), sb_('Average time')];
            $chart_type = 'bar';
            $label_type = 2;
            $time_range = false;
            break;
        case 'agents-ratings':
            $title = 'Agent ratings';
            $description = 'Ratings assigned to agents.';
            $table = [sb_('Agent name'), sb_('Ratings')];
            $chart_type = 'horizontalBar';
            $time_range = false;
            $label_type = 3;
            break;
        case 'countries':
            $title = 'User countries';
            $description = 'Countries of users who started at least one chat.';
            $table = [sb_('Country'), sb_('Count')];
            $time_range = false;
            $chart_type = 'pie';
            $label_type = 4;
            break;
        case 'languages':
            $title = 'User languages';
            $description = 'Languages of users who started at least one chat.';
            $table = [sb_('Language'), sb_('Count')];
            $time_range = false;
            $chart_type = 'pie';
            $label_type = 4;
            break;
        case 'browsers':
            $title = 'User browsers';
            $description = 'Browsers used by users who started at least one chat.';
            $table = [sb_('Browser'), sb_('Count')];
            $time_range = false;
            $chart_type = 'pie';
            $label_type = 4;
            break;
        case 'os':
            $title = 'User operating systems';
            $description = 'Operating systems used by users who started at least one chat.';
            $table = [sb_('Operating system'), sb_('Count')];
            $time_range = false;
            $chart_type = 'pie';
            $label_type = 4;
            break;
        case 'subscribe':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "subscribe"';
            $title = 'Subscribe emails count';
            $description = 'Number of users who registered their email via subscribe message.';
            break;
        case 'follow-up':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "follow-up"';
            $title = 'Follow-up emails count';
            $description = 'Number of users who registered their email via follow-up message.';
            break;
        case 'registrations':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "registrations"';
            $title = 'Registrations count';
            $description = 'Number of users who created an account via the registration form of the chat.';
            break;
        case 'articles-searches':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "articles-searches"';
            $title = 'Article searches';
            $description = 'Article searches made by users.';
            $table = [sb_('Date'), sb_('Search terms')];
            break;
        case 'articles-ratings':
            $query = 'SELECT value, extra FROM sb_reports A WHERE name = "article-ratings"';
            $title = 'Article ratings';
            $description = 'Ratings assigned to articles by users.';
            $table = [sb_('Article name'), sb_('Ratings')];
            $chart_type = 'horizontalBar';
            $time_range = false;
            $label_type = 3;
            break;
        case 'articles-views-single':
        case 'articles-views':
            $query = 'SELECT creation_time, value, extra FROM sb_reports A WHERE name = "articles-views"';
            $title = 'Article views';
            $description = 'Number of times articles have been viewed by users.';
            if ($report_name == 'articles-views-single') {
                $chart_type = 'horizontalBar';
                $time_range = false;
                $table = [sb_('Article'), sb_('Count')];
            }
            break;
        case 'sms-automations':
        case 'email-automations':
        case 'message-automations':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "' . $report_name . '"';
            $title = $description = sb_string_slug($report_name, 'string') . ' count';
            break;
        case 'direct-sms':
        case 'direct-emails':
        case 'direct-messages':
            $query = 'SELECT creation_time, value FROM sb_reports A WHERE name = "' . $report_name . '"';
            $name = $report_name == 'direct-emails' ? 'emails' : ($report_name == 'direct-messages' ? 'chat messages' : 'text messages');
            $title = 'Direct ' . $name;
            $description = 'Direct messages sent to users. The details column shows the first part of the message and the number of users to which it has been sent to.';
            $table = [sb_('Date'), sb_('Details')];
            break;
    }
    switch ($report_name) {
        case 'sms-automations':
        case 'email-automations':
        case 'message-automations':
        case 'registrations':
        case 'follow-up':
        case 'subscribe':
        case 'users':
        case 'leads':
        case 'visitors':
        case 'conversations':
        case 'missed-conversations':
            $rows = sb_db_get($query . ($date ? ' AND ' . $date : '') . ' ORDER BY STR_TO_DATE(A.creation_time, "%Y-%m-%d %T")', false);
            $sum = !in_array($report_name, ['visitors', 'subscribe', 'follow-up', 'registrations', 'message-automations', 'email-automations', 'sms-automations']);
            for ($i = 0; $i < count($rows); $i++) {
                $date_row = date('d/m/Y', strtotime($rows[$i]['creation_time']));
                $data[$date_row] = $sum ? [empty($data[$date_row]) ? 1 : $data[$date_row][0] + 1] : [$rows[$i]['value']];
            }
            break;
        case 'agents-conversations-time':
        case 'conversations-time':
            $rows = sb_db_get($query . ($date ? ' WHERE ' . $date : '') . ' ORDER BY STR_TO_DATE(creation_time, "%Y-%m-%d %T")', false);
            $count = count($rows);
            if ($count == 0) {
                return false;
            }
            $last_id = $rows[0]['conversation_id'];
            $first_time = $rows[0]['creation_time'];
            $times = [];
            $agents_times = $report_name == 'agents-conversations-time';
            for ($i = 1; $i < $count; $i++) {
                $time = $rows[$i]['creation_time'];
                if (($rows[$i]['conversation_id'] != $last_id) || (strtotime('+7 day', strtotime($first_time)) < strtotime($time))) {
                    $last_time = strtotime($rows[$i - 1]['creation_time']);
                    array_push($times, [$agents_times ? $last_id : date('d/m/Y', $last_time), $last_time - strtotime($first_time)]);
                    $first_time = $time;
                    $last_id = $rows[$i]['conversation_id'];
                }
            }
            if ($agents_times) {
                $agents_counts = [];
                $agents_conversations = [];
                $rows = sb_db_get('SELECT conversation_id, first_name, last_name FROM sb_messages A, sb_users B WHERE A.user_id = B.id AND (B.user_type = "agent" OR  B.user_type = "admin") GROUP BY conversation_id', false);
                for ($i = 0; $i < count($rows); $i++) {
                    $agents_conversations[$rows[$i]['conversation_id']] = sb_get_user_name($rows[$i]);
                }
                for ($i = 0; $i < count($times); $i++) {
                    if (isset($agents_conversations[$times[$i][0]])) {
                        $name = $agents_conversations[$times[$i][0]];
                        $data[$name] = empty($data[$name]) ? $times[$i][1] : $data[$name] + $times[$i][1];
                        $agents_counts[$name] = empty($agents_counts[$name]) ? 1 : $agents_counts[$name] + 1;
                    }
                }
                foreach ($data as $key => $value) {
                    $data[$key] = [intval($value / $agents_counts[$key]), gmdate('H:i:s', $value / $agents_counts[$key])];
                }
            } else {
                for ($i = 0; $i < count($times); $i++) {
                    $time = $times[$i][0];
                    $count = 0;
                    $sum = 0;
                    if (!isset($data[$time])) {
                        for ($y = 0; $y < count($times); $y++) {
                            if ($times[$y][0] == $time) {
                                $sum += $times[$y][1];
                                $count++;
                            }
                        }
                        $data[$time] = [intval($sum / $count), gmdate('H:i:s', $sum / $count)];
                    }
                }
            }
            break;
        case 'agents-conversations':
            $rows = sb_db_get('SELECT first_name, last_name FROM sb_messages A, sb_users B WHERE A.user_id = B.id AND (B.user_type = "agent" OR  B.user_type = "admin") ' . ($date ? ' AND ' . $date : '') . ' GROUP BY conversation_id, B.id', false);
            for ($i = 0; $i < count($rows); $i++) {
                $name = sb_get_user_name($rows[$i]);
                $data[$name] = [empty($data[$name]) ? 1 : $data[$name][0] + 1];
            }
            break;
        case 'agents-response-time':
            $conversations = sb_db_get('SELECT A.user_id, B.user_type, A.conversation_id, A.creation_time FROM sb_messages A, sb_users B WHERE B.id = A.user_id AND A.conversation_id IN (SELECT conversation_id FROM sb_messages A WHERE user_id IN (SELECT id FROM sb_users WHERE user_type = "agent" OR user_type = "admin") ' . ($date ? ' AND ' . $date : '') . ') ORDER BY A.conversation_id, STR_TO_DATE(A.creation_time, "%Y-%m-%d %T")', false);
            $count = count($conversations);
            if ($count == 0) {
                return false;
            }
            $agents = [];
            $active_conversation = $conversations[0];
            $skip = false;
            $agents_ids = '';
            for ($i = 1; $i < $count; $i++) {
                if ($skip) {
                    if ($active_conversation['conversation_id'] != $conversations[$i]['conversation_id']) {
                        $active_conversation = $conversations[$i];
                        $skip = false;
                    }
                    continue;
                }
                if (sb_is_agent($conversations[$i], true)) {
                    $conversation_time = strtotime($conversations[$i]['creation_time']) - strtotime($active_conversation['creation_time']);
                    $agent_id = $conversations[$i]['user_id'];
                    if (!isset($agents[$agent_id])) {
                        $agents[$agent_id] = [];
                        $agents_ids .= $agent_id . ',';
                    }
                    array_push($agents[$agent_id], $conversation_time);
                    $skip = true;
                }
            }
            $rows = sb_db_get('SELECT id, first_name, last_name FROM sb_users WHERE id IN (' . substr($agents_ids, 0, -1) . ')', false);
            $agent_names = [];
            for ($i = 0; $i < count($rows); $i++) {
                $agent_names[$rows[$i]['id']] = sb_get_user_name($rows[$i]);
            }
            foreach ($agents as $key => $times) {
                $sum = 0;
                $count = count($times);
                for ($i = 0; $i < $count; $i++) {
                    $sum += $times[$i];
                }
                $data[$agent_names[$key]] = [intval($sum / $count), gmdate('H:i:s', $sum / $count)];
            }
            break;
        case 'articles-ratings':
        case 'agents-ratings':
            $article = $report_name == 'articles-ratings';
            $ratings = $article ? sb_db_get($query, false) : sb_get_external_setting('ratings');
            if ($ratings) {
                $rows = $article ? sb_get_articles() : sb_db_get('SELECT id, first_name, last_name FROM sb_users WHERE user_type = "agent" OR user_type = "admin"', false);
                $items = [];
                for ($i = 0; $i < count($rows); $i++) {
                    $items[$rows[$i]['id']] = $article ? $rows[$i]['title'] : sb_get_user_name($rows[$i]);
                }
                if ($article) {
                    for ($i = 0; $i < count($ratings); $i++) {
                        $rating = $ratings[$i];
                        if (isset($rating['extra'])) {
                            $id = $rating['extra'];
                            if (isset($items[$id]) && !empty($rating['value'])) {
                                $article_ratings = json_decode($rating['value']);
                                $positives = 0;
                                $negatives = 0;
                                $name = strlen($items[$id]) > 40 ? substr($items[$id], 0, 40) . '...' : $items[$id];
                                for ($y = 0; $y < count($article_ratings); $y++) {
                                    $positives += $article_ratings[$y] == 1 ? 1 : 0;
                                    $negatives += $article_ratings[$y] == 1 ? 0 : 1;
                                }
                                $data[$name] = [$positives, $negatives];
                            }
                        }
                    }
                } else {
                    foreach ($ratings as $rating) {
                        if (isset($rating['agent_id'])) {
                            $id = $rating['agent_id'];
                            if (isset($items[$id])) {
                                $positive = $rating['rating'] == 1 ? 1 : 0;
                                $negative = $rating['rating'] == 1 ? 0 : 1;
                                $name = $items[$id];
                                $data[$name] = isset($data[$name]) ? [$data[$name][0] + $positive, $data[$name][1] + $negative] : [$positive, $negative];
                            }
                        }
                    }
                }
                foreach ($data as $key => $value) {
                    $positive = $value[0];
                    $negative = $value[1];
                    $average = round($positive / ($negative + $positive) * 100, 2);
                    $data[$key] = [$average, '<i class="sb-icon-like"></i>' . $positive . ' (' . $average . '%) <i class="sb-icon-dislike"></i>' . $negative];
                }
            }
            break;
        case 'articles-views':
        case 'articles-views-single':
            $rows = sb_db_get($query . ($date ? ' AND ' . $date : '') . ' ORDER BY STR_TO_DATE(A.creation_time, "%Y-%m-%d %T")', false);
            $single = $report_name == 'articles-views-single';
            for ($i = 0; $i < count($rows); $i++) {
                $date_row = $single ? $rows[$i]['extra'] : date('d/m/Y', strtotime($rows[$i]['creation_time']));
                $data[$date_row] = [intval($rows[$i]['value']) + (empty($data[$date_row]) ? 0 : $data[$date_row][0])];
            }
            if ($single) {
                $articles = sb_get_articles();
                $data_names = [];
                for ($i = 0; $i < count($articles); $i++) {
                    $id = sb_isset($articles[$i], 'id');
                    if ($id && isset($data[$id])) {
                        $article_title = $articles[$i]['title'];
                        $data_names[strlen($article_title) > 40 ? substr($article_title, 0, 40) . '...' : $article_title] = $data[$id];
                    }
                }
                $data = $data_names;
            }
            break;
        case 'os':
        case 'browsers':
        case 'languages':
        case 'countries':
            $field = 'location';
            $is_languages = $report_name == 'languages';
            $is_browser = $report_name == 'browsers';
            $is_os = $report_name == 'os';
            $is_country = $report_name == 'countries';
            if ($is_languages) {
                $field = 'browser_language';
            } else if ($is_browser) {
                $field = 'browser';
            } else if ($is_os) {
                $field = 'os';
            }
            $language_codes = json_decode(file_get_contents(SB_PATH . '/resources/languages/language-codes.json'), true);
            $country_codes = $is_country ? json_decode(file_get_contents(SB_PATH . '/resources/json/countries.json'), true) : false;
            $rows = sb_db_get('SELECT value FROM sb_users_data WHERE slug = "' . $field . '" AND user_id IN (SELECT id FROM sb_users A WHERE (user_type = "lead" OR user_type = "user")' . ($date ? ' AND ' . $date : '') . ')', false);
            $total = 0;
            $flags = [];
            for ($i = 0; $i < count($rows); $i++) {
                $value = $rows[$i]['value'];
                $valid = false;
                if ($is_country && strpos($value, ',')) {
                    $value = trim(substr($value, strpos($value, ',') + 1));
                    $valid = true;
                }
                if (($is_languages && isset($language_codes[strtolower($value)])) || ($is_country && isset($country_codes[strtoupper($value)]))) {
                    $code = strtolower($is_languages ? $value : $country_codes[strtoupper($value)]);
                    $value = $language_codes[$code];
                    if (!isset($flags[$value]) && file_exists(SB_PATH . '/media/flags/' . $code . '.png')) {
                        $flags[$value] = $code;
                    }
                    $valid = true;
                }
                if ($valid || $is_browser || $is_os) {
                    $data[$value] = empty($data[$value]) ? 1 : $data[$value] + 1;
                    $total++;
                }
            }
            arsort($data);
            foreach ($data as $key => $value) {
                $image = '';
                if (isset($flags[$key]))
                    $image = '<img class="sb-flag" src="' . SB_URL . '/media/flags/' . $flags[$key] . '.png" />';
                if ($is_browser) {
                    $lowercase = strtolower($key);
                    if (strpos($lowercase, 'chrome') !== false) {
                        $image = 'chrome';
                    } else if (strpos($lowercase, 'edge') !== false) {
                        $image = 'edge';
                    } else if (strpos($lowercase, 'firefox') !== false) {
                        $image = 'firefox';
                    } else if (strpos($lowercase, 'opera') !== false) {
                        $image = 'opera';
                    } else if (strpos($lowercase, 'safari') !== false) {
                        $image = 'safari';
                    }
                    if ($image)
                        $image = '<img src="' . SB_URL . '/media/devices/' . $image . '.svg" />';
                }
                if ($is_os) {
                    $lowercase = strtolower($key);
                    if (strpos($lowercase, 'windows') !== false) {
                        $image = 'windows';
                    } else if (strpos($lowercase, 'mac') !== false || strpos($lowercase, 'apple') !== false || strpos($lowercase, 'ipad') !== false || strpos($lowercase, 'iphone') !== false) {
                        $image = 'apple';
                    } else if (strpos($lowercase, 'android') !== false) {
                        $image = 'android';
                    } else if (strpos($lowercase, 'linux') !== false) {
                        $image = 'linux';
                    } else if (strpos($lowercase, 'ubuntu') !== false) {
                        $image = 'ubuntu';
                    }
                    if ($image)
                        $image = '<img src="' . SB_URL . '/media/devices/' . $image . '.svg" />';
                }
                $data[$key] = [$value, $image . $value . ' (' . round($value / $total * 100, 2) . '%)'];
            }
            break;
        case 'direct-sms':
        case 'direct-emails':
        case 'direct-messages':
        case 'articles-searches':
            $rows = sb_db_get($query . ($date ? ' AND ' . $date : '') . ' ORDER BY STR_TO_DATE(A.creation_time, "%Y-%m-%d %T")', false);
            for ($i = 0; $i < count($rows); $i++) {
                $date_row = date('d/m/Y', strtotime($rows[$i]['creation_time']));
                $search = '<div>' . $rows[$i]['value'] . '</div>';
                $data[$date_row] = empty($data[$date_row]) ? [1, $search] : [$data[$date_row][0] + 1, $data[$date_row][1] . $search];
            }
            break;
    }

    // Generate all days, months, years within the date range
    if (!count($data)) {
        return false;
    }
    if ($time_range) {
        if (!$date_start) {
            $date_start = date('Y-m-d', strtotime(str_replace('/', '-', array_keys($data)[0])));
        }
        if (!$date_end) {
            $date_end = date('Y-m-d', strtotime(str_replace('/', '-', array_keys($data)[count($data) - 1])));
        }
        if ($timezone) {
            date_default_timezone_set($timezone);
        }
        $period = new DatePeriod(new DateTime($date_start), new DateInterval('P1D'), new DateTime(date('Y-m-d', strtotime($date_end . '+1 days'))));
        $period = iterator_to_array($period);
        $period_count = count($period);
        $date_format = $period_count > 730 ? 'Y' : ($period_count > 62 ? 'm/Y' : 'd/m/Y');
        $is_array = count(reset($data)) > 1;
        $counts = [];
        $average = $label_type == 2;
        for ($i = 0; $i < $period_count; $i++) {
            $key = $period[$i]->format($date_format);
            $key_original = $period[$i]->format('d/m/Y');
            $value = empty($data[$key_original]) ? 0 : $data[$key_original][0];
            $data_final[$key] = [empty($data_final[$key]) ? $value : $data_final[$key][0] + $value];
            if ($average) {
                $counts[$key] = empty($counts[$key]) ? 1 : $counts[$key] + 1;
            }
            if ($is_array) {
                array_push($data_final[$key], empty($data[$key_original][1]) ? '' : $data[$key_original][1]);
            }
        }
        if ($average && $period_count > 62) {
            foreach ($data_final as $key => $value) {
                $data_final[$key] = [intval($value[0] / $counts[$key]), gmdate('H:i:s', $value[0] / $counts[$key])];
            }
        }
    } else {
        $data_final = $data;
    }

    // Return the data
    return ['title' => sb_($title), 'description' => sb_($description), 'data' => $data_final, 'table' => $table, 'table-inverse' => $time_range, 'label_type' => $label_type, 'chart_type' => $chart_type];
}

function sb_reports_update($name, $value = false, $external_id = false, $extra = false) {
    if (sb_get_multi_setting('performance', 'performance-reports')) {
        return false;
    }
    $now = gmdate('Y-m-d');
    $name = sb_db_escape($name);
    $extra = sb_db_escape($extra);
    switch ($name) {
        case 'direct-sms':
        case 'direct-emails':
        case 'direct-messages':
        case 'articles-searches':
            return sb_db_query('INSERT INTO sb_reports (name, value, creation_time, external_id, extra) VALUES ("' . $name . '", "' . sb_db_escape($value) . '", "' . $now . '", NULL, NULL)');
        case 'articles-views':
            $where = ' WHERE name = "articles-views" AND extra = "' . $extra . '" AND creation_time = "' . $now . '"';
            $count = sb_db_get('SELECT value FROM sb_reports' . $where . ' LIMIT 1');
            return sb_db_query(empty($count) ? 'INSERT INTO sb_reports (name, value, creation_time, external_id, extra) VALUES ("' . $name . '", 1, "' . $now . '", NULL, "' . $extra . '")' : 'UPDATE sb_reports SET value = ' . (intval($count['value']) + 1) . $where);
        case 'online':
        case 'offline':
            if (!sb_get_active_user()) {
                return false;
            }
            $is_online = $name == 'online';
            $where = ' WHERE name = "availability" AND external_id = "' . sb_get_active_user_ID() . '" AND creation_time = "' . $now . '"';
            $value_db = sb_isset(sb_db_get('SELECT value FROM sb_reports' . $where . ' LIMIT 1'), 'value');
            $last_char = substr($value_db, -1);
            if (($last_char == '-' && $is_online) || (!$value_db && !$is_online)) {
                return false;
            }
            $value = time() . ($is_online ? '-' : '');
            return sb_db_query(empty($value_db) ? 'INSERT INTO sb_reports (name, value, creation_time, external_id, extra) VALUES ("availability", "' . sb_db_escape($value) . '", "' . $now . '", ' . sb_get_active_user_ID() . ', NULL)' : 'UPDATE sb_reports SET value = "' . sb_db_escape($value_db) . ($is_online || ($last_char && $last_char != '-') ? ' ' : '') . $value . '"' . $where);
        default:
            $where = ' WHERE name = "' . $name . '" AND creation_time = "' . $now . '"';
            $count = sb_db_get('SELECT value FROM sb_reports' . $where . ' LIMIT 1');
            return sb_db_query(empty($count) ? 'INSERT INTO sb_reports (name, value, creation_time, external_id, extra) VALUES ("' . $name . '", 1, "' . $now . '", ' . ($external_id === false ? 'NULL' : '"' . $external_id . '"') . ', ' . ($extra === false ? 'NULL' : '"' . $extra . '"') . ')' : 'UPDATE sb_reports SET value = ' . (intval($count['value']) + 1) . $where);
    }
}

function sb_reports_export($report_name, $date_start = false, $date_end = false, $timezone = false) {
    if ($timezone) {
        date_default_timezone_set($timezone);
    }
    $response = sb_reports($report_name, $date_start, $date_end, $timezone);
    if ($response) {
        $data = sb_isset($response, 'data', []);
        $rows = [];
        if ($report_name == 'agents-ratings') {
            $response['table'] = [$response['table'][0], sb_('Positive'), sb_('Positive percentage'), sb_('Negative')];
            foreach ($data as $key => $value) {
                $ratings = explode('<i class="sb-icon-dislike"></i>', $value[1]);
                $ratings[0] = str_replace('<i class="sb-icon-like"></i>', '', $ratings[0]);
                $ratings[0] = substr($ratings[0], 0, strpos($ratings[0], '('));
                array_push($rows, [$key, $ratings[0], $value[0], $ratings[1]]);
            }
        } else if ($report_name == 'agents-availability') {
            $response['table'] = [$response['table'][0], sb_('Date'), sb_('Intervals')];
            foreach ($data as $key => $value) {
                foreach ($value[1] as $date => $intervals) {
                    array_push($rows, [$key, $date, $intervals]);
                }
            }
        } else {
            foreach ($data as $key => $value) {
                $value = $value[count($value) - 1];
                if (strpos($value, ' />')) {
                    $value = substr($value, strpos($value, '/>') + 2);
                }
                array_push($rows, [$key, $value]);
            }
        }
        return sb_csv($rows, $response['table'], 'report-' . rand(100000, 999999999));
    }
    return false;
}

/*
 * -----------------------------------------------------------
 * AUTOMATIONS
 * -----------------------------------------------------------
 *
 * 1. Get all automations
 * 2. Save all automations
 * 3. Run all valid automations and return the ones which need client-side validations
 * 4. Check if an automation is valid and can be executed
 * 5. Execute an automation
 *
 */

function sb_automations_get() {
    $types = ['messages', 'emails', 'sms', 'popups', 'design', 'more'];
    $automations = sb_get_external_setting('automations', []);
    $translations = [];
    $rows = sb_db_get('SELECT name, value FROM sb_settings WHERE name LIKE "automations-translations-%"', false);
    for ($i = 0; $i < count($rows); $i++) {
        $translations[substr($rows[$i]['name'], -2)] = json_decode($rows[$i]['value'], true);
    }
    for ($i = 0; $i < count($types); $i++) {
        if (!$automations || !isset($automations[$types[$i]]))
            $automations[$types[$i]] = [];
    }
    return [$automations, $translations];
}

function sb_automations_save($automations, $translations = false) {
    if ($translations) {
        $db = '';
        foreach ($translations as $key => $value) {
            $name = 'automations-translations-' . $key;
            sb_save_external_setting($name, $value);
            $db .= '"' . $name . '",';
        }
        sb_db_query('DELETE FROM sb_settings WHERE name LIKE "automations-translations-%" AND name NOT IN (' . substr($db, 0, -1) . ')');
    }
    return sb_save_external_setting('automations', empty($automations) ? [] : $automations);
}

function sb_automations_run_all() {
    if (sb_is_agent()) {
        return false;
    }
    $response = [];
    $automations_all = sb_automations_get();
    $user_language = sb_get_user_language();
    foreach ($automations_all[0] as $type => $automations) {
        for ($i = 0; $i < count($automations); $i++) {
            $automations[$i]['type'] = $type;
            $validation = sb_automations_validate($automations[$i]);
            if ($validation) {
                $automation_id = $automations[$i]['id'];
                $conditions = $validation['conditions'];

                // Translations
                if ($user_language && isset($automations_all[1][$user_language])) {
                    $translations = sb_isset($automations_all[1][$user_language], $type, []);
                    for ($x = 0; $x < count($translations); $x++) {
                        if ($translations[$x]['id'] == $automation_id) {
                            $automations[$i] = $translations[$x];
                            $automations[$i]['type'] = $type;
                            break;
                        }
                    }
                }
                if ($validation['repeat_id']) {
                    $automations[$i]['repeat_id'] = $validation['repeat_id'];
                }
                if (count($conditions) || $type == 'popups' || $type == 'design' || $type == 'more' || !sb_get_active_user()) {

                    // Automation with client-side conditions, server-side invalid conditions, or popup, design
                    $automations[$i]['conditions'] = $conditions;
                    array_push($response, $automations[$i]);
                } else {

                    // Run automation
                    sb_automations_run($automations[$i]);
                }
            }
        }
    }
    return $response;
}

function sb_automations_validate($automation) {
    $conditions = sb_isset($automation, 'conditions', []);
    $invalid_conditions = [];
    $repeat_id = false;
    $valid = false;
    $active_user = sb_get_active_user();
    $active_user_id = sb_isset($active_user, 'id');
    for ($i = 0; $i < count($conditions); $i++) {
        $valid = false;
        $criteria = $conditions[$i][1];
        switch ($conditions[$i][0]) {
            case 'datetime':
                $now = time();
                $offset = intval(sb_get_setting('timetable-utc', 0)) * 3600;
                if ($criteria == 'is-between') {
                    $dates = explode(' - ', $conditions[$i][2]);
                    if (count($dates) == 2) {
                        $unix = date_timestamp_get(DateTime::createFromFormat('d/m/Y H:i', $dates[0] . (strpos($dates[0], ':') ? '' : ' 00:00'))) + (strpos($dates[0], ':') ? $offset : 0);
                        $unix_end = date_timestamp_get(DateTime::createFromFormat('d/m/Y H:i', $dates[1] . (strpos($dates[1], ':') ? '' : ' 23:59'))) + (strpos($dates[1], ':') ? $offset : 0);
                        $valid = ($now >= $unix) && ($now <= $unix_end);
                        $continue = true;
                    }
                } else if ($criteria == 'is-exactly') {
                    $is_time = strpos($conditions[$i][2], ':');
                    $unix = date_timestamp_get(DateTime::createFromFormat('d/m/Y H:i', $conditions[$i][2] . ($is_time ? '' : ' 00:00'))) + $offset;
                    $valid = $now == $unix || (!$is_time && $now > $unix && $now < $unix + 86400);
                }
                if (!$valid) {
                    for ($j = 0; $j < count($conditions); $j++) {
                        if ($conditions[$j][0] == 'repeat') {
                            $condition = $conditions[$j][1];
                            if ($criteria == 'is-between' && $continue) {
                                $hhmm = false;
                                $hhmm_end = false;
                                if (strpos($dates[0], ':') && strpos($dates[1], ':')) {
                                    $hhmm = strtotime(date('Y-m-d ' . explode(' ', $dates[0])[1])) + $offset;
                                    $hhmm_end = strtotime(date('Y-m-d ' . explode(' ', $dates[1])[1])) + $offset;
                                }
                                if ($condition == 'every-day') {
                                    $valid = $hhmm ? ($now >= $hhmm) && ($now <= $hhmm_end) : true;
                                    $repeat_id = $valid ? date('z') : false;
                                } else {
                                    $letter = $condition == 'every-week' ? 'w' : ($condition == 'every-month' ? 'd' : 'z');
                                    $letter_value_now = date($letter);
                                    $letter_value_unix = date($letter, $unix);
                                    $letter_value_unix_end = date($letter, $unix_end);
                                    if ($letter == 'z') {
                                        $letter_value_now -= date('L');
                                        $letter_value_unix -= date('L', $unix);
                                        $letter_value_unix_end -= date('L', $unix_end);
                                    }
                                    $valid = ($letter_value_now >= $letter_value_unix) && (date($letter, strtotime('+' . ($letter_value_unix_end - $letter_value_unix - (($letter_value_now >= $letter_value_unix) && ($letter_value_now <= $letter_value_unix_end) ? $letter_value_now - $letter_value_unix : 0)) . ' days')) <= $letter_value_unix_end);
                                    if ($valid && $hhmm)
                                        $valid = ($now >= $hhmm) && ($now <= $hhmm_end);
                                    $repeat_id = $valid ? $letter_value_now : false;
                                }
                            } else if ($criteria == 'is-exactly') {
                                if ($condition == 'every-day') {
                                    $valid = true;
                                    $repeat_id = date('z');
                                } else {
                                    $letter = $condition == 'every-week' ? 'w' : ($condition == 'every-month' ? 'd' : 'z');
                                    $valid = $letter == 'z' ? ((date($letter, $unix) - date('L', $unix)) == (date($letter) - date('L'))) : (date($letter, $unix) == date($letter));
                                    $repeat_id = $valid ? date($letter) : false;
                                }
                            }
                            break;
                        }
                    }
                }
                break;
            case 'include_urls':
            case 'exclude_urls':
                $url = str_replace(['https://', 'http://', 'www.'], '', sb_isset($_POST, 'current_url', $_SERVER['HTTP_REFERER']));
                $checks = explode(',', $conditions[$i][2]);
                $include = $conditions[$i][0] == 'include_urls';
                if (!$include)
                    $valid = true;
                for ($j = 0; $j < count($checks); $j++) {
                    $checks[$j] = trim(str_replace(['https://', 'http://', 'www.'], '', $checks[$j]));
                    if (($criteria == 'contains' && strpos($url . '/', $checks[$j]) !== false) || ($criteria == 'does-not-contain' && strpos($url, $checks[$j]) === false) || ($criteria == 'is-exactly' && $checks[$j] == $url) || ($criteria == 'is-not' && $checks[$j] != $url)) {
                        $valid = $include;
                        break;
                    }
                }
                break;
            case 'user_type':
                if ($active_user) {
                    $user_type = sb_isset($active_user, 'user_type');
                    $valid = ($criteria == 'is-visitor' && $user_type == 'visitor') || ($criteria == 'is-lead' && $user_type == 'is-lead') || ($criteria == 'is-user' && $user_type == 'user') || ($criteria == 'is-not-visitor' && $user_type != 'visitor') || ($criteria == 'is-not-lead' && $user_type != 'lead') || ($criteria == 'is-not-user' && $user_type != 'user');
                } else {
                    $valid = true;
                    array_push($invalid_conditions, $conditions[$i]);
                }
                break;
            case 'cities':
            case 'languages':
            case 'countries':
                if ($active_user) {
                    if ($conditions[$i][0] == 'languages') {
                        $user_value = sb_get_user_extra($active_user_id, 'language');
                        if (!$user_value) {
                            $user_value = sb_get_user_extra($active_user_id, 'browser_language');
                            if (strlen($user_value) > 2) {
                                $user_value = sb_language_code($user_value);
                            }
                        }
                    } else if ($conditions[$i][0] == 'cities') {
                        $user_value = sb_get_user_extra($active_user_id, 'location');
                        if ($user_value) {
                            $user_value = substr($user_value, 0, strpos($user_value, ','));
                        } else {
                            $user_value = sb_get_user_extra($active_user_id, 'city');
                        }
                    } else {
                        $user_value = sb_get_user_extra($active_user_id, 'country_code');
                        if (!$user_value) {
                            $user_value = sb_get_user_extra($active_user_id, 'country');
                            if (!$user_value) {
                                $user_value = sb_get_user_extra($active_user_id, 'location');
                                if ($user_value) {
                                    $user_value = trim(substr($user_value, strpos($user_value, ',')));
                                }
                            }
                            if ($user_value) {
                                $countries = json_decode(file_get_contents(SB_PATH . '/resources/json/countries.json'), true);
                                if (isset($countries[$user_value])) {
                                    $user_value = $countries[$user_value];
                                } else if (strlen($user_value) > 2) {
                                    $user_value = substr($user_value, 0, 2);
                                }
                            }
                        }
                    }
                    if ($user_value) {
                        $user_value = strtolower(trim($user_value));
                        $condition_values = explode(',', $criteria);
                        for ($j = 0; $j < count($condition_values); $j++) {
                            if (strtolower(trim($condition_values[$j])) == $user_value) {
                                $valid = true;
                                break;
                            }
                        }
                    }
                } else {
                    $valid = true;
                    array_push($invalid_conditions, $conditions[$i]);
                }
                break;
            case 'returning_visitor':
                $is_first_visitor = $criteria == 'first-time-visitor';
                if ($active_user) {
                    $times = sb_db_get('SELECT creation_time, last_activity FROM sb_users WHERE id = ' . $active_user_id);
                    if ($times) {
                        $difference = strtotime($times['last_activity']) - strtotime($times['creation_time']);
                        $valid = $is_first_visitor ? $difference < 86400 : $difference > 86400;
                    }
                } else if ($is_first_visitor) {
                    $valid = true;
                }
                break;
            case 'repeat':
                $valid = true;
                break;
            default:
                $valid = true;
                array_push($invalid_conditions, $conditions[$i]);
                break;
        }
        if (!$valid)
            break;
    }
    if ($valid && !sb_automations_is_sent($active_user_id, $automation, $repeat_id)) {

        // Check user details conditions
        if ($automation['type'] == 'emails' && (!$active_user || empty($active_user['email']))) {
            array_push($invalid_conditions, ['user_email']);
        } else if ($automation['type'] == 'sms' && !sb_get_user_extra($active_user_id, 'phone')) {
            array_push($invalid_conditions, ['user_phone']);
        }

        // Return the result
        return ['conditions' => $invalid_conditions, 'repeat_id' => $repeat_id];
    }
    return false;
}

function sb_automations_run($automation, $validate = false) {
    $active_user = sb_get_active_user();
    $response = false;
    if ($validate) {
        $validation = sb_automations_validate($automation);
        if (!$validation || count($validation['conditions']) > 0) {
            return false;
        }
    }
    if ($active_user) {
        $active_user_id = $active_user['id'];
        if (sb_automations_is_sent($active_user_id, $automation)) {
            return false;
        }
        switch ($automation['type']) {
            case 'messages':
                $response = sb_send_message(sb_get_bot_id(), sb_get_last_conversation_id_or_create($active_user_id, 3), sb_t($automation['message']), [], 3, '{ "event": "open-chat" }');
                sb_reports_update('message-automations');
                break;
            case 'emails':
                $response = empty($active_user['email']) ? false : sb_email_send($active_user['email'], sb_merge_fields($automation['subject']), sb_merge_fields(sb_email_default_parts($automation['message'], $active_user_id)));
                sb_reports_update('email-automations');
                break;
            case 'sms':
                $phone = sb_get_user_extra($active_user_id, 'phone');
                $response = $phone ? sb_send_sms(sb_merge_fields($automation['message']), $phone, false) : false;
                sb_reports_update('sms-automations');
                break;
            default:
                trigger_error('Invalid automation type in sb_automations_run()');
                return false;
        }
        $history = sb_get_external_setting('automations-history', []);
        $history_value = [$active_user['id'], $automation['id']];
        if (count($history) > 10000) {
            $history = array_slice($history, 1000);
        }
        if (isset($automation['repeat_id'])) {
            array_push($history_value, $automation['repeat_id']);
        }
        if ($response) {
            array_push($history, $history_value);
        }
        sb_save_external_setting('automations-history', $history);
    }
    return $response;
}

function sb_automations_is_sent($user_id, $automation, $repeat_id = false) {
    $history = sb_get_external_setting('automations-history', []);
    if ($user_id) {
        for ($x = 0, $length = count($history); $x < $length; $x++) {
            if ($history[$x][0] == $user_id && $history[$x][1] == $automation['id'] && (!$repeat_id || (count($history[$x]) > 2 && $history[$x][2] == $repeat_id))) {
                return true;
            }
        }
    }
    return false;
}

/*
 * -----------------------------------------------------------
 * CLOUD
 * -----------------------------------------------------------
 *
 * 1. Increase the membership messages count for the current month
 * 2. Check if the membership is valid
 * 3. Cloud account
 * 4. Load the config.php file
 * 5. Load cloud environment from token URL
 * 6. Load reseller js and css codes
 * 7. Add or delete agent
 * 8. Set and return cloud login data
 * 9. Check if cloud version
 *
 */

function sb_cloud_increase_count() {
    require_once(SB_CLOUD_PATH . '/account/functions.php');
    cloud_increase_count();
}

function sb_cloud_membership_validation($die = false) {
    require_once(SB_CLOUD_PATH . '/account/functions.php');
    $membership = membership_get_active();
    $expiration = DateTime::createFromFormat('d-m-y', $membership['expiration']);
    return !$membership || !isset($membership['count']) || intval($membership['count']) > intval($membership['quota']) || (isset($membership['count_agents']) && isset($membership['quota_agents']) && intval($membership['count_agents']) > intval($membership['quota_agents'])) || ($membership['price'] != 0 && (!$expiration || time() > $expiration->getTimestamp())) ? ($die ? die('account-suspended') : '<script>document.location = "' . CLOUD_URL . '/account"</script>') : '<script>var SB_CLOUD_FREE = ' . (empty($membership['id']) || $membership['id'] == 'free' ? 'true' : 'false') . '</script>';
}

function sb_cloud_account() {
    return json_decode(sb_encryption(isset($_POST['cloud']) ? $_POST['cloud'] : sb_isset($_GET, 'cloud'), false), true);
}

function sb_cloud_ajax_function_forbidden($function_name) {
    return in_array($function_name, ['installation', 'get-versions', 'update', 'app-activation', 'app-get-key', 'system-requirements', 'path']);
}

function sb_cloud_load() {
    if (!defined('SB_DB_NAME')) {
        $data = !empty($_POST['cloud']) ? $_POST['cloud'] : (!empty($_GET['cloud']) ? $_GET['cloud'] : (empty($_COOKIE['sb-cloud']) ? false : $_COOKIE['sb-cloud']));
        if ($data) {
            $cookie = json_decode(sb_encryption($data, false), true);
            $path = SB_CLOUD_PATH . '/script/config/config_' . $cookie['token'] . '.php';
            if (file_exists($path)) {
                require_once($path);
                return true;
            }
            return 'config-file-missing';
        } else
            return 'cloud-data-not-found';
    }
    return true;
}

function sb_cloud_load_by_url() {
    if (sb_is_cloud()) {
        $token = isset($_GET['envato_purchase_code']) ? $_GET['envato_purchase_code'] : (isset($_GET['cloud']) ? $_GET['cloud'] : false);
        if ($token) {
            $path = SB_CLOUD_PATH . '/script/config/config_' . $token . '.php';
            if (file_exists($path)) {
                require_once($path);
                sb_cloud_set_login($token);
            } else {
                die('Path not found [function sb_cloud_load_by_url]: ' . $path);
            }
            return $token;
        }
    }
    return false;
}

function sb_cloud_css_js() {
    require_once(SB_CLOUD_PATH . '/account/functions.php');
    cloud_css_js();
}

function sb_cloud_set_agent($email, $action = 'add', $extra = false) {
    require_once(SB_CLOUD_PATH . '/account/functions.php');
    $cloud = sb_cloud_account();
    if ($action == 'add') {
        return db_query('INSERT INTO agents(admin_id, email) VALUE ("' . $cloud['user_id'] . '", "' . $email . '")');
    }
    if ($action == 'update') {
        return db_query('UPDATE agents SET email = "' . $extra . '" WHERE email = "' . $email . '"');
    }
    if ($action == 'delete') {
        return db_query('DELETE FROM agents WHERE email = "' . $email . '"');
    }
    return false;
}

function sb_cloud_set_login($token) {
    require_once(SB_CLOUD_PATH . '/account/functions.php');
    $cloud_user = db_get('SELECT id AS `user_id`, first_name, last_name, email, password, token, stripe_customer_id FROM users WHERE token = "' . $token . '" LIMIT 1');
    if ($cloud_user) {
        $cloud_user = sb_encryption(json_encode($cloud_user));
        $_POST['cloud'] = $cloud_user;
        return $cloud_user;
    }
    return false;
}

function sb_is_cloud() {
    return defined('SB_CLOUD');
}

?>